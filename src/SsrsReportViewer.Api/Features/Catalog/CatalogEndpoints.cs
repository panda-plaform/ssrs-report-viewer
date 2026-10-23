using Microsoft.Extensions.Logging;
using SsrsReportViewer.Api.Hosting;
using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Features.Catalog;

/// <summary>
/// Catalog vertical slice: folder/report listing over <see cref="ISsrsAdapter"/> (ADR-0005).
/// </summary>
public static class CatalogEndpoints
{
    public static IEndpointRouteBuilder MapCatalogEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/catalog", ListCatalogAsync);
        return endpoints;
    }

    private static async Task<IResult> ListCatalogAsync(
        string? path,
        ISsrsAdapter ssrs,
        ILogger<CatalogEndpoint> logger,
        CancellationToken cancellationToken)
    {
        var catalogPath = ReportPath.Normalize(path);

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

            logger.LogInformation(
                "Catalog list {CatalogPath} folders {FolderCount} reports {ReportCount}",
                catalogPath,
                folders.Length,
                reports.Length);

            return Results.Ok(new { path = catalogPath, folders, reports });
        }
        catch (CatalogPathNotFoundException ex)
        {
            logger.LogWarning(
                ex,
                "Catalog path not found {CatalogPath}",
                ex.Path);
            return Results.Problem(
                detail: ex.Message,
                statusCode: StatusCodes.Status404NotFound,
                title: "Catalog path not found");
        }
    }
}

/// <summary>Marker type for <see cref="ILogger{TCategoryName}"/> category (ADR-0006).</summary>
public sealed class CatalogEndpoint;
