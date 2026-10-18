using SsrsReportViewer.Api.Composition;
using SsrsReportViewer.Api.Features.ViewReport;
using SsrsReportViewer.Api.Hosting;
using SsrsReportViewer.Api.Reports;
using SsrsReportViewer.Api.Sessions;
using SsrsReportViewer.Api.Ssrs;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSsrsReportViewerServices(builder.Configuration);

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var ssrs = builder.Configuration.GetSection(SsrsOptions.SectionName).Get<SsrsOptions>() ?? new SsrsOptions();
        var origins = builder.Environment.IsDevelopment()
            ? new[] { "http://localhost:5173" }
            : ssrs.AllowedOrigins;

        if (origins.Length > 0)
        {
            policy.WithOrigins(origins)
                .AllowAnyHeader()
                .AllowAnyMethod();
        }
    });
});

var app = builder.Build();

app.UseCors();

// Feature-slice endpoint mapping (ADR-0005). Remaining routes below migrate in #65+..
app.MapSsrsReportViewerFeatureEndpoints();

// Anonymous API (ADR-0002): no authentication middleware.
app.MapGet("/api/health", () => Results.Ok(new { status = "Healthy" }));

// Proxied ReportViewer WebControl assets (CreateFixedHeaders / Html5Renderer CSS).
app.MapGet("/api/ssrs-viewer-assets/fixed-header-runtime.js", async (
    SsrsViewerAssetClient assets,
    CancellationToken cancellationToken) =>
{
    try
    {
        var viewer = await assets.GetResourceAsync("ViewerScript", cancellationToken);
        var html5 = await assets.GetResourceAsync(
            "Microsoft.ReportingServices.Rendering.HtmlRenderer.RendererResources.Html5Renderer.js",
            cancellationToken);
        var viewerText = System.Text.Encoding.UTF8.GetString(viewer.Bytes);
        var html5Text = System.Text.Encoding.UTF8.GetString(html5.Bytes);
        var runtime = FixedHeaderRuntimeBuilder.Build(viewerText, html5Text);
        return Results.Text(runtime, "application/javascript; charset=utf-8");
    }
    catch (Exception ex)
    {
        return Results.Problem(
            detail: ex.Message,
            statusCode: StatusCodes.Status502BadGateway,
            title: "ReportViewer FixedHeader runtime unavailable");
    }
});

app.MapGet("/api/ssrs-viewer-assets/{*name}", async (
    string name,
    SsrsViewerAssetClient assets,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(name) ||
        name.Contains("..", StringComparison.Ordinal) ||
        name.Contains('\\', StringComparison.Ordinal))
    {
        return Results.Problem(
            detail: "Invalid viewer asset name.",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Invalid ReportViewer asset request");
    }

    try
    {
        var resource = await assets.GetResourceAsync(name, cancellationToken);
        return Results.File(resource.Bytes, resource.ContentType);
    }
    catch (Exception ex)
    {
        return Results.Problem(
            detail: ex.Message,
            statusCode: StatusCodes.Status502BadGateway,
            title: "ReportViewer asset unavailable");
    }
});

app.MapPost("/api/sessions/{sessionId}/document-map", async (
    string sessionId,
    DocumentMapNavigateRequest request,
    ReportViewerService viewer,
    ViewerSessionGuard guard,
    ViewerSessionProblemMapper sessionProblems,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Id))
    {
        return Results.Problem(
            detail: "id is required.",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Invalid Document Map request");
    }

    return await sessionProblems.ExecuteAsync(async () =>
    {
        var result = await viewer.NavigateDocumentMapAsync(sessionId, request.Id.Trim(), guard, cancellationToken);
        return Results.Ok(SessionResponse.From(result));
    });
});

app.MapPost("/api/sessions/{sessionId}/bookmark", async (
    string sessionId,
    BookmarkNavigateRequest request,
    ReportViewerService viewer,
    ViewerSessionGuard guard,
    ViewerSessionProblemMapper sessionProblems,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Id))
    {
        return Results.Problem(
            detail: "id is required.",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Invalid Bookmark request");
    }

    return await sessionProblems.ExecuteAsync(async () =>
    {
        var result = await viewer.NavigateBookmarkAsync(sessionId, request.Id.Trim(), guard, cancellationToken);
        return Results.Ok(SessionResponse.From(result));
    });
});

app.MapGet("/api/sessions/{sessionId}/resources/{streamId}", async (
    string sessionId,
    string streamId,
    ReportViewerService viewer,
    ViewerSessionGuard guard,
    ViewerSessionProblemMapper sessionProblems,
    CancellationToken cancellationToken) =>
    await sessionProblems.ExecuteAsync(async () =>
    {
        var stream = await viewer.GetResourceAsync(sessionId, streamId, guard, cancellationToken);
        return Results.File(stream.Content, stream.MimeType);
    }));

// Drilldown (glossary) — keep /toggle as backward-compatible alias for ToggleItem.
async Task<IResult> DrilldownToggleAsync(
    string sessionId,
    ToggleRequest request,
    ReportViewerService viewer,
    ViewerSessionGuard guard,
    ViewerSessionProblemMapper sessionProblems,
    CancellationToken cancellationToken)
{
    if (string.IsNullOrWhiteSpace(request.ToggleId))
    {
        return Results.Problem(
            detail: "toggleId is required.",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Invalid Drilldown toggle request");
    }

    return await sessionProblems.ExecuteAsync(async () =>
    {
        var result = await viewer.ToggleAsync(sessionId, request.ToggleId, guard, cancellationToken);
        return Results.Ok(SessionResponse.From(result));
    });
}

app.MapPost("/api/sessions/{sessionId}/drilldown", DrilldownToggleAsync);
app.MapPost("/api/sessions/{sessionId}/toggle", DrilldownToggleAsync);

app.MapPost("/api/sessions/{sessionId}/sort", async (
    string sessionId,
    SortRequest request,
    ReportViewerService viewer,
    ViewerSessionGuard guard,
    ViewerSessionProblemMapper sessionProblems,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.SortItem))
    {
        return Results.Problem(
            detail: "sortItem is required.",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Invalid Sort request");
    }

    if (!TryParseSortDirection(request.Direction, out var direction))
    {
        return Results.Problem(
            detail: "direction must be Ascending, Descending, or None.",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Invalid Sort request");
    }

    return await sessionProblems.ExecuteAsync(async () =>
    {
        var result = await viewer.SortAsync(
            sessionId,
            request.SortItem,
            direction,
            request.Clear ?? false,
            guard,
            cancellationToken);
        return Results.Ok(SessionResponse.From(result));
    });
});

app.MapGet("/api/sessions/{sessionId}/export", async (
    string sessionId,
    string? format,
    string? pageSize,
    string? orientation,
    ReportViewerService viewer,
    ViewerSessionGuard guard,
    ViewerSessionProblemMapper sessionProblems,
    CancellationToken cancellationToken) =>
    await sessionProblems.ExecuteAsync(async () =>
    {
        try
        {
            var export = await viewer.ExportAsync(
                sessionId,
                format ?? string.Empty,
                guard,
                cancellationToken,
                pageSize,
                orientation);
            return Results.File(export.Content, export.MimeType, export.FileName);
        }
        catch (UnsupportedExportFormatException ex)
        {
            return Results.Problem(
                detail: ex.Message,
                statusCode: StatusCodes.Status400BadRequest,
                title: "Unsupported Export format");
        }
        catch (InvalidViewerInteractionException ex)
        {
            return Results.Problem(
                detail: ex.Message,
                statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid Export request");
        }
    }));

app.MapPost("/api/sessions/{sessionId}/drillthrough", async (
    string sessionId,
    DrillthroughRequest request,
    ReportViewerService viewer,
    ViewerSessionGuard guard,
    ViewerSessionProblemMapper sessionProblems,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.ReportPath))
    {
        return Results.Problem(
            detail: "reportPath is required.",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Invalid Drillthrough request");
    }

    var reportPath = ReportPath.Normalize(request.ReportPath);
    var parameters = (request.Parameters ?? [])
        .Select(p => new ParameterValue(p.Name, p.Values ?? []))
        .ToArray();

    return await sessionProblems.ExecuteAsync(async () =>
    {
        try
        {
            var result = await viewer.DrillthroughAsync(sessionId, reportPath, parameters, guard, cancellationToken);
            return Results.Ok(SessionResponse.From(result));
        }
        catch (RequiredParameterMissingException ex)
        {
            return Results.Problem(
                detail: ex.Message,
                statusCode: StatusCodes.Status400BadRequest,
                title: "Required Report Parameters missing");
        }
        catch (ReportNotFoundException ex)
        {
            return Results.Problem(
                detail: ex.Message,
                statusCode: StatusCodes.Status404NotFound,
                title: "Report not found");
        }
    });
});

app.MapPost("/api/sessions/{sessionId}/back", async (
    string sessionId,
    ReportViewerService viewer,
    ViewerSessionGuard guard,
    ViewerSessionProblemMapper sessionProblems,
    CancellationToken cancellationToken) =>
    await sessionProblems.ExecuteAsync(async () =>
    {
        try
        {
            var result = await viewer.BackAsync(sessionId, guard, cancellationToken);
            return Results.Ok(SessionResponse.From(result));
        }
        catch (BackStackEmptyException ex)
        {
            return Results.Problem(
                detail: ex.Message,
                statusCode: StatusCodes.Status400BadRequest,
                title: "Drillthrough back stack empty");
        }
    }));

static bool TryParseSortDirection(string? value, out SortDirection direction)
{
    if (string.IsNullOrWhiteSpace(value))
    {
        direction = SortDirection.Ascending;
        return true;
    }

    return Enum.TryParse(value.Trim(), ignoreCase: true, out direction);
}

app.Run();

public partial class Program;

public sealed record DocumentMapNavigateRequest(string? Id);

public sealed record BookmarkNavigateRequest(string? Id);

public sealed record ToggleRequest(string? ToggleId);

public sealed record SortRequest(string? SortItem, string? Direction, bool? Clear);

public sealed record DrillthroughRequest(string? ReportPath, ViewReportParameter[]? Parameters);

