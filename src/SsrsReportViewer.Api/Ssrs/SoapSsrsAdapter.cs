using Microsoft.Extensions.Options;

namespace SsrsReportViewer.Api.Ssrs;

/// <summary>
/// Production SSRS adapter. SOAP/NTLM wiring can replace these stubs when ReportServer is available.
/// </summary>
public sealed class SoapSsrsAdapter : ISsrsAdapter
{
    private readonly SsrsOptions _options;

    public SoapSsrsAdapter(IOptions<SsrsOptions> options)
    {
        _options = options.Value;
    }

    /// <summary>Configured ReportServer base URL (server-side only; never sent to the client).</summary>
    internal string ReportServerBaseUrl => _options.ReportServerBaseUrl;

    public Task<IReadOnlyList<CatalogItem>> ListChildrenAsync(string path, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        throw new NotSupportedException(
            "SOAP ListChildren is not wired yet. Configure a real ReportServer implementation or use the fake adapter in tests.");
    }

    public Task<IReadOnlyList<ReportParameterDefinition>> GetParametersAsync(
        string reportPath,
        IReadOnlyList<ParameterValue>? valuesForCascading = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        throw new NotSupportedException(
            "SOAP GetItemParameters is not wired yet. Configure a real ReportServer implementation or use the fake adapter in tests.");
    }

    public Task<ExecutionHandle> LoadReportAsync(string reportPath, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        throw new NotSupportedException(
            "SOAP LoadReport is not wired yet. Configure a real ReportServer implementation or use the fake adapter in tests.");
    }

    public Task SetParametersAsync(
        ExecutionHandle execution,
        IReadOnlyList<ParameterValue> values,
        string culture,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        throw new NotSupportedException(
            "SOAP SetExecutionParameters is not wired yet. Configure a real ReportServer implementation or use the fake adapter in tests.");
    }

    public Task<RenderResult> RenderAsync(
        ExecutionHandle execution,
        string format,
        DeviceInfo deviceInfo,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        throw new NotSupportedException(
            "SOAP Render is not wired yet. Configure a real ReportServer implementation or use the fake adapter in tests.");
    }

    public Task<StreamResult> RenderStreamAsync(
        ExecutionHandle execution,
        string format,
        string streamId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        throw new NotSupportedException(
            "SOAP RenderStream is not wired yet. Configure a real ReportServer implementation or use the fake adapter in tests.");
    }

    public Task ToggleItemAsync(
        ExecutionHandle execution,
        string toggleId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        throw new NotSupportedException(
            "SOAP ToggleItem is not wired yet. Configure a real ReportServer implementation or use the fake adapter in tests.");
    }

    public Task NavigateDocumentMapAsync(
        ExecutionHandle execution,
        string documentMapId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        throw new NotSupportedException(
            "SOAP NavigateDocumentMap is not wired yet. Configure a real ReportServer implementation or use the fake adapter in tests.");
    }

    public Task NavigateBookmarkAsync(
        ExecutionHandle execution,
        string bookmarkId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        throw new NotSupportedException(
            "SOAP NavigateBookmark is not wired yet. Configure a real ReportServer implementation or use the fake adapter in tests.");
    }
}
