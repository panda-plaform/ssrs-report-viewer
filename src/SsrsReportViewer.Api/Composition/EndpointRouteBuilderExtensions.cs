using SsrsReportViewer.Api.Features.ActionLinks;

namespace SsrsReportViewer.Api.Composition;

/// <summary>
/// Composition-root endpoint mapping seam (ADR-0005).
/// Feature slices register via <c>MapXxxEndpoints</c> / <see cref="MapGroup"/> here;
/// remaining routes stay in <c>Program</c> until their migrate tickets land.
/// </summary>
public static class EndpointRouteBuilderExtensions
{
    /// <summary>
    /// Returns the conventional Viewer Session route group for slice endpoint mapping.
    /// </summary>
    public static RouteGroupBuilder MapViewerSessionGroup(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGroup("/api/sessions/{sessionId}");

    /// <summary>
    /// Maps feature-slice endpoints owned outside <c>Program</c>.
    /// </summary>
    public static WebApplication MapSsrsReportViewerFeatureEndpoints(this WebApplication app)
    {
        app.MapActionLinksEndpoints();
        return app;
    }
}
