namespace SsrsReportViewer.Api.Hosting;

/// <summary>
/// Shared Catalog / Report path normalization for feature endpoint mapping.
/// </summary>
public static class ReportPath
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
