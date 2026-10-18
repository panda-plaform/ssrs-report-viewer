using SsrsReportViewer.Api.Features.Drillthrough;

namespace SsrsReportViewer.Api.Composition;

/// <summary>
/// Composition-root endpoint mapping seam (ADR-0005).
/// Feature slices register via <c>MapXxxEndpoints</c> / <see cref="MapGroup"/> here;
/// remaining routes may still be declared from <c>Program</c> until migrated.
/// </summary>
public static class EndpointRouteBuilderExtensions
{
    /// <summary>
    /// Returns the conventional Viewer Session route group for slice endpoint mapping.
    /// </summary>
    public static RouteGroupBuilder MapViewerSessionGroup(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGroup("/api/sessions/{sessionId}");

    /// <summary>
    /// Maps migrated feature-slice endpoints. Call from <c>Program</c> composition root.
    /// </summary>
    public static WebApplication MapSsrsReportViewerFeatureEndpoints(this WebApplication app)
    {
        app.MapDrillthroughEndpoints();
        return app;
    }
}
