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

    /// <summary>
    /// Report Parameter metadata for a Report path.
    /// <paramref name="forRendering"/> maps to SOAP GetItemParameters ForRendering
    /// (true runs data-source queries for Valid Values; false is metadata-only).
    /// Optional values support cascading Valid Value lists.
    /// </summary>
    Task<IReadOnlyList<ReportParameterDefinition>> GetParametersAsync(
        string reportPath,
        bool forRendering,
        IReadOnlyList<ParameterValue>? valuesForCascading = null,
        CancellationToken cancellationToken = default);

    Task<ExecutionHandle> LoadReportAsync(string reportPath, CancellationToken cancellationToken = default);

    Task SetParametersAsync(
        ExecutionHandle execution,
        IReadOnlyList<ParameterValue> values,
        string culture,
        CancellationToken cancellationToken = default);

    Task<RenderResult> RenderAsync(
        ExecutionHandle execution,
        string format,
        DeviceInfo deviceInfo,
        CancellationToken cancellationToken = default);

    Task<StreamResult> RenderStreamAsync(
        ExecutionHandle execution,
        string format,
        string streamId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Toggles Drilldown show/hide for an item on the current Execution (ReportExecution2005 ToggleItem).
    /// </summary>
    Task ToggleItemAsync(
        ExecutionHandle execution,
        string toggleId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Applies or clears Sort on the current Execution (ReportExecution2005 Sort).
    /// </summary>
    Task<SortResult> SortAsync(
        ExecutionHandle execution,
        string sortItem,
        SortDirection direction,
        bool clear,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// ReportExecution2005 FindString: page of next match, or 0 if not found.
    /// Search starts at <paramref name="startPage"/>, continues to the end, wraps, and finishes on <paramref name="endPage"/>.
    /// </summary>
    Task<int> FindStringAsync(
        ExecutionHandle execution,
        int startPage,
        int endPage,
        string findValue,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Jump Execution position to a Document Map node (ReportExecution2005 NavigateDocumentMap).
    /// </summary>
    Task NavigateDocumentMapAsync(
        ExecutionHandle execution,
        string documentMapId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Jump Execution position to a Bookmark (ReportExecution2005 NavigateBookmark).
    /// </summary>
    Task NavigateBookmarkAsync(
        ExecutionHandle execution,
        string bookmarkId,
        CancellationToken cancellationToken = default);
}
