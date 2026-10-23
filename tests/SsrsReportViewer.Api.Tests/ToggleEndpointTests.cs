using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace SsrsReportViewer.Api.Tests;

public sealed class ToggleEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;
    private readonly HttpClient _client;

    public ToggleEndpointTests(ApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
        _factory.Fake.Reset();
        _factory.ResetSessions();
    }

    [Fact]
    public async Task Post_toggle_rerenders_html_after_drilldown()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: """
                  <div class="report">
                    <a href="{ReplacementRoot}?rc:Toggle=Details1"><IMG SRC="{ResourceStreamRoot}2022.1.0.0TogglePlus.gif" ALT="+"/></a>
                    <div class="detail" data-toggle="Details1" data-state="{toggle:Details1}">detail-body</div>
                    <a href="http://reportserver.example/ReportServer?/Sales/Revenue&amp;rc:Toggle=LegacyToggle">Legacy toggle</a>
                    <a href="https://contoso.example/help">Help docs</a>
                  </div>
                  """);

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.OK, render.StatusCode);
        var rendered = await render.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(rendered);

        Assert.DoesNotContain("reportserver", rendered.Html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("ReportServer", rendered.Html, StringComparison.Ordinal);
        Assert.Contains("data-ssrs-action=\"drilldown\"", rendered.Html, StringComparison.Ordinal);
        Assert.Contains("data-ssrs-toggle-id=\"Details1\"", rendered.Html, StringComparison.Ordinal);
        Assert.Contains("ssrs-toggle-icon", rendered.Html, StringComparison.Ordinal);
        Assert.DoesNotContain("TogglePlus.gif", rendered.Html, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("data-ssrs-action=\"external\"", rendered.Html, StringComparison.Ordinal);
        Assert.Contains("https://contoso.example/help", rendered.Html, StringComparison.Ordinal);
        Assert.Contains("data-state=\"collapsed\"", rendered.Html, StringComparison.Ordinal);

        var toggle = await _client.PostAsJsonAsync(
            $"/api/sessions/{rendered.SessionId}/toggle",
            new { toggleId = "Details1" });

        Assert.Equal(HttpStatusCode.OK, toggle.StatusCode);
        var toggled = await toggle.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(toggled);
        Assert.Equal(rendered.SessionId, toggled.SessionId);
        Assert.Contains("data-state=\"expanded\"", toggled.Html, StringComparison.Ordinal);
        Assert.DoesNotContain("reportserver", toggled.Html, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("data-ssrs-action=\"drilldown\"", toggled.Html, StringComparison.Ordinal);
    }

    
    [Fact]
    public async Task Post_drilldown_alias_matches_toggle_behavior()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: """
                  <div class="report">
                    <a href="{ReplacementRoot}?rc:Toggle=Details1">Toggle Details</a>
                    <div class="detail" data-toggle="Details1" data-state="{toggle:Details1}">detail-body</div>
                  </div>
                  """);

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });
        var rendered = await render.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(rendered);

        var drilldown = await _client.PostAsJsonAsync(
            $"/api/sessions/{rendered.SessionId}/drilldown",
            new { toggleId = "Details1" });

        Assert.Equal(HttpStatusCode.OK, drilldown.StatusCode);
        var body = await drilldown.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(body);
        Assert.Contains("data-state=\"expanded\"", body.Html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Post_drilldown_expands_data_sources_path_before_toggle_shape()
    {
        // Fixture matches Example Reports → Data Sources: ReplacementRoot query starts with the
        // report path, then rc:Toggle (previously mis-rewritten as Drillthrough).
        _factory.Fake.SeedReport(
            "/Example Reports/Data Sources",
            parameters: [],
            html: """
                  <div class="report">
                    <a href="{ReplacementRoot}?/Example%20Reports/Data%20Sources&amp;rc:Toggle=32iT0">
                      <IMG BORDER="0" SRC="{ResourceStreamRoot}2022.1.0.0TogglePlus.gif" ALT="+"/>
                    </a>
                    <div class="detail" data-toggle="32iT0" data-state="{toggle:32iT0}">ReportServer details</div>
                    <a href="{ReplacementRoot}?/Sales/Child&amp;Region=North">Open child</a>
                  </div>
                  """);

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Example Reports/Data Sources", parameters = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.OK, render.StatusCode);
        var rendered = await render.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(rendered);

        Assert.Contains("data-ssrs-action=\"drilldown\"", rendered.Html, StringComparison.Ordinal);
        Assert.Contains("data-ssrs-toggle-id=\"32iT0\"", rendered.Html, StringComparison.Ordinal);
        Assert.Contains("ssrs-toggle-icon", rendered.Html, StringComparison.Ordinal);
        Assert.Contains("data-state=\"collapsed\"", rendered.Html, StringComparison.Ordinal);
        Assert.Contains("data-ssrs-action=\"drillthrough\"", rendered.Html, StringComparison.Ordinal);
        Assert.DoesNotContain(
            "data-ssrs-action=\"drillthrough\" data-ssrs-report-path=\"/Example Reports/Data Sources\"",
            rendered.Html,
            StringComparison.Ordinal);

        var drilldown = await _client.PostAsJsonAsync(
            $"/api/sessions/{rendered.SessionId}/drilldown",
            new { toggleId = "32iT0" });

        Assert.Equal(HttpStatusCode.OK, drilldown.StatusCode);
        var toggled = await drilldown.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(toggled);
        Assert.Contains("data-state=\"expanded\"", toggled.Html, StringComparison.Ordinal);
        Assert.Contains("data-ssrs-action=\"drilldown\"", toggled.Html, StringComparison.Ordinal);
        Assert.Contains("data-ssrs-toggle-id=\"32iT0\"", toggled.Html, StringComparison.Ordinal);
    }

[Fact]
    public async Task Post_toggle_returns_problem_details_when_session_missing()
    {
        var response = await _client.PostAsJsonAsync(
            "/api/sessions/missing-session/toggle",
            new { toggleId = "Details1" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(
            problem.TryGetProperty("title", out _) || problem.TryGetProperty("detail", out _),
            "Expected ProblemDetails-shaped body");
    }

    private sealed record SessionHtmlResponse(string SessionId, string Html);
}
