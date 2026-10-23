using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace SsrsReportViewer.Api.Tests;

public sealed class DocumentMapVisibilityEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;
    private readonly HttpClient _client;

    public DocumentMapVisibilityEndpointTests(ApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
        _factory.Fake.Reset();
        _factory.ResetSessions();
    }

    [Fact]
    public async Task Post_render_defaults_document_map_visible_to_true()
    {
        SeedPlainReport();

        var response = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Plain", parameters = Array.Empty<object>() });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(ReadDocumentMapVisible(json));
    }

    [Fact]
    public async Task Post_render_applies_document_map_visibility_seed()
    {
        SeedPlainReport();

        var response = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new
            {
                reportPath = "/Sales/Plain",
                parameters = Array.Empty<object>(),
                documentMapVisible = false,
            });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(ReadDocumentMapVisible(json));
    }

    [Fact]
    public async Task Post_document_map_visibility_updates_flag_without_ssrs_re_render()
    {
        SeedPlainReport();

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Plain", parameters = Array.Empty<object>() });
        var rendered = await render.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(ReadDocumentMapVisible(rendered));
        var sessionId = rendered.GetProperty("sessionId").GetString();
        Assert.False(string.IsNullOrWhiteSpace(sessionId));
        var html = rendered.GetProperty("html").GetString();
        Assert.False(string.IsNullOrWhiteSpace(html));

        var mutationsBefore = _factory.Fake.ViewerSessionMutations;
        var lastRenderedBefore = _factory.Fake.LastRenderedExecutionId;

        var response = await _client.PostAsJsonAsync(
            $"/api/sessions/{sessionId}/document-map/visibility",
            new { visible = false });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(sessionId, body.GetProperty("sessionId").GetString());
        Assert.False(ReadDocumentMapVisible(body));
        Assert.Equal(html, body.GetProperty("html").GetString());
        Assert.Equal(mutationsBefore, _factory.Fake.ViewerSessionMutations);
        Assert.Equal(lastRenderedBefore, _factory.Fake.LastRenderedExecutionId);
    }

    [Fact]
    public async Task Document_map_visibility_survives_zoom_page_and_refresh()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: "<div class=\"report\">Revenue</div>",
            pageCount: 2);

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new
            {
                reportPath = "/Sales/Revenue",
                parameters = Array.Empty<object>(),
                documentMapVisible = false,
            });
        var rendered = await render.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(ReadDocumentMapVisible(rendered));
        var sessionId = rendered.GetProperty("sessionId").GetString();
        Assert.False(string.IsNullOrWhiteSpace(sessionId));

        var zoom = await _client.PostAsJsonAsync(
            $"/api/sessions/{sessionId}/zoom",
            new { zoomPercent = 150 });
        Assert.Equal(HttpStatusCode.OK, zoom.StatusCode);
        Assert.False(ReadDocumentMapVisible(await zoom.Content.ReadFromJsonAsync<JsonElement>()));

        var page = await _client.PostAsJsonAsync(
            $"/api/sessions/{sessionId}/page",
            new { action = "next" });
        Assert.Equal(HttpStatusCode.OK, page.StatusCode);
        Assert.False(ReadDocumentMapVisible(await page.Content.ReadFromJsonAsync<JsonElement>()));

        var refresh = await _client.PostAsJsonAsync(
            $"/api/sessions/{sessionId}/refresh",
            new { });
        Assert.Equal(HttpStatusCode.OK, refresh.StatusCode);
        Assert.False(ReadDocumentMapVisible(await refresh.Content.ReadFromJsonAsync<JsonElement>()));
    }

    [Fact]
    public async Task Post_document_map_visibility_on_expired_session_hard_fails()
    {
        _factory.ConfigureSessionIdleTimeout(TimeSpan.FromMinutes(20));
        SeedPlainReport();

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Plain", parameters = Array.Empty<object>() });
        var rendered = await render.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = rendered.GetProperty("sessionId").GetString();
        Assert.False(string.IsNullOrWhiteSpace(sessionId));

        _factory.AdvanceTime(TimeSpan.FromMinutes(21));

        var response = await _client.PostAsJsonAsync(
            $"/api/sessions/{sessionId}/document-map/visibility",
            new { visible = false });

        Assert.Equal(HttpStatusCode.Gone, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(
            problem.TryGetProperty("title", out _) || problem.TryGetProperty("detail", out _),
            "Expected ProblemDetails-shaped body");
    }

    private void SeedPlainReport()
    {
        _factory.Fake.SeedReport(
            "/Sales/Plain",
            parameters: [],
            html: "<div class=\"report\">Plain</div>");
    }

    private static bool ReadDocumentMapVisible(JsonElement json)
    {
        Assert.True(
            json.TryGetProperty("documentMapVisible", out var visible),
            "Expected documentMapVisible on session payload");
        Assert.True(
            visible.ValueKind is JsonValueKind.True or JsonValueKind.False,
            "documentMapVisible must be a boolean");
        return visible.GetBoolean();
    }
}
