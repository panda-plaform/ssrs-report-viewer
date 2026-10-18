using SsrsReportViewer.Api.Features.ActionLinks;
using SsrsReportViewer.Api.Features.Catalog;
using SsrsReportViewer.Api.Features.DocumentMap;
using SsrsReportViewer.Api.Features.Drillthrough;
using SsrsReportViewer.Api.Features.ExportPrint;
using SsrsReportViewer.Api.Features.Find;
using SsrsReportViewer.Api.Features.Infrastructure;
using SsrsReportViewer.Api.Features.ViewReport;
using SsrsReportViewer.Api.Features.ZoomPage;

namespace SsrsReportViewer.Api.Composition;

/// <summary>
/// Composition-root endpoint mapping seam (ADR-0005).
/// Feature slices register via <c>MapXxxEndpoints</c> / <see cref="MapGroup"/> here.
/// </summary>
public static class EndpointRouteBuilderExtensions
{
    /// <summary>
    /// Returns the conventional Viewer Session route group for slice endpoint mapping.
    /// </summary>
    public static RouteGroupBuilder MapViewerSessionGroup(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGroup("/api/sessions/{sessionId}");

    /// <summary>
    /// Maps all feature-slice endpoints owned outside <c>Program</c>.
    /// </summary>
    public static WebApplication MapSsrsReportViewerFeatureEndpoints(this WebApplication app)
    {
        app.MapInfrastructureEndpoints();
        app.MapCatalogEndpoints();
        app.MapViewReportEndpoints();
        app.MapViewerSessionGroup().MapZoomPageEndpoints();
        app.MapViewerSessionGroup().MapFindEndpoints();
        app.MapViewerSessionGroup().MapExportPrintEndpoints();
        app.MapActionLinksEndpoints();
        app.MapViewerSessionGroup().MapDocumentMapEndpoints();
        app.MapDrillthroughEndpoints();
        return app;
    }
}
