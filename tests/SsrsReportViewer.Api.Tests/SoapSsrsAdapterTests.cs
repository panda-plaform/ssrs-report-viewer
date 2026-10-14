using System.Net;
using System.Text;
using Microsoft.Extensions.Options;
using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Tests;

/// <summary>
/// Characterizes SoapSsrsAdapter against canned SSRS SOAP envelopes (no live ReportServer).
/// </summary>
public sealed class SoapSsrsAdapterTests
{
    [Fact]
    public async Task ListChildren_parses_folders_and_reports_from_ReportingService2010_response()
    {
        const string soap = """
            <?xml version="1.0" encoding="utf-8"?>
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
              <soap:Body>
                <ListChildrenResponse xmlns="http://schemas.microsoft.com/sqlserver/reporting/2010/03/01/ReportServer">
                  <ListChildrenResult>
                    <CatalogItem>
                      <Name>Sales</Name>
                      <Path>/Sales</Path>
                      <TypeName>Folder</TypeName>
                    </CatalogItem>
                    <CatalogItem>
                      <Name>Revenue</Name>
                      <Path>/Sales/Revenue</Path>
                      <TypeName>Report</TypeName>
                    </CatalogItem>
                    <CatalogItem>
                      <Name>DataSource1</Name>
                      <Path>/Sales/DataSource1</Path>
                      <TypeName>DataSource</TypeName>
                    </CatalogItem>
                  </ListChildrenResult>
                </ListChildrenResponse>
              </soap:Body>
            </soap:Envelope>
            """;

        using var adapter = CreateAdapter(soap);
        var items = await adapter.ListChildrenAsync("/");

        Assert.Equal(2, items.Count);
        Assert.Contains(items, i => i is { Name: "Sales", Path: "/Sales", Type: CatalogItemType.Folder });
        Assert.Contains(items, i => i is { Name: "Revenue", Path: "/Sales/Revenue", Type: CatalogItemType.Report });
    }

    [Fact]
    public async Task ListChildren_maps_item_not_found_fault_to_CatalogPathNotFoundException()
    {
        const string soap = """
            <?xml version="1.0" encoding="utf-8"?>
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
              <soap:Body>
                <soap:Fault>
                  <faultcode>soap:Client</faultcode>
                  <faultstring>ItemNotFoundException</faultstring>
                  <detail>
                    <ErrorCode>rsItemNotFound</ErrorCode>
                  </detail>
                </soap:Fault>
              </soap:Body>
            </soap:Envelope>
            """;

        using var adapter = CreateAdapter(soap);
        await Assert.ThrowsAsync<CatalogPathNotFoundException>(() => adapter.ListChildrenAsync("/Missing"));
    }

    private static SoapSsrsAdapter CreateAdapter(string responseXml)
    {
        var options = Options.Create(new SsrsOptions
        {
            ReportServerBaseUrl = "http://ssrs.example/ReportServer",
            Username = "svc",
            Password = "secret",
            Domain = "CONTOSO",
            TimeoutSeconds = 30,
            MaxMessageSizeBytes = 1024 * 1024,
        });

        var handler = new StubSoapHandler(responseXml);
        var transport = new SsrsSoapTransport(options, handler);
        return new SoapSsrsAdapter(options, transport);
    }

    private sealed class StubSoapHandler(string responseXml) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(responseXml, Encoding.UTF8, "text/xml"),
            };
            return Task.FromResult(response);
        }
    }
}
