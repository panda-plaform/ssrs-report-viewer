using Microsoft.Extensions.Options;

namespace SsrsReportViewer.Api.Ssrs;

/// <summary>
/// Production SSRS adapter. SOAP/NTLM ListChildren wiring can replace this stub when ReportServer is available.
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
}
