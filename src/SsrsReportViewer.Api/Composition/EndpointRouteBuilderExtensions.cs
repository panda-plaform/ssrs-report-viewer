using SsrsReportViewer.Api.Features.Infrastructure;

namespace SsrsReportViewer.Api.Composition;

/// <summary>
/// Composition-root endpoint mapping seam (ADR-0005).
/// Feature slices register via <c>MapXxxEndpoints</c> / <see cref="MapGroup"/> here (#61+);
/// remaining routes may still be declared from <c>Program</c> until those migrations land.
/// </summary>
public static class EndpointRouteBuilderExtensions
{
    /// <summary>
    /// Returns the conventional Viewer Session route group for slice endpoint mapping.
    /// </summary>
    public static RouteGroupBuilder MapViewerSessionGroup(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGroup("/api/sessions/{sessionId}");

    /// <summary>
    /// Composition entry for feature-slice endpoint mapping.
    /// Call from <c>Program</c>; slices own their <c>Map…Endpoints</c> extensions.
    /// </summary>
    public static WebApplication MapSsrsReportViewerFeatureEndpoints(this WebApplication app)
    {
        app.MapInfrastructureEndpoints();
        // Remaining feature folders migrate in #61–#68:
        //   app.MapCatalogEndpoints();
        //   app.MapViewerSessionGroup().MapZoomEndpoints();
        return app;
    }
}
