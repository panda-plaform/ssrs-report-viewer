using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.Logging;

namespace SsrsReportViewer.Api.Tests;

/// <summary>
/// High-value Microsoft.Extensions.Logging events via the test-host capture seam (ADR-0006).
/// </summary>
public sealed class ObservabilityEndpointTests : IClassFixture<ApiFactory>, IDisposable
{
    private readonly ApiFactory _factory;
    private readonly HttpClient _client;

    public ObservabilityEndpointTests(ApiFactory factory)
    {
        _factory = factory;
        _factory.Fake.Reset();
        _factory.ResetSessions();
        _factory.Logs.Clear();
        _client = factory.CreateClient();
    }

    public void Dispose() => _client.Dispose();

    [Fact]
    public async Task Viewer_session_not_found_emits_structured_warning_with_session_id()
    {
        const string sessionId = "missing-session";

        var response = await _client.PostAsJsonAsync(
            $"/api/sessions/{sessionId}/zoom",
            new { zoomPercent = 125 });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        var entry = Assert.Single(
            _factory.Logs.Entries,
            e => e.Message.Contains("not found", StringComparison.OrdinalIgnoreCase));
        Assert.Equal(LogLevel.Warning, entry.Level);
        Assert.Contains(sessionId, entry.Message, StringComparison.Ordinal);
        LogScopeAssertions.AssertScopeValue(entry, "SessionId", sessionId);
    }

    [Fact]
    public async Task Viewer_session_expired_emits_structured_warning_with_session_id()
    {
        _factory.ConfigureSessionIdleTimeout(TimeSpan.FromMinutes(20));
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: "<div>ok</div>");

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });
        var rendered = await render.Content.ReadFromJsonAsync<RenderResponse>();
        Assert.NotNull(rendered);
        _factory.Logs.Clear();

        _factory.AdvanceTime(TimeSpan.FromMinutes(21));

        var response = await _client.PostAsJsonAsync(
            $"/api/sessions/{rendered.SessionId}/refresh",
            new { });

        Assert.Equal(HttpStatusCode.Gone, response.StatusCode);

        var entry = Assert.Single(
            _factory.Logs.Entries,
            e => e.Message.Contains("expired", StringComparison.OrdinalIgnoreCase));
        Assert.Equal(LogLevel.Warning, entry.Level);
        Assert.Contains(rendered.SessionId, entry.Message, StringComparison.Ordinal);
        LogScopeAssertions.AssertScopeValue(entry, "SessionId", rendered.SessionId);
    }

    [Fact]
    public async Task Viewer_session_busy_emits_structured_warning_with_session_id()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: """<a data-ssrs-action="drilldown" data-ssrs-toggle-id="t1">x</a>""");
        _factory.Fake.ToggleDelay = TimeSpan.FromMilliseconds(400);

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });
        var body = await render.Content.ReadFromJsonAsync<RenderResponse>();
        Assert.NotNull(body);
        _factory.Logs.Clear();

        var payload = JsonContent.Create(new { toggleId = "t1" });
        var first = _client.PostAsync($"/api/sessions/{body.SessionId}/toggle", payload);
        await Task.Delay(50);
        var second = await _client.PostAsync(
            $"/api/sessions/{body.SessionId}/toggle",
            JsonContent.Create(new { toggleId = "t1" }));

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);

        var entry = Assert.Single(
            _factory.Logs.Entries,
            e => e.Message.Contains("busy", StringComparison.OrdinalIgnoreCase));
        Assert.Equal(LogLevel.Warning, entry.Level);
        Assert.Contains(body.SessionId, entry.Message, StringComparison.Ordinal);
        LogScopeAssertions.AssertScopeValue(entry, "SessionId", body.SessionId);

        var firstResponse = await first;
        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);
    }

    [Fact]
    public async Task Ssrs_adapter_fault_is_logged_without_service_account_secrets()
    {
        // Password must be configured before the host is built.
        const string secretPassword = "SuperSecret-Service-Account-Password!";
        await using var factory = new ApiFactory();
        factory.UseSsrsPassword(secretPassword);
        factory.Fake.NextListChildrenFault = new InvalidOperationException(
            "SSRS SOAP ListChildren fault: rsSomethingWentWrong");
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/api/catalog?path=/");

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);

        var entry = Assert.Single(
            factory.Logs.Entries,
            e => e.Message.Contains("SSRS", StringComparison.OrdinalIgnoreCase)
                 || e.Message.Contains("ListChildren", StringComparison.Ordinal));
        Assert.True(entry.Level >= LogLevel.Warning);
        Assert.Contains("ListChildren", entry.Message, StringComparison.Ordinal);
        Assert.DoesNotContain(secretPassword, entry.Message, StringComparison.Ordinal);
        if (entry.Exception is not null)
        {
            Assert.DoesNotContain(secretPassword, entry.Exception.ToString(), StringComparison.Ordinal);
        }

        // Body must not leak the password either (regression guard).
        var body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain(secretPassword, body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Find_outcome_emits_structured_information_with_session_report_and_operation()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            pageHtml:
            [
                "<div class=\"report\">Page one needle here</div>",
                "<div class=\"report\">Page two</div>",
            ]);

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });
        var rendered = await render.Content.ReadFromJsonAsync<RenderResponse>();
        Assert.NotNull(rendered);
        _factory.Logs.Clear();

        var response = await _client.PostAsJsonAsync(
            $"/api/sessions/{rendered.SessionId}/find",
            new { findValue = "needle" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var entry = Assert.Single(
            _factory.Logs.Entries,
            e => e.Message.Contains("Find outcome", StringComparison.Ordinal));
        Assert.Equal(LogLevel.Information, entry.Level);
        Assert.Contains(rendered.SessionId, entry.Message, StringComparison.Ordinal);
        Assert.Contains("/Sales/Revenue", entry.Message, StringComparison.Ordinal);
        Assert.Contains("find", entry.Message, StringComparison.Ordinal);
        Assert.DoesNotContain("find/next", entry.Message, StringComparison.Ordinal);
        Assert.Contains("True", entry.Message, StringComparison.Ordinal);
        LogScopeAssertions.AssertScopeValue(entry, "SessionId", rendered.SessionId);
        LogScopeAssertions.AssertScopeValue(entry, "ReportPath", "/Sales/Revenue");
        LogScopeAssertions.AssertScopeValue(entry, "Operation", "find");
    }

    [Fact]
    public async Task Find_next_outcome_emits_structured_information_with_operation()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            pageHtml:
            [
                "<div class=\"report\">first hit: needle</div>",
                "<div class=\"report\">second hit: needle</div>",
            ]);

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });
        var rendered = await render.Content.ReadFromJsonAsync<RenderResponse>();
        Assert.NotNull(rendered);

        await _client.PostAsJsonAsync(
            $"/api/sessions/{rendered.SessionId}/find",
            new { findValue = "needle" });
        _factory.Logs.Clear();

        var response = await _client.PostAsJsonAsync(
            $"/api/sessions/{rendered.SessionId}/find/next",
            new { findValue = "needle" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var entry = Assert.Single(
            _factory.Logs.Entries,
            e => e.Message.Contains("Find outcome", StringComparison.Ordinal));
        Assert.Equal(LogLevel.Information, entry.Level);
        Assert.Contains(rendered.SessionId, entry.Message, StringComparison.Ordinal);
        Assert.Contains("/Sales/Revenue", entry.Message, StringComparison.Ordinal);
        Assert.Contains("find/next", entry.Message, StringComparison.Ordinal);
        LogScopeAssertions.AssertScopeValue(entry, "SessionId", rendered.SessionId);
        LogScopeAssertions.AssertScopeValue(entry, "ReportPath", "/Sales/Revenue");
        LogScopeAssertions.AssertScopeValue(entry, "Operation", "find/next");
    }

    [Fact]
    public async Task Find_not_found_outcome_is_logged_with_found_false()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            pageHtml: ["<div class=\"report\">alpha</div>"]);

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });
        var rendered = await render.Content.ReadFromJsonAsync<RenderResponse>();
        Assert.NotNull(rendered);
        _factory.Logs.Clear();

        var response = await _client.PostAsJsonAsync(
            $"/api/sessions/{rendered.SessionId}/find",
            new { findValue = "missing-term" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var entry = Assert.Single(
            _factory.Logs.Entries,
            e => e.Message.Contains("Find outcome", StringComparison.Ordinal));
        Assert.Equal(LogLevel.Information, entry.Level);
        Assert.Contains(rendered.SessionId, entry.Message, StringComparison.Ordinal);
        Assert.Contains("/Sales/Revenue", entry.Message, StringComparison.Ordinal);
        Assert.Contains("False", entry.Message, StringComparison.Ordinal);
    }

    private sealed record RenderResponse(string SessionId);
}
