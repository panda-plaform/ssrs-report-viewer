using System.Net;
using System.Net.Http.Json;

namespace SsrsReportViewer.Api.Tests;

/// <summary>
/// Bookmark navigate remains host-mapped until Action Links slice (#66).
/// Kept here so Document Map (#67) owns only Document Map coverage.
/// </summary>
public sealed class BookmarkEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;
    private readonly HttpClient _client;

    public BookmarkEndpointTests(ApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
        _factory.Fake.Reset();
        _factory.ResetSessions();
    }

    [Fact]
    public async Task Post_bookmark_navigates_within_execution_and_rerenders()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: """
                  <div class="report">
                    Intro
                    <a href="{ReplacementRoot}bookmark/details" data-action="bookmark" data-bookmark-id="details">Details</a>
                  </div>
                  """,
            bookmarkHtml: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["details"] = "<div class=\"report\" data-bookmark=\"details\">Details section</div>",
            });

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });
        var rendered = await render.Content.ReadFromJsonAsync<RenderWithMapResponse>();
        Assert.NotNull(rendered);
        Assert.Contains("data-ssrs-action=\"bookmark\"", rendered.Html, StringComparison.Ordinal);
        Assert.Contains("data-ssrs-bookmark-id=\"details\"", rendered.Html, StringComparison.Ordinal);

        var response = await _client.PostAsJsonAsync(
            $"/api/sessions/{rendered.SessionId}/bookmark",
            new { id = "details" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<SessionRenderResponse>();
        Assert.NotNull(body);
        Assert.Contains("Details section", body.Html, StringComparison.Ordinal);
        Assert.Contains("data-bookmark=\"details\"", body.Html, StringComparison.Ordinal);
    }

    private sealed record RenderWithMapResponse(string SessionId, string Html);

    private sealed record SessionRenderResponse(string Html);
}
