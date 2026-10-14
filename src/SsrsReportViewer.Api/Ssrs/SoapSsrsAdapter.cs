using Microsoft.Extensions.Options;

namespace SsrsReportViewer.Api.Ssrs;

/// <summary>
/// Production SSRS adapter. SOAP/NTLM wiring lands with Catalog and Execution tickets.
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
}
