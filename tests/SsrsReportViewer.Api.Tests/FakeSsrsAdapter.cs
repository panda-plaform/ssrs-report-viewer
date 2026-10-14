using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Tests;

/// <summary>
/// In-memory SSRS adapter for API tests. Catalog tree is seeded per test; Execution lands later.
/// </summary>
public sealed class FakeSsrsAdapter : ISsrsAdapter
{
    private readonly Dictionary<string, CatalogChildren> _catalog = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Counts any Viewer Session / Execution mutations. Catalog ListChildren must leave this at 0.
    /// </summary>
    public int ViewerSessionMutations { get; private set; }

    public void ResetCatalog()
    {
        _catalog.Clear();
        ViewerSessionMutations = 0;
    }

    public void SeedCatalog(
        string folder,
        IReadOnlyList<(string Path, string Name)> folders,
        IReadOnlyList<(string Path, string Name)> reports)
    {
        var key = NormalizePath(folder);
        _catalog[key] = new CatalogChildren(
            folders.Select(f => new CatalogItem(f.Name, NormalizePath(f.Path), CatalogItemType.Folder)).ToList(),
            reports.Select(r => new CatalogItem(r.Name, NormalizePath(r.Path), CatalogItemType.Report)).ToList());
    }

    public Task<IReadOnlyList<CatalogItem>> ListChildrenAsync(string path, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var key = NormalizePath(path);
        if (!_catalog.TryGetValue(key, out var children))
        {
            throw new CatalogPathNotFoundException(key);
        }

        IReadOnlyList<CatalogItem> items =
            [.. children.Folders, .. children.Reports];
        return Task.FromResult(items);
    }

    private static string NormalizePath(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || path == "/")
        {
            return "/";
        }

        return "/" + path.Trim().Trim('/');
    }

    private sealed record CatalogChildren(
        IReadOnlyList<CatalogItem> Folders,
        IReadOnlyList<CatalogItem> Reports);
}
