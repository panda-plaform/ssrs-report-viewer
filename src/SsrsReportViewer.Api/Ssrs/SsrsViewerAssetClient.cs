using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using Microsoft.Extensions.Options;

namespace SsrsReportViewer.Api.Ssrs;

/// <summary>
/// NTLM fetch of ReportViewer WebControl resources (Html5Renderer, ViewerScript, CSS).
/// </summary>
public sealed class SsrsViewerAssetClient : IDisposable
{
    private static readonly ConcurrentDictionary<string, (byte[] Bytes, string ContentType)> Cache = new(
        StringComparer.OrdinalIgnoreCase);

    private readonly HttpClient _http;
    private readonly string _version;

    public SsrsViewerAssetClient(IOptions<SsrsOptions> options)
    {
        var o = options.Value;
        if (string.IsNullOrWhiteSpace(o.ReportServerBaseUrl))
        {
            throw new InvalidOperationException("Ssrs:ReportServerBaseUrl is required for viewer assets.");
        }

        var baseUri = new Uri(o.ReportServerBaseUrl.TrimEnd('/') + "/", UriKind.Absolute);
        var credentials = CreateCredentials(o, baseUri);
        var handler = new HttpClientHandler
        {
            Credentials = credentials,
            PreAuthenticate = true,
            UseDefaultCredentials = false,
            AllowAutoRedirect = true,
        };

        _http = new HttpClient(handler)
        {
            Timeout = TimeSpan.FromSeconds(Math.Max(1, o.TimeoutSeconds)),
            BaseAddress = baseUri,
        };
        _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("*/*"));
        _version = o.ReportViewerResourceVersion;
    }

    public void Dispose() => _http.Dispose();

    public async Task<(byte[] Bytes, string ContentType)> GetResourceAsync(
        string resourceName,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(resourceName))
        {
            throw new ArgumentException("resourceName is required.", nameof(resourceName));
        }

        if (Cache.TryGetValue(resourceName, out var cached))
        {
            return cached;
        }

        var path =
            $"Reserved.ReportViewerWebControl.axd?OpType=Resource&Version={Uri.EscapeDataString(_version)}&Name={Uri.EscapeDataString(resourceName)}";
        using var response = await _http.GetAsync(path, cancellationToken);
        response.EnsureSuccessStatusCode();
        var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
        var contentType = response.Content.Headers.ContentType?.ToString()
                          ?? GuessContentType(resourceName);
        var entry = (bytes, contentType);
        Cache[resourceName] = entry;
        return entry;
    }

    private static string GuessContentType(string name) =>
        name.EndsWith(".css", StringComparison.OrdinalIgnoreCase) ? "text/css; charset=utf-8"
        : name.EndsWith(".js", StringComparison.OrdinalIgnoreCase) ||
          name.Equals("ViewerScript", StringComparison.OrdinalIgnoreCase)
            ? "application/javascript; charset=utf-8"
            : "application/octet-stream";

    private static ICredentials CreateCredentials(SsrsOptions options, Uri baseUri)
    {
        if (string.IsNullOrWhiteSpace(options.Username))
        {
            return CredentialCache.DefaultNetworkCredentials;
        }

        var credential = new NetworkCredential(options.Username, options.Password, options.Domain);
        return new CredentialCache
        {
            { baseUri, "NTLM", credential },
            { baseUri, "Negotiate", credential },
        };
    }
}
