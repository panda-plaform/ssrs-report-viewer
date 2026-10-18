using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.Logging;

namespace SsrsReportViewer.Api.Tests;

/// <summary>
/// Export / Print high-signal structured logs via the HTTP + capturing-logger seam (ADR-0006 / #65).
/// </summary>
public sealed class ExportPrintObservabilityTests : IClassFixture<ApiFactory>, IDisposable
{
    private readonly ApiFactory _factory;
    private readonly HttpClient _client;

    public ExportPrintObservabilityTests(ApiFactory factory)
    {
        _factory = factory;
        _factory.Fake.Reset();
        _factory.ResetSessions();
        _factory.Logs.Clear();
        _client = factory.CreateClient();
    }

    public void Dispose() => _client.Dispose();

    [Fact]
    public async Task Export_success_emits_structured_information_with_session_report_format()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: "<div class=\"report\">Revenue</div>");

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });
        var rendered = await render.Content.ReadFromJsonAsync<RenderResponse>();
        Assert.NotNull(rendered);
        _factory.Logs.Clear();

        var response = await _client.GetAsync($"/api/sessions/{rendered.SessionId}/export?format=PDF");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var entry = Assert.Single(
            _factory.Logs.Entries,
            e => e.Message.Contains("Export", StringComparison.OrdinalIgnoreCase)
                 && e.Message.Contains("outcome", StringComparison.OrdinalIgnoreCase));
        Assert.Equal(LogLevel.Information, entry.Level);
        Assert.Contains(rendered.SessionId, entry.Message, StringComparison.Ordinal);
        Assert.Contains("/Sales/Revenue", entry.Message, StringComparison.Ordinal);
        Assert.Contains("PDF", entry.Message, StringComparison.Ordinal);
        Assert.Contains("export", entry.Message, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("print", entry.Message, StringComparison.OrdinalIgnoreCase);
        LogScopeAssertions.AssertScopeValue(entry, "SessionId", rendered.SessionId);
        LogScopeAssertions.AssertScopeValue(entry, "ReportPath", "/Sales/Revenue");
        LogScopeAssertions.AssertScopeValue(entry, "Operation", "export");
        LogScopeAssertions.AssertScopeValue(entry, "Format", "PDF");
    }

    [Fact]
    public async Task Print_pdf_settings_emits_structured_information_with_print_operation()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: "<div class=\"report\">Revenue</div>");

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });
        var rendered = await render.Content.ReadFromJsonAsync<RenderResponse>();
        Assert.NotNull(rendered);
        _factory.Logs.Clear();

        var response = await _client.GetAsync(
            $"/api/sessions/{rendered.SessionId}/export?format=PDF&pageSize=A4&orientation=Landscape");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var entry = Assert.Single(
            _factory.Logs.Entries,
            e => e.Message.Contains("outcome", StringComparison.OrdinalIgnoreCase));
        Assert.Equal(LogLevel.Information, entry.Level);
        Assert.Contains(rendered.SessionId, entry.Message, StringComparison.Ordinal);
        Assert.Contains("/Sales/Revenue", entry.Message, StringComparison.Ordinal);
        Assert.Contains("PDF", entry.Message, StringComparison.Ordinal);
        Assert.Contains("print", entry.Message, StringComparison.OrdinalIgnoreCase);
        LogScopeAssertions.AssertScopeValue(entry, "SessionId", rendered.SessionId);
        LogScopeAssertions.AssertScopeValue(entry, "ReportPath", "/Sales/Revenue");
        LogScopeAssertions.AssertScopeValue(entry, "Operation", "print");
        LogScopeAssertions.AssertScopeValue(entry, "Format", "PDF");
    }

    [Fact]
    public async Task Unsupported_export_format_emits_structured_warning()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: "<div class=\"report\">Revenue</div>");

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });
        var rendered = await render.Content.ReadFromJsonAsync<RenderResponse>();
        Assert.NotNull(rendered);
        _factory.Logs.Clear();

        var response = await _client.GetAsync($"/api/sessions/{rendered.SessionId}/export?format=ATOM");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var entry = Assert.Single(
            _factory.Logs.Entries,
            e => e.Message.Contains("Unsupported", StringComparison.OrdinalIgnoreCase)
                 || e.Message.Contains("unsupported", StringComparison.Ordinal));
        Assert.Equal(LogLevel.Warning, entry.Level);
        Assert.Contains(rendered.SessionId, entry.Message, StringComparison.Ordinal);
        Assert.Contains("ATOM", entry.Message, StringComparison.OrdinalIgnoreCase);
    }

    private sealed record RenderResponse(string SessionId);
}
