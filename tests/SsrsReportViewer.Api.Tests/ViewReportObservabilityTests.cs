using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.Logging;

namespace SsrsReportViewer.Api.Tests;

/// <summary>
/// View Report start/failure structured logs via the test-host capture seam (ADR-0006 / #62).
/// </summary>
public sealed class ViewReportObservabilityTests : IClassFixture<ApiFactory>, IDisposable
{
    private readonly ApiFactory _factory;
    private readonly HttpClient _client;

    public ViewReportObservabilityTests(ApiFactory factory)
    {
        _factory = factory;
        _factory.Fake.Reset();
        _factory.ResetSessions();
        _factory.Logs.Clear();
        _client = factory.CreateClient();
    }

    public void Dispose() => _client.Dispose();

    [Fact]
    public async Task View_report_start_emits_structured_information_with_report_path_and_operation()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: "<div>ok</div>");

        var response = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var entry = Assert.Single(
            _factory.Logs.Entries,
            e => e.Level == LogLevel.Information
                 && e.Message.Contains("View Report", StringComparison.OrdinalIgnoreCase)
                 && e.Message.Contains("start", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("/Sales/Revenue", entry.Message, StringComparison.Ordinal);
        Assert.Contains("ViewReport", entry.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task View_report_failure_emits_structured_warning_with_report_path_and_operation()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters:
            [
                new FakeReportParameter(
                    "Region",
                    "String",
                    Nullable: false,
                    MultiValue: false,
                    Prompt: "Region",
                    Required: true),
            ]);

        var response = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var start = Assert.Single(
            _factory.Logs.Entries,
            e => e.Level == LogLevel.Information
                 && e.Message.Contains("View Report", StringComparison.OrdinalIgnoreCase)
                 && e.Message.Contains("start", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("/Sales/Revenue", start.Message, StringComparison.Ordinal);
        Assert.Contains("ViewReport", start.Message, StringComparison.Ordinal);

        var failure = Assert.Single(
            _factory.Logs.Entries,
            e => e.Level >= LogLevel.Warning
                 && e.Message.Contains("View Report", StringComparison.OrdinalIgnoreCase)
                 && e.Message.Contains("fail", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("/Sales/Revenue", failure.Message, StringComparison.Ordinal);
        Assert.Contains("ViewReport", failure.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task View_report_report_not_found_emits_failure_log()
    {
        var response = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Missing/Report", parameters = Array.Empty<object>() });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        var failure = Assert.Single(
            _factory.Logs.Entries,
            e => e.Level >= LogLevel.Warning
                 && e.Message.Contains("View Report", StringComparison.OrdinalIgnoreCase)
                 && e.Message.Contains("fail", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("/Missing/Report", failure.Message, StringComparison.Ordinal);
        Assert.Contains("ViewReport", failure.Message, StringComparison.Ordinal);
    }
}
