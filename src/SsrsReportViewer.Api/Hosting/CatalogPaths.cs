namespace SsrsReportViewer.Api.Hosting;

/// <summary>
/// Shared-kernel Catalog / Report path normalisation for feature slices.
/// </summary>
public static class CatalogPaths
{
    public static string Normalize(string? path)
    {
        if (string.IsNullOrWhiteSpace(path) || path.Trim() == "/")
        {
            return "/";
        }

        return "/" + path.Trim().Trim('/');
    }
}
