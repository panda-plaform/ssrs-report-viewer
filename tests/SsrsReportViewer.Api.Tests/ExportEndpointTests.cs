using System.Net;
using System.Net.Http.Json;
using System.Text;

namespace SsrsReportViewer.Api.Tests;

public sealed class ExportEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;
    private readonly HttpClient _client;

    public ExportEndpointTests(ApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
        _factory.Fake.Reset();
        _factory.ResetSessions();
    }

    [Theory]
    [InlineData("PDF", "application/pdf", "FAKE-PDF:")]
    [InlineData("EXCELOPENXML", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "FAKE-XLSX:")]
    [InlineData("CSV", "text/csv", "FAKE-CSV:")]
    public async Task Get_export_returns_downloadable_file_for_current_execution(
        string format,
        string expectedMediaType,
        string expectedPayloadPrefix)
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: "<div class=\"report\">Revenue</div>");

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.OK, render.StatusCode);
        var body = await render.Content.ReadFromJsonAsync<RenderResponse>();
        Assert.NotNull(body);

        var executionId = _factory.Fake.LastLoadedExecutionId;
        Assert.False(string.IsNullOrWhiteSpace(executionId));

        var response = await _client.GetAsync($"/api/sessions/{body.SessionId}/export?format={format}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(expectedMediaType, response.Content.Headers.ContentType?.MediaType);
        Assert.NotNull(response.Content.Headers.ContentDisposition);
        Assert.Equal("attachment", response.Content.Headers.ContentDisposition.DispositionType);

        var text = Encoding.UTF8.GetString(await response.Content.ReadAsByteArrayAsync());
        Assert.Equal($"{expectedPayloadPrefix}{executionId}", text);
    }

    [Fact]
    public async Task Get_export_uses_currently_displayed_execution_not_prior_one()
    {
        _factory.Fake.SeedReport("/Sales/Parent", parameters: [], html: "<div>parent</div>");
        _factory.Fake.SeedReport("/Sales/Child", parameters: [], html: "<div>child</div>");

        var parentRender = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Parent", parameters = Array.Empty<object>() });
        var parentBody = await parentRender.Content.ReadFromJsonAsync<RenderResponse>();
        Assert.NotNull(parentBody);
        var parentExecutionId = _factory.Fake.LastLoadedExecutionId!;

        // Arrange Drillthrough-style Execution swap on the same Viewer Session (see ticket #8).
        var childExecution = await _factory.Fake.LoadReportAsync("/Sales/Child");
        _factory.ReplaceSessionExecution(parentBody.SessionId, childExecution);

        var response = await _client.GetAsync($"/api/sessions/{parentBody.SessionId}/export?format=PDF");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var text = Encoding.UTF8.GetString(await response.Content.ReadAsByteArrayAsync());
        Assert.Equal($"FAKE-PDF:{childExecution.Id}", text);
        Assert.DoesNotContain(parentExecutionId, text, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Get_export_pdf_with_page_size_and_orientation_applies_device_info()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: "<div class=\"report\">Revenue</div>");

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.OK, render.StatusCode);
        var body = await render.Content.ReadFromJsonAsync<RenderResponse>();
        Assert.NotNull(body);

        var response = await _client.GetAsync(
            $"/api/sessions/{body.SessionId}/export?format=PDF&pageSize=A4&orientation=Landscape");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var deviceInfo = _factory.Fake.LastExportDeviceInfo;
        Assert.NotNull(deviceInfo);
        Assert.Equal("11.69in", deviceInfo.PageWidth);
        Assert.Equal("8.27in", deviceInfo.PageHeight);
        Assert.Null(deviceInfo.Section);
    }

    [Fact]
    public async Task Get_export_pdf_without_print_settings_omits_page_dimensions()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: "<div class=\"report\">Revenue</div>");

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });
        var body = await render.Content.ReadFromJsonAsync<RenderResponse>();
        Assert.NotNull(body);

        var response = await _client.GetAsync($"/api/sessions/{body.SessionId}/export?format=PDF");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var deviceInfo = _factory.Fake.LastExportDeviceInfo;
        Assert.NotNull(deviceInfo);
        Assert.Null(deviceInfo.PageWidth);
        Assert.Null(deviceInfo.PageHeight);
    }

    private sealed record RenderResponse(string SessionId, string Html);
}
