using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace SsrsReportViewer.Api.Tests;

public sealed class DocumentMapEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;
    private readonly HttpClient _client;

    public DocumentMapEndpointTests(ApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
        _factory.Fake.Reset();
        _factory.ResetSessions();
    }

    [Fact]
    public async Task Post_render_exposes_document_map_when_present()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: "<div class=\"report\">Revenue</div>",
            documentMap:
            [
                new FakeDocumentMapNode(
                    "root",
                    "Revenue",
                    [
                        new FakeDocumentMapNode("north", "North Region"),
                        new FakeDocumentMapNode("south", "South Region"),
                    ]),
            ]);

        var response = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<RenderWithMapResponse>();
        Assert.NotNull(body);
        Assert.False(string.IsNullOrWhiteSpace(body.SessionId));
        Assert.NotNull(body.DocumentMap);
        var root = Assert.Single(body.DocumentMap);
        Assert.Equal("root", root.Id);
        Assert.Equal("Revenue", root.Label);
        Assert.NotNull(root.Children);
        Assert.Equal(2, root.Children.Length);
        Assert.Contains(root.Children, n => n is { Id: "north", Label: "North Region" });
        Assert.Contains(root.Children, n => n is { Id: "south", Label: "South Region" });
    }

    [Fact]
    public async Task Post_render_omits_document_map_when_absent()
    {
        _factory.Fake.SeedReport(
            "/Sales/Plain",
            parameters: [],
            html: "<div class=\"report\">Plain</div>");

        var response = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Plain", parameters = Array.Empty<object>() });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(json.TryGetProperty("documentMap", out var map));
        Assert.Equal(JsonValueKind.Null, map.ValueKind);
    }

    [Fact]
    public async Task Post_document_map_navigates_and_returns_updated_html()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: "<div class=\"report\" data-section=\"home\">Home</div>",
            documentMap:
            [
                new FakeDocumentMapNode("north", "North Region"),
            ],
            documentMapHtml: new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["north"] = "<div class=\"report\" data-section=\"north\">North Region body</div>",
            });

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });
        var rendered = await render.Content.ReadFromJsonAsync<RenderWithMapResponse>();
        Assert.NotNull(rendered);

        var response = await _client.PostAsJsonAsync(
            $"/api/sessions/{rendered.SessionId}/document-map",
            new { id = "north" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<SessionRenderResponse>();
        Assert.NotNull(body);
        Assert.Contains("North Region body", body.Html, StringComparison.Ordinal);
        Assert.DoesNotContain("data-section=\"home\"", body.Html, StringComparison.Ordinal);
        Assert.NotNull(body.DocumentMap);
        Assert.Contains(body.DocumentMap, n => n.Id == "north");
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
        Assert.Contains(
            $"/api/sessions/{rendered.SessionId}/actions/bookmark/details",
            rendered.Html,
            StringComparison.Ordinal);

        var response = await _client.PostAsJsonAsync(
            $"/api/sessions/{rendered.SessionId}/bookmark",
            new { id = "details" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<SessionRenderResponse>();
        Assert.NotNull(body);
        Assert.Contains("Details section", body.Html, StringComparison.Ordinal);
        Assert.Contains("data-bookmark=\"details\"", body.Html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Document_map_navigation_on_expired_session_hard_fails()
    {
        _factory.ConfigureSessionIdleTimeout(TimeSpan.FromMinutes(20));
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: "<div>ok</div>",
            documentMap: [new FakeDocumentMapNode("north", "North")]);

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });
        var rendered = await render.Content.ReadFromJsonAsync<RenderWithMapResponse>();
        Assert.NotNull(rendered);

        _factory.AdvanceTime(TimeSpan.FromMinutes(21));

        var response = await _client.PostAsJsonAsync(
            $"/api/sessions/{rendered.SessionId}/document-map",
            new { id = "north" });

        Assert.Equal(HttpStatusCode.Gone, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(
            problem.TryGetProperty("title", out _) || problem.TryGetProperty("detail", out _),
            "Expected ProblemDetails-shaped body");
    }

    private sealed record RenderWithMapResponse(
        string SessionId,
        string Html,
        DocumentMapNodeResponse[]? DocumentMap);

    private sealed record SessionRenderResponse(
        string Html,
        DocumentMapNodeResponse[]? DocumentMap);

    private sealed record DocumentMapNodeResponse(
        string Id,
        string Label,
        DocumentMapNodeResponse[]? Children);
}
