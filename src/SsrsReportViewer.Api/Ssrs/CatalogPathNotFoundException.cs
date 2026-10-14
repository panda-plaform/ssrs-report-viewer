namespace SsrsReportViewer.Api.Ssrs;

/// <summary>
/// Raised when ListChildren is asked for a Catalog path that does not exist.
/// </summary>
public sealed class CatalogPathNotFoundException : Exception
{
    public CatalogPathNotFoundException(string path)
        : base($"Catalog path '{path}' was not found.")
    {
        Path = path;
    }

    public string Path { get; }
}
