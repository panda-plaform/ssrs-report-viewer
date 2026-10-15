using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace SsrsReportViewer.Api.Tests;

public sealed class DrillthroughEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;
    private readonly HttpClient _client;

    public DrillthroughEndpointTests(ApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
        _factory.Fake.Reset();
        _factory.ResetSessions();
    }

    [Fact]
    public async Task Post_drillthrough_includes_open_report_path_and_applied_parameters()
    {
        _factory.Fake.SeedReport(
            "/Sales/Parent",
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
            html: "<div>Parent {{Region}}</div>");
        _factory.Fake.SeedReport(
            "/Sales/Child",
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
                    Name: "Year",
                    DataType: "Text",
                    Nullable: false,
                    MultiValue: false,
                    Prompt: "Year",
                    Required: true),
            ],
            html: "<div>Child {{Region}} {{Year}}</div>");

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new
            {
                reportPath = "/Sales/Parent",
                parameters = new[] { new { name = "Region", values = new[] { "West" } } },
            });
        var parent = await render.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(parent);
        Assert.Equal("/Sales/Parent", parent.ReportPath);
        var parentRegion = Assert.Single(parent.Parameters!, p => p.Name == "Region");
        Assert.Equal(["West"], parentRegion.Values);

        var drillthrough = await _client.PostAsJsonAsync(
            $"/api/sessions/{parent.SessionId}/drillthrough",
            new
            {
                reportPath = "/Sales/Child",
                parameters = new[]
                {
                    new { name = "Region", values = new[] { "North" } },
                    new { name = "Year", values = new[] { "2025" } },
                },
            });

        Assert.Equal(HttpStatusCode.OK, drillthrough.StatusCode);
        var child = await drillthrough.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(child);
        Assert.Equal("/Sales/Child", child.ReportPath);
        Assert.NotNull(child.Parameters);
        Assert.Equal(2, child.Parameters.Length);
        Assert.Equal(["North"], Assert.Single(child.Parameters, p => p.Name == "Region").Values);
        Assert.Equal(["2025"], Assert.Single(child.Parameters, p => p.Name == "Year").Values);
        Assert.Contains("Child North 2025", child.Html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Post_drillthrough_switches_to_child_execution_and_pushes_back_stack()
    {
        _factory.Fake.SeedReport(
            "/Sales/Parent",
            parameters: [],
            html: """
                  <div class="report">
                    Parent {{Region}}
                    <a href="{ReplacementRoot}?/Sales/Child&amp;Region=North">Open child</a>
                  </div>
                  """);
        _factory.Fake.SeedReport(
            "/Sales/Child",
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
            html: "<div class=\"report\">Child for {{Region}}</div>");

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Parent", parameters = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.OK, render.StatusCode);
        var parent = await render.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(parent);
        Assert.False(parent.CanGoBack);
        Assert.Contains("data-ssrs-action=\"drillthrough\"", parent.Html, StringComparison.Ordinal);
        Assert.Contains("data-ssrs-report-path=\"/Sales/Child\"", parent.Html, StringComparison.Ordinal);
        var parentExecutionId = _factory.Fake.LastLoadedExecutionId;
        Assert.False(string.IsNullOrWhiteSpace(parentExecutionId));

        var drillthrough = await _client.PostAsJsonAsync(
            $"/api/sessions/{parent.SessionId}/drillthrough",
            new
            {
                reportPath = "/Sales/Child",
                parameters = new[] { new { name = "Region", values = new[] { "North" } } },
            });

        Assert.Equal(HttpStatusCode.OK, drillthrough.StatusCode);
        var child = await drillthrough.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(child);
        Assert.Equal(parent.SessionId, child.SessionId);
        Assert.True(child.CanGoBack);
        Assert.Contains("Child for North", child.Html, StringComparison.Ordinal);
        Assert.DoesNotContain("Parent", child.Html, StringComparison.Ordinal);
        Assert.NotEqual(parentExecutionId, _factory.Fake.LastLoadedExecutionId);
    }

    [Fact]
    public async Task Post_back_restores_prior_execution_when_still_alive()
    {
        _factory.Fake.SeedReport("/Sales/Parent", parameters: [], html: "<div>Parent home</div>");
        _factory.Fake.SeedReport(
            "/Sales/Child",
            parameters: [],
            html: "<div>Child page</div>");

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Parent", parameters = Array.Empty<object>() });
        var parent = await render.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(parent);
        var parentExecutionId = _factory.Fake.LastLoadedExecutionId!;

        var drillthrough = await _client.PostAsJsonAsync(
            $"/api/sessions/{parent.SessionId}/drillthrough",
            new { reportPath = "/Sales/Child", parameters = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.OK, drillthrough.StatusCode);

        var back = await _client.PostAsync($"/api/sessions/{parent.SessionId}/back", content: null);
        Assert.Equal(HttpStatusCode.OK, back.StatusCode);
        var restored = await back.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(restored);
        Assert.Equal(parent.SessionId, restored.SessionId);
        Assert.False(restored.CanGoBack);
        Assert.Equal("/Sales/Parent", restored.ReportPath);
        Assert.Contains("Parent home", restored.Html, StringComparison.Ordinal);
        Assert.Equal(parentExecutionId, _factory.Fake.LastRenderedExecutionId);
    }

    [Fact]
    public async Task Post_nested_drillthrough_pops_one_level_per_back()
    {
        _factory.Fake.SeedReport("/Sales/Parent", parameters: [], html: "<div>Parent home</div>");
        _factory.Fake.SeedReport("/Sales/Child", parameters: [], html: "<div>Child page</div>");
        _factory.Fake.SeedReport("/Sales/Grandchild", parameters: [], html: "<div>Grandchild page</div>");

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Parent", parameters = Array.Empty<object>() });
        var parent = await render.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(parent);

        var childResponse = await _client.PostAsJsonAsync(
            $"/api/sessions/{parent.SessionId}/drillthrough",
            new { reportPath = "/Sales/Child", parameters = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.OK, childResponse.StatusCode);
        var child = await childResponse.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(child);
        Assert.True(child.CanGoBack);
        Assert.Equal("/Sales/Child", child.ReportPath);
        Assert.Contains("Child page", child.Html, StringComparison.Ordinal);

        var grandchildResponse = await _client.PostAsJsonAsync(
            $"/api/sessions/{parent.SessionId}/drillthrough",
            new { reportPath = "/Sales/Grandchild", parameters = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.OK, grandchildResponse.StatusCode);
        var grandchild = await grandchildResponse.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(grandchild);
        Assert.True(grandchild.CanGoBack);
        Assert.Equal("/Sales/Grandchild", grandchild.ReportPath);
        Assert.Contains("Grandchild page", grandchild.Html, StringComparison.Ordinal);

        var backToChild = await _client.PostAsync($"/api/sessions/{parent.SessionId}/back", content: null);
        Assert.Equal(HttpStatusCode.OK, backToChild.StatusCode);
        var restoredChild = await backToChild.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(restoredChild);
        Assert.True(restoredChild.CanGoBack);
        Assert.Equal("/Sales/Child", restoredChild.ReportPath);
        Assert.Contains("Child page", restoredChild.Html, StringComparison.Ordinal);
        Assert.DoesNotContain("Grandchild", restoredChild.Html, StringComparison.Ordinal);

        var backToParent = await _client.PostAsync($"/api/sessions/{parent.SessionId}/back", content: null);
        Assert.Equal(HttpStatusCode.OK, backToParent.StatusCode);
        var restoredParent = await backToParent.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(restoredParent);
        Assert.False(restoredParent.CanGoBack);
        Assert.Equal("/Sales/Parent", restoredParent.ReportPath);
        Assert.Contains("Parent home", restoredParent.Html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Post_back_reloads_path_and_parameters_when_parent_execution_dropped()
    {
        _factory.Fake.SeedReport(
            "/Sales/Parent",
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
            html: "<div>Parent {{Region}}</div>");
        _factory.Fake.SeedReport("/Sales/Child", parameters: [], html: "<div>Child</div>");

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new
            {
                reportPath = "/Sales/Parent",
                parameters = new[] { new { name = "Region", values = new[] { "West" } } },
            });
        var parent = await render.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(parent);
        var parentExecutionId = _factory.Fake.LastLoadedExecutionId!;

        var drillthrough = await _client.PostAsJsonAsync(
            $"/api/sessions/{parent.SessionId}/drillthrough",
            new { reportPath = "/Sales/Child", parameters = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.OK, drillthrough.StatusCode);

        Assert.True(_factory.Fake.DropExecution(parentExecutionId));

        var back = await _client.PostAsync($"/api/sessions/{parent.SessionId}/back", content: null);
        Assert.Equal(HttpStatusCode.OK, back.StatusCode);
        var restored = await back.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(restored);
        Assert.False(restored.CanGoBack);
        Assert.Equal("/Sales/Parent", restored.ReportPath);
        Assert.Equal(["West"], Assert.Single(restored.Parameters!, p => p.Name == "Region").Values);
        Assert.Contains("Parent West", restored.Html, StringComparison.Ordinal);
        Assert.NotEqual(parentExecutionId, _factory.Fake.LastLoadedExecutionId);
        Assert.NotEqual(parentExecutionId, _factory.Fake.LastRenderedExecutionId);
    }

    [Fact]
    public async Task Post_drillthrough_returns_problem_details_when_report_missing()
    {
        _factory.Fake.SeedReport("/Sales/Parent", parameters: [], html: "<div>parent</div>");
        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Parent", parameters = Array.Empty<object>() });
        var parent = await render.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(parent);

        var drillthrough = await _client.PostAsJsonAsync(
            $"/api/sessions/{parent.SessionId}/drillthrough",
            new { reportPath = "/Sales/Missing", parameters = Array.Empty<object>() });

        Assert.Equal(HttpStatusCode.NotFound, drillthrough.StatusCode);
        var problem = await drillthrough.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(
            problem.TryGetProperty("title", out _) || problem.TryGetProperty("detail", out _),
            "Expected ProblemDetails-shaped body");
        Assert.False(
            (await _client.PostAsync($"/api/sessions/{parent.SessionId}/back", content: null)).IsSuccessStatusCode,
            "Failed Drillthrough must not push the back stack");
    }

    [Fact]
    public async Task Post_drillthrough_returns_problem_details_when_required_parameters_omitted()
    {
        _factory.Fake.SeedReport("/Sales/Parent", parameters: [], html: "<div>parent</div>");
        _factory.Fake.SeedReport(
            "/Sales/Child",
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
            html: "<div>Child {{Region}}</div>");

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Parent", parameters = Array.Empty<object>() });
        var parent = await render.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(parent);

        var drillthrough = await _client.PostAsJsonAsync(
            $"/api/sessions/{parent.SessionId}/drillthrough",
            new { reportPath = "/Sales/Child", parameters = Array.Empty<object>() });

        Assert.Equal(HttpStatusCode.BadRequest, drillthrough.StatusCode);
        var problem = await drillthrough.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(
            problem.TryGetProperty("title", out _) || problem.TryGetProperty("detail", out _),
            "Expected ProblemDetails-shaped body");
        Assert.Contains("Region", problem.GetProperty("detail").GetString() ?? "", StringComparison.Ordinal);
        Assert.False(
            (await _client.PostAsync($"/api/sessions/{parent.SessionId}/back", content: null)).IsSuccessStatusCode,
            "Failed Drillthrough must not push the back stack");
    }

    [Fact]
    public async Task Get_export_after_drillthrough_uses_child_execution()
    {
        _factory.Fake.SeedReport("/Sales/Parent", parameters: [], html: "<div>parent</div>");
        _factory.Fake.SeedReport("/Sales/Child", parameters: [], html: "<div>child</div>");

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Parent", parameters = Array.Empty<object>() });
        var parent = await render.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(parent);
        var parentExecutionId = _factory.Fake.LastLoadedExecutionId!;

        var drillthrough = await _client.PostAsJsonAsync(
            $"/api/sessions/{parent.SessionId}/drillthrough",
            new { reportPath = "/Sales/Child", parameters = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.OK, drillthrough.StatusCode);
        var childExecutionId = _factory.Fake.LastLoadedExecutionId!;
        Assert.NotEqual(parentExecutionId, childExecutionId);

        var export = await _client.GetAsync($"/api/sessions/{parent.SessionId}/export?format=PDF");
        Assert.Equal(HttpStatusCode.OK, export.StatusCode);
        var text = Encoding.UTF8.GetString(await export.Content.ReadAsByteArrayAsync());
        Assert.Equal($"FAKE-PDF:{childExecutionId}", text);
        Assert.DoesNotContain(parentExecutionId, text, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Post_back_returns_problem_details_when_stack_empty()
    {
        _factory.Fake.SeedReport("/Sales/Parent", parameters: [], html: "<div>parent</div>");
        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Parent", parameters = Array.Empty<object>() });
        var parent = await render.Content.ReadFromJsonAsync<SessionHtmlResponse>();
        Assert.NotNull(parent);

        var back = await _client.PostAsync($"/api/sessions/{parent.SessionId}/back", content: null);
        Assert.Equal(HttpStatusCode.BadRequest, back.StatusCode);
        var problem = await back.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(
            problem.TryGetProperty("title", out _) || problem.TryGetProperty("detail", out _),
            "Expected ProblemDetails-shaped body");
    }

    private sealed record SessionHtmlResponse(
        string SessionId,
        string Html,
        bool CanGoBack,
        string? ReportPath = null,
        AppliedParameter[]? Parameters = null);

    private sealed record AppliedParameter(string Name, string[] Values);
}
