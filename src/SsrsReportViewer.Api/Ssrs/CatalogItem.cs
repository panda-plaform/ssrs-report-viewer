namespace SsrsReportViewer.Api.Ssrs;

public enum CatalogItemType
{
    Folder,
    Report,
}

/// <summary>
/// A Folder or Report node in the Catalog (paginated RDL Reports only in v1).
/// </summary>
public sealed record CatalogItem(string Name, string Path, CatalogItemType Type);
