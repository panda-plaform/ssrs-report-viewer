using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Microsoft.Extensions.Options;

namespace SsrsReportViewer.Api.Ssrs;

/// <summary>
/// NTLM SOAP transport for ReportingService2010 / ReportExecution2005 (ADR-0001 / ADR-0002).
/// Builds envelopes against the well-known SSRS ASMX contracts; live WSDL is not required to compile.
/// </summary>
public sealed class SsrsSoapTransport : IDisposable
{
    public const string ManagementNamespace =
        "http://schemas.microsoft.com/sqlserver/reporting/2010/03/01/ReportServer";

    /// <summary>
    /// ReportExecution2005 target namespace as advertised by ReportExecution2005.asmx?wsdl.
    /// (Not the older docs URI …/reporting/2005/06/01/reportingservices — that SOAPAction is rejected.)
    /// </summary>
    public const string ExecutionNamespace =
        "http://schemas.microsoft.com/sqlserver/2005/06/30/reporting/reportingservices";

    private static readonly XNamespace SoapNs = "http://schemas.xmlsoap.org/soap/envelope/";
    private static readonly XNamespace XsiNs = "http://www.w3.org/2001/XMLSchema-instance";

    private readonly HttpClient _http;
    private readonly Uri _managementUri;
    private readonly Uri _executionUri;

    public SsrsSoapTransport(IOptions<SsrsOptions> options)
        : this(options, handler: null)
    {
    }

    internal SsrsSoapTransport(IOptions<SsrsOptions> options, HttpMessageHandler? handler)
    {
        var o = options.Value;
        if (string.IsNullOrWhiteSpace(o.ReportServerBaseUrl))
        {
            throw new InvalidOperationException("Ssrs:ReportServerBaseUrl is required for SOAP SSRS access.");
        }

        var baseUri = new Uri(o.ReportServerBaseUrl.TrimEnd('/') + "/", UriKind.Absolute);
        _managementUri = new Uri(baseUri, "ReportService2010.asmx");
        _executionUri = new Uri(baseUri, "ReportExecution2005.asmx");

        var credentials = CreateCredentials(o, baseUri);
        var ownedHandler = handler ?? new HttpClientHandler
        {
            Credentials = credentials,
            PreAuthenticate = true,
            UseDefaultCredentials = false,
            AllowAutoRedirect = true,
        };

        _http = new HttpClient(ownedHandler, disposeHandler: handler is null)
        {
            Timeout = TimeSpan.FromSeconds(Math.Max(1, o.TimeoutSeconds)),
            MaxResponseContentBufferSize = Math.Max(1024, o.MaxMessageSizeBytes),
        };
        _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("text/xml"));
    }

    public void Dispose() => _http.Dispose();

    public Task<XDocument> InvokeManagementAsync(
        string operation,
        XElement body,
        CancellationToken cancellationToken) =>
        InvokeAsync(_managementUri, ManagementNamespace, operation, body, executionId: null, cancellationToken);

    public Task<(XDocument Document, string? ExecutionId)> InvokeExecutionAsync(
        string operation,
        XElement body,
        string? executionId,
        CancellationToken cancellationToken) =>
        InvokeWithExecutionHeaderAsync(_executionUri, ExecutionNamespace, operation, body, executionId, cancellationToken);

    private async Task<XDocument> InvokeAsync(
        Uri endpoint,
        string ns,
        string operation,
        XElement body,
        string? executionId,
        CancellationToken cancellationToken)
    {
        var (document, _) = await InvokeWithExecutionHeaderAsync(
            endpoint,
            ns,
            operation,
            body,
            executionId,
            cancellationToken);
        return document;
    }

    private async Task<(XDocument Document, string? ExecutionId)> InvokeWithExecutionHeaderAsync(
        Uri endpoint,
        string ns,
        string operation,
        XElement body,
        string? executionId,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var envelope = new XElement(
            SoapNs + "Envelope",
            new XAttribute(XNamespace.Xmlns + "soap", SoapNs.NamespaceName),
            new XAttribute(XNamespace.Xmlns + "xsi", XsiNs.NamespaceName),
            CreateHeader(executionId),
            new XElement(SoapNs + "Body", body));

        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
        request.Headers.TryAddWithoutValidation("SOAPAction", $"\"{ns}/{operation}\"");
        request.Content = new StringContent(envelope.ToString(SaveOptions.DisableFormatting), Encoding.UTF8, "text/xml");

        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellationToken);
        var xml = await response.Content.ReadAsStringAsync(cancellationToken);
        XDocument document;
        try
        {
            document = XDocument.Parse(xml);
        }
        catch (Exception ex) when (ex is System.Xml.XmlException)
        {
            throw new InvalidOperationException(
                $"SSRS SOAP response from {operation} was not valid XML (HTTP {(int)response.StatusCode}).",
                ex);
        }

        ThrowIfFault(document, operation);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                $"SSRS SOAP {operation} failed with HTTP {(int)response.StatusCode} {response.ReasonPhrase}.");
        }

        var responseExecutionId = ReadExecutionId(document) ?? executionId;
        return (document, responseExecutionId);
    }

    private static XElement? CreateHeader(string? executionId)
    {
        if (string.IsNullOrWhiteSpace(executionId))
        {
            return null;
        }

        XNamespace exec = ExecutionNamespace;
        return new XElement(
            SoapNs + "Header",
            new XElement(exec + "ExecutionHeader", new XElement(exec + "ExecutionID", executionId)));
    }

    private static string? ReadExecutionId(XDocument document)
    {
        XNamespace exec = ExecutionNamespace;
        return document
            .Descendants(exec + "ExecutionID")
            .Select(e => e.Value)
            .FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));
    }

    private static void ThrowIfFault(XDocument document, string operation)
    {
        var fault = document.Descendants(SoapNs + "Fault").FirstOrDefault();
        if (fault is null)
        {
            return;
        }

        var faultString = fault.Element("faultstring")?.Value
                          ?? fault.Elements().FirstOrDefault(e => e.Name.LocalName == "faultstring")?.Value
                          ?? $"SOAP fault from {operation}.";
        var detail = string.Concat(fault.Descendants().Select(e => e.Value));

        if (detail.Contains("rsItemNotFound", StringComparison.OrdinalIgnoreCase) ||
            faultString.Contains("ItemNotFound", StringComparison.OrdinalIgnoreCase) ||
            faultString.Contains("not found", StringComparison.OrdinalIgnoreCase))
        {
            throw new CatalogPathNotFoundException(faultString);
        }

        if (detail.Contains("rsExecutionNotFound", StringComparison.OrdinalIgnoreCase) ||
            faultString.Contains("ExecutionNotFound", StringComparison.OrdinalIgnoreCase))
        {
            throw new ExecutionNotFoundException(faultString);
        }

        if (detail.Contains("rsReportParameterValueNotSet", StringComparison.OrdinalIgnoreCase) ||
            faultString.Contains("ReportParameterValueNotSet", StringComparison.OrdinalIgnoreCase) ||
            faultString.Contains("ParameterValueNotSet", StringComparison.OrdinalIgnoreCase))
        {
            throw new ParameterValueNotSetException(
                TryParseParameterNameFromFault(faultString),
                faultString);
        }

        throw new InvalidOperationException($"SSRS SOAP {operation} fault: {faultString}");
    }

    private static readonly Regex ParameterNameInFaultRegex = new(
        @"report parameter '([^']+)'",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static string? TryParseParameterNameFromFault(string faultString)
    {
        var match = ParameterNameInFaultRegex.Match(faultString);
        return match.Success ? match.Groups[1].Value : null;
    }

    private static ICredentials CreateCredentials(SsrsOptions options, Uri baseUri)
    {
        if (string.IsNullOrWhiteSpace(options.Username))
        {
            return CredentialCache.DefaultNetworkCredentials;
        }

        var credential = new NetworkCredential(options.Username, options.Password, options.Domain);
        var cache = new CredentialCache
        {
            { baseUri, "NTLM", credential },
            { baseUri, "Negotiate", credential },
        };
        return cache;
    }

    public static XElement Nil(XName name) =>
        new(name, new XAttribute(XsiNs + "nil", "true"));
}
