using SsrsReportViewer.Api.Composition;
using SsrsReportViewer.Api.Hosting;
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

// Feature-slice endpoint mapping (ADR-0005). Remaining host routes migrate in #69.
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

app.Run();

public partial class Program;
