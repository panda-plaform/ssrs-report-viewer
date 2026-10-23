using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Tests;

public sealed class ZoomPageRefreshEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;
    private readonly HttpClient _client;

    public ZoomPageRefreshEndpointTests(ApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
        _factory.Fake.Reset();
        _factory.ResetSessions();
    }

    [Fact]
    public async Task Post_zoom_stores_on_session_and_re_renders_via_device_info()
    {
        await SeedAndRenderAsync(pageCount: 1);

        var response = await _client.PostAsJsonAsync(
            $"/api/sessions/{_sessionId}/zoom",
            new { zoomPercent = 150 });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<SessionRenderResponse>();
        Assert.NotNull(body);
        Assert.Equal(_sessionId, body.SessionId);
        Assert.Equal(150, body.ZoomPercent);
        Assert.Equal(150, ExtractIntAttribute(body.Html, "data-zoom"));
        Assert.Contains("Revenue for North", body.Html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Post_page_goto_re_renders_requested_report_page()
    {
        await SeedAndRenderAsync(pageCount: 3);

        var response = await _client.PostAsJsonAsync(
            $"/api/sessions/{_sessionId}/page",
            new { action = "goto", page = 2 });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<SessionRenderResponse>();
        Assert.NotNull(body);
        Assert.Equal(2, body.PageInfo.CurrentPage);
        Assert.Equal(3, body.PageInfo.PageCount);
        Assert.Equal(2, ExtractIntAttribute(body.Html, "data-page"));
    }

    [Fact]
    public async Task Post_page_next_and_previous_navigate_report_pages()
    {
        await SeedAndRenderAsync(pageCount: 3);

        var next = await _client.PostAsJsonAsync(
            $"/api/sessions/{_sessionId}/page",
            new { action = "next" });
        Assert.Equal(HttpStatusCode.OK, next.StatusCode);
        var afterNext = await next.Content.ReadFromJsonAsync<SessionRenderResponse>();
        Assert.NotNull(afterNext);
        Assert.Equal(2, afterNext.PageInfo.CurrentPage);

        var previous = await _client.PostAsJsonAsync(
            $"/api/sessions/{_sessionId}/page",
            new { action = "previous" });
        Assert.Equal(HttpStatusCode.OK, previous.StatusCode);
        var afterPrevious = await previous.Content.ReadFromJsonAsync<SessionRenderResponse>();
        Assert.NotNull(afterPrevious);
        Assert.Equal(1, afterPrevious.PageInfo.CurrentPage);
    }

    [Fact]
    public async Task Post_refresh_reloads_path_and_parameters_into_new_execution()
    {
        await SeedAndRenderAsync(pageCount: 2);
        var firstExec = ExtractAttribute(_html!, "data-exec");
        Assert.False(string.IsNullOrWhiteSpace(firstExec));

        var response = await _client.PostAsJsonAsync(
            $"/api/sessions/{_sessionId}/refresh",
            new { });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<SessionRenderResponse>();
        Assert.NotNull(body);
        Assert.Equal(_sessionId, body.SessionId);
        Assert.Contains("Revenue for North", body.Html, StringComparison.Ordinal);

        var refreshedExec = ExtractAttribute(body.Html, "data-exec");
        Assert.False(string.IsNullOrWhiteSpace(refreshedExec));
        Assert.NotEqual(firstExec, refreshedExec);
        Assert.Equal(1, body.PageInfo.CurrentPage);
    }

    [Fact]
    public async Task Post_refresh_maps_ParameterValueNotSet_to_400_required_parameters()
    {
        // Shared Execution-create path: residual ParameterValueNotSet must not 500 (#93).
        await SeedAndRenderAsync(pageCount: 1);
        _factory.Fake.NextRenderFault = new ParameterValueNotSetException("folder_name");

        var response = await _client.PostAsJsonAsync(
            $"/api/sessions/{_sessionId}/refresh",
            new { });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Required Report Parameters missing", problem.GetProperty("title").GetString());
        Assert.Contains("folder_name", problem.GetProperty("detail").GetString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Post_refresh_fail_fast_before_LoadReport_when_non_prompted_non_nullable_has_no_default()
    {
        // Same unresolved-required check as View Report on shared Execution-create (#90 review).
        _factory.Fake.SeedReport(
            "/Sales/Folders",
            parameters:
            [
                new FakeReportParameter(
                    Name: "Region",
                    DataType: "Text",
                    Nullable: false,
                    MultiValue: false,
                    Prompt: "Region",
                    Required: true),
            ],
            html: "<div>Folders {{Region}}</div>");

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new
            {
                reportPath = "/Sales/Folders",
                parameters = new[] { new { name = "Region", values = new[] { "North" } } },
            });
        Assert.Equal(HttpStatusCode.OK, render.StatusCode);
        var body = await render.Content.ReadFromJsonAsync<SessionRenderResponse>();
        Assert.NotNull(body);
        var sessionId = body.SessionId;
        var executionsAfterRender = _factory.Fake.ActiveExecutionCount;
        var lastLoaded = _factory.Fake.LastLoadedExecutionId;

        // Definitions change so Refresh sees a non-prompted required gap (session only keeps prompted).
        _factory.Fake.SeedReport(
            "/Sales/Folders",
            parameters:
            [
                new FakeReportParameter(
                    Name: "Region",
                    DataType: "Text",
                    Nullable: false,
                    MultiValue: false,
                    Prompt: "Region",
                    Required: true),
                new FakeReportParameter(
                    Name: "folder_name",
                    DataType: "Text",
                    Nullable: false,
                    MultiValue: false,
                    Prompt: "folder_name",
                    Required: true,
                    PromptUser: false),
            ],
            html: "<div>Folders {{Region}}</div>");

        var response = await _client.PostAsJsonAsync(
            $"/api/sessions/{sessionId}/refresh",
            new { });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Required Report Parameters missing", problem.GetProperty("title").GetString());
        Assert.Contains("folder_name", problem.GetProperty("detail").GetString(), StringComparison.Ordinal);
        Assert.Equal(executionsAfterRender, _factory.Fake.ActiveExecutionCount);
        Assert.Equal(lastLoaded, _factory.Fake.LastLoadedExecutionId);
    }

    [Fact]
    public async Task Session_ops_return_problem_details_for_unknown_session()
    {
        var response = await _client.PostAsJsonAsync(
            "/api/sessions/missing/zoom",
            new { zoomPercent = 125 });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(
            problem.TryGetProperty("title", out _) || problem.TryGetProperty("detail", out _),
            "Expected ProblemDetails-shaped body");
    }

    private string? _sessionId;
    private string? _html;

    private async Task SeedAndRenderAsync(int pageCount)
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters:
            [
                new FakeReportParameter(
                    Name: "Region",
                    DataType: "Text",
                    Nullable: false,
                    MultiValue: false,
                    Prompt: "Region",
                    Required: true),
            ],
            html: "<div class=\"report\">Revenue for {{Region}}</div>",
            pageCount: pageCount);

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new
            {
                reportPath = "/Sales/Revenue",
                parameters = new[]
                {
                    new { name = "Region", values = new[] { "North" } },
                },
            });

        Assert.Equal(HttpStatusCode.OK, render.StatusCode);
        var body = await render.Content.ReadFromJsonAsync<SessionRenderResponse>();
        Assert.NotNull(body);
        _sessionId = body.SessionId;
        _html = body.Html;
    }

    private static int ExtractIntAttribute(string html, string attributeName) =>
        int.Parse(ExtractAttribute(html, attributeName));

    private static string ExtractAttribute(string html, string attributeName)
    {
        var match = Regex.Match(
            html,
            $"{Regex.Escape(attributeName)}=\"([^\"]+)\"",
            RegexOptions.CultureInvariant);
        Assert.True(match.Success, $"Expected {attributeName} in HTML");
        return match.Groups[1].Value;
    }

    private sealed record SessionRenderResponse(
        string SessionId,
        string Html,
        PageInfoResponse PageInfo,
        int ZoomPercent);

    private sealed record PageInfoResponse(int CurrentPage, int PageCount);
}
