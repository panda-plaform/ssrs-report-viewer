namespace SsrsReportViewer.Api.Composition;

/// <summary>
/// Composition-root endpoint mapping seam (ADR-0005).
/// Feature slices will register via <c>MapXxxEndpoints</c> / <see cref="MapGroup"/> here (#61+);
/// routes may still be declared from <c>Program</c> until those migrations land.
/// </summary>
public static class EndpointRouteBuilderExtensions
{
    /// <summary>
    /// Returns the conventional Viewer Session route group for slice endpoint mapping.
    /// </summary>
    public static RouteGroupBuilder MapViewerSessionGroup(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGroup("/api/sessions/{sessionId}");

    /// <summary>
    /// Placeholder composition entry for feature-slice endpoint mapping.
    /// Call from <c>Program</c> once slices own their <c>Map…Endpoints</c> extensions.
    /// </summary>
    public static WebApplication MapSsrsReportViewerFeatureEndpoints(this WebApplication app)
    {
        // Intentionally empty for #60: Catalog / View Report / session feature folders migrate in #61+.
        // Example for a future slice:
        //   app.MapCatalogEndpoints();
        //   app.MapViewerSessionGroup().MapZoomEndpoints();
        return app;
    }
}
