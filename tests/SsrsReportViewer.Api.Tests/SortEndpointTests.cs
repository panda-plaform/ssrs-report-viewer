using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace SsrsReportViewer.Api.Tests;

public sealed class SortEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;
    private readonly HttpClient _client;

    public SortEndpointTests(ApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
        _factory.Fake.Reset();
        _factory.ResetSessions();
    }

    [Fact]
    public async Task Post_sort_rerenders_html_after_ssrs_sort()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: """
                  <div class="report">
                    <a href="{ReplacementRoot}?rc:SortItem=Col1&amp;rc:SortDirection=Ascending">Sort Col1</a>
                    <div class="rows" data-sort-state="{sort:Col1}">row-body</div>
                    <a href="http://reportserver.example/ReportServer?/Sales/Revenue&amp;rc:SortItem=LegacySort&amp;rc:SortDirection=Descending">Legacy sort</a>
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
        Assert.Contains("data-ssrs-action=\"sort\"", rendered.Html, StringComparison.Ordinal);
        Assert.Contains("data-ssrs-sort-item=\"Col1\"", rendered.Html, StringComparison.Ordinal);
        Assert.Contains("data-ssrs-sort-direction=\"Ascending\"", rendered.Html, StringComparison.Ordinal);
        Assert.Contains("data-ssrs-action=\"external\"", rendered.Html, StringComparison.Ordinal);
        Assert.Contains("https://contoso.example/help", rendered.Html, StringComparison.Ordinal);
        Assert.Contains("data-sort-state=\"unsorted\"", rendered.Html, StringComparison.Ordinal);

        var sort = await _client.PostAsJsonAsync(
            $"/api/sessions/{rendered.SessionId}/sort",
            new { sortItem = "Col1", direction = "Ascending", clear = false });

        Assert.Equal(HttpStatusCode.OK, sort.StatusCode);
        var sorted = await sort.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(sorted);
        Assert.Equal(rendered.SessionId, sorted.SessionId);
        Assert.Contains("data-sort-state=\"Ascending\"", sorted.Html, StringComparison.Ordinal);
        Assert.DoesNotContain("reportserver", sorted.Html, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("data-ssrs-action=\"sort\"", sorted.Html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Post_sort_returns_problem_details_when_session_missing()
    {
        var response = await _client.PostAsJsonAsync(
            "/api/sessions/missing-session/sort",
            new { sortItem = "Col1", direction = "Ascending", clear = false });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(
            problem.TryGetProperty("title", out _) || problem.TryGetProperty("detail", out _),
            "Expected ProblemDetails-shaped body");
    }

    [Fact]
    public async Task Post_sort_supports_descending_then_clear_on_same_execution()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: """
                  <div class="report">
                    <div class="rows" data-sort-state="{sort:Col1}">row-body</div>
                  </div>
                  """);

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.OK, render.StatusCode);
        var rendered = await render.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(rendered);
        Assert.Contains("data-sort-state=\"unsorted\"", rendered.Html, StringComparison.Ordinal);

        var descending = await _client.PostAsJsonAsync(
            $"/api/sessions/{rendered.SessionId}/sort",
            new { sortItem = "Col1", direction = "Descending", clear = false });
        Assert.Equal(HttpStatusCode.OK, descending.StatusCode);
        var descBody = await descending.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(descBody);
        Assert.Equal(rendered.SessionId, descBody.SessionId);
        Assert.Contains("data-sort-state=\"Descending\"", descBody.Html, StringComparison.Ordinal);

        var clear = await _client.PostAsJsonAsync(
            $"/api/sessions/{rendered.SessionId}/sort",
            new { sortItem = "Col1", direction = "None", clear = true });
        Assert.Equal(HttpStatusCode.OK, clear.StatusCode);
        var cleared = await clear.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(cleared);
        Assert.Equal(rendered.SessionId, cleared.SessionId);
        Assert.Contains("data-sort-state=\"unsorted\"", cleared.Html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Post_sort_clear_true_with_ascending_still_applies_sort()
    {
        // Native unsorted icons send ClearSort=TRUE with Ascending — Clear must not force Direction=None.
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: """
                  <div class="report">
                    <div class="rows" data-sort-state="{sort:Col1}">row-body</div>
                  </div>
                  """);

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.OK, render.StatusCode);
        var rendered = await render.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(rendered);

        var sorted = await _client.PostAsJsonAsync(
            $"/api/sessions/{rendered.SessionId}/sort",
            new { sortItem = "Col1", direction = "Ascending", clear = true });
        Assert.Equal(HttpStatusCode.OK, sorted.StatusCode);
        var body = await sorted.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(body);
        Assert.Contains("data-sort-state=\"Ascending\"", body.Html, StringComparison.Ordinal);
    }

    private sealed record SessionHtmlResponse(string SessionId, string Html);
}
