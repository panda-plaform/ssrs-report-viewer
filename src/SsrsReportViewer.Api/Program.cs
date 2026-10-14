using SsrsReportViewer.Api.Reports;
using SsrsReportViewer.Api.Sessions;
using SsrsReportViewer.Api.Ssrs;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<SsrsOptions>(builder.Configuration.GetSection(SsrsOptions.SectionName));
builder.Services.AddSingleton<ISsrsAdapter, SoapSsrsAdapter>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IViewerSessionStore, ViewerSessionStore>();
builder.Services.AddSingleton<ViewerSessionGuard>();
builder.Services.AddSingleton<ReportViewerService>();
builder.Services.AddProblemDetails();

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

// Anonymous API (ADR-0002): no authentication middleware.
app.MapGet("/api/health", () => Results.Ok(new { status = "Healthy" }));

app.MapGet("/api/catalog", async (string? path, ISsrsAdapter ssrs, CancellationToken cancellationToken) =>
{
    var catalogPath = NormalizeCatalogPath(path);

    try
    {
        var items = await ssrs.ListChildrenAsync(catalogPath, cancellationToken);
        var folders = items
            .Where(i => i.Type == CatalogItemType.Folder)
            .Select(i => new { name = i.Name, path = i.Path })
            .ToArray();
        var reports = items
            .Where(i => i.Type == CatalogItemType.Report)
            .Select(i => new { name = i.Name, path = i.Path })
            .ToArray();

        return Results.Ok(new { path = catalogPath, folders, reports });
    }
    catch (CatalogPathNotFoundException ex)
    {
        return Results.Problem(
            detail: ex.Message,
            statusCode: StatusCodes.Status404NotFound,
            title: "Catalog path not found");
    }
});

app.MapGet("/api/reports/parameters", async (
    string? path,
    ReportViewerService viewer,
    CancellationToken cancellationToken) =>
{
    var reportPath = NormalizeCatalogPath(path);
    try
    {
        var parameters = await viewer.GetParametersAsync(reportPath, valuesForCascading: null, cancellationToken);
        return Results.Ok(new
        {
            path = reportPath,
            parameters = parameters.Select(p => new
            {
                name = p.Name,
                dataType = p.DataType,
                nullable = p.Nullable,
                multiValue = p.MultiValue,
                required = p.Required,
                prompt = p.Prompt,
                defaultValues = p.DefaultValues,
                validValues = p.ValidValues.Select(v => new { label = v.Label, value = v.Value }),
                dependencies = p.Dependencies,
            }),
        });
    }
    catch (ReportNotFoundException ex)
    {
        return Results.Problem(
            detail: ex.Message,
            statusCode: StatusCodes.Status404NotFound,
            title: "Report not found");
    }
});

app.MapPost("/api/reports/render", async (
    ViewReportRequest request,
    ReportViewerService viewer,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.ReportPath))
    {
        return Results.Problem(
            detail: "reportPath is required.",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Invalid View Report request");
    }

    var reportPath = NormalizeCatalogPath(request.ReportPath);
    var parameters = (request.Parameters ?? [])
        .Select(p => new ParameterValue(p.Name, p.Values ?? []))
        .ToArray();

    try
    {
        var result = await viewer.ViewReportAsync(reportPath, parameters, cancellationToken);
        return Results.Ok(ToSessionPayload(result.SessionId, result.Html, result.PageInfo, result.DocumentMap));
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

app.MapPost("/api/sessions/{sessionId}/document-map", async (
    string sessionId,
    DocumentMapNavigateRequest request,
    ReportViewerService viewer,
    ViewerSessionGuard guard,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Id))
    {
        return Results.Problem(
            detail: "id is required.",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Invalid Document Map request");
    }

    try
    {
        var result = await viewer.NavigateDocumentMapAsync(sessionId, request.Id.Trim(), guard, cancellationToken);
        return Results.Ok(ToSessionPayload(result.SessionId, result.Html, result.PageInfo, result.DocumentMap));
    }
    catch (ViewerSessionNotFoundException ex)
    {
        return Results.Problem(
            detail: ex.Message,
            statusCode: StatusCodes.Status404NotFound,
            title: "Viewer Session not found");
    }
    catch (ViewerSessionExpiredException ex)
    {
        return Results.Problem(
            detail: ex.Message,
            statusCode: StatusCodes.Status410Gone,
            title: "Viewer Session expired");
    }
    catch (ViewerSessionBusyException ex)
    {
        return Results.Problem(
            detail: ex.Message,
            statusCode: StatusCodes.Status409Conflict,
            title: "Viewer Session busy");
    }
});

app.MapPost("/api/sessions/{sessionId}/bookmark", async (
    string sessionId,
    BookmarkNavigateRequest request,
    ReportViewerService viewer,
    ViewerSessionGuard guard,
    CancellationToken cancellationToken) =>
{
    if (string.IsNullOrWhiteSpace(request.Id))
    {
        return Results.Problem(
            detail: "id is required.",
            statusCode: StatusCodes.Status400BadRequest,
            title: "Invalid Bookmark request");
    }

    try
    {
        var result = await viewer.NavigateBookmarkAsync(sessionId, request.Id.Trim(), guard, cancellationToken);
        return Results.Ok(ToSessionPayload(result.SessionId, result.Html, result.PageInfo, result.DocumentMap));
    }
    catch (ViewerSessionNotFoundException ex)
    {
        return Results.Problem(
            detail: ex.Message,
            statusCode: StatusCodes.Status404NotFound,
            title: "Viewer Session not found");
    }
    catch (ViewerSessionExpiredException ex)
    {
        return Results.Problem(
            detail: ex.Message,
            statusCode: StatusCodes.Status410Gone,
            title: "Viewer Session expired");
    }
    catch (ViewerSessionBusyException ex)
    {
        return Results.Problem(
            detail: ex.Message,
            statusCode: StatusCodes.Status409Conflict,
            title: "Viewer Session busy");
    }
});

app.MapGet("/api/sessions/{sessionId}/resources/{streamId}", async (
    string sessionId,
    string streamId,
    ReportViewerService viewer,
    ViewerSessionGuard guard,
    CancellationToken cancellationToken) =>
{
    try
    {
        var stream = await viewer.GetResourceAsync(sessionId, streamId, guard, cancellationToken);
        return Results.File(stream.Content, stream.MimeType);
    }
    catch (ViewerSessionNotFoundException ex)
    {
        return Results.Problem(
            detail: ex.Message,
            statusCode: StatusCodes.Status404NotFound,
            title: "Viewer Session not found");
    }
    catch (ViewerSessionExpiredException ex)
    {
        return Results.Problem(
            detail: ex.Message,
            statusCode: StatusCodes.Status410Gone,
            title: "Viewer Session expired");
    }
    catch (ViewerSessionBusyException ex)
    {
        return Results.Problem(
            detail: ex.Message,
            statusCode: StatusCodes.Status409Conflict,
            title: "Viewer Session busy");
    }
});

static string NormalizeCatalogPath(string? path)
{
    if (string.IsNullOrWhiteSpace(path) || path.Trim() == "/")
    {
        return "/";
    }

    return "/" + path.Trim().Trim('/');
}

static object ToSessionPayload(
    string sessionId,
    string html,
    PageInfo pageInfo,
    IReadOnlyList<DocumentMapNode>? documentMap) =>
    new
    {
        sessionId,
        html,
        pageInfo = new
        {
            currentPage = pageInfo.CurrentPage,
            pageCount = pageInfo.PageCount,
        },
        documentMap = documentMap?.Select(MapDocumentMapNode).ToArray(),
    };

static object MapDocumentMapNode(DocumentMapNode node) =>
    new
    {
        id = node.Id,
        label = node.Label,
        children = node.Children.Select(MapDocumentMapNode).ToArray(),
    };

app.Run();

public partial class Program;

public sealed record ViewReportRequest(string? ReportPath, ViewReportParameter[]? Parameters);

public sealed record ViewReportParameter(string Name, string[]? Values);

public sealed record DocumentMapNavigateRequest(string? Id);

public sealed record BookmarkNavigateRequest(string? Id);
