namespace SsrsReportViewer.Api.Ssrs;

/// <summary>
/// Replaceable seam over on-prem SSRS (ReportingService2010 / ReportExecution2005 via NTLM Service Account).
/// </summary>
public interface ISsrsAdapter
{
    /// <summary>
    /// Lists immediate child Folders and Reports under <paramref name="path"/> (ReportingService2010 ListChildren).
    /// Does not create or mutate a Viewer Session or Execution.
    /// </summary>
    Task<IReadOnlyList<CatalogItem>> ListChildrenAsync(string path, CancellationToken cancellationToken = default);
}
