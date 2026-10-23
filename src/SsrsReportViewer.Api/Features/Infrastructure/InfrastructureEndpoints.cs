using System.Text;
using Microsoft.Extensions.Logging;
using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Features.Infrastructure;

/// <summary>
/// Host/infrastructure slice: health and SSRS viewer-asset proxy (ADR-0005 / #69).
/// </summary>
public static class InfrastructureEndpoints
{
    /// <summary>Logger category type for ReportViewer asset proxy (ADR-0006).</summary>
    public sealed class ViewerAssetsLog;

    public static IEndpointRouteBuilder MapInfrastructureEndpoints(this IEndpointRouteBuilder app)
    {
        // Anonymous API (ADR-0002): no authentication middleware.
        app.MapGet("/api/health", () => Results.Ok(new { status = "Healthy" }));

        // Proxied ReportViewer WebControl assets (CreateFixedHeaders / Html5Renderer CSS).
        app.MapGet("/api/ssrs-viewer-assets/fixed-header-runtime.js", async (
            SsrsViewerAssetClient assets,
            ILogger<ViewerAssetsLog> logger,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var viewer = await assets.GetResourceAsync("ViewerScript", cancellationToken);
                var html5 = await assets.GetResourceAsync(
                    "Microsoft.ReportingServices.Rendering.HtmlRenderer.RendererResources.Html5Renderer.js",
                    cancellationToken);
                var viewerText = Encoding.UTF8.GetString(viewer.Bytes);
                var html5Text = Encoding.UTF8.GetString(html5.Bytes);
                var runtime = FixedHeaderRuntimeBuilder.Build(viewerText, html5Text);
                return Results.Text(runtime, "application/javascript; charset=utf-8");
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "ReportViewer FixedHeader runtime unavailable");
                return Results.Problem(
                    detail: ex.Message,
                    statusCode: StatusCodes.Status502BadGateway,
                    title: "ReportViewer FixedHeader runtime unavailable");
            }
        });

        app.MapGet("/api/ssrs-viewer-assets/{*name}", async (
            string name,
            SsrsViewerAssetClient assets,
            ILogger<ViewerAssetsLog> logger,
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
                logger.LogWarning(ex, "ReportViewer asset unavailable for {AssetName}", name);
                return Results.Problem(
                    detail: ex.Message,
                    statusCode: StatusCodes.Status502BadGateway,
                    title: "ReportViewer asset unavailable");
            }
        });

        return app;
    }
}
