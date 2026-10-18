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

// Feature-slice endpoint mapping (ADR-0005). Remaining routes below migrate in #67+.
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

app.Run();

public partial class Program;

public sealed record DocumentMapNavigateRequest(string? Id);

public sealed record DrillthroughRequest(string? ReportPath, ViewReportParameter[]? Parameters);
