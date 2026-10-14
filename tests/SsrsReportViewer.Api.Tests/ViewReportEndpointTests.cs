using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace SsrsReportViewer.Api.Tests;

public sealed class ViewReportEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;
    private readonly HttpClient _client;

    public ViewReportEndpointTests(ApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
        _factory.Fake.Reset();
        _factory.ResetSessions();
    }

    [Fact]
    public async Task Get_parameters_omits_non_prompted_parameters_from_mixed_report()
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
                    Required: true,
                    ValidValues: [("North", "N"), ("South", "S")]),
                new FakeReportParameter(
                    Name: "all_value",
                    DataType: "Text",
                    Nullable: false,
                    MultiValue: false,
                    Prompt: "all_value",
                    Required: false,
                    PromptUser: false,
                    DefaultValues: ["*"]),
            ]);

        var response = await _client.GetAsync("/api/reports/parameters?path=/Sales/Revenue");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ParametersResponse>();
        Assert.NotNull(body);
        var region = Assert.Single(body.Parameters);
        Assert.Equal("Region", region.Name);
        Assert.Equal(2, region.ValidValues?.Length);
    }

    [Fact]
    public async Task Get_parameters_returns_prompted_parameters_unchanged_when_all_prompt_user()
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
                    Required: true,
                    ValidValues: [("North", "N"), ("<ALL>", "<ALL>")]),
                new FakeReportParameter(
                    Name: "all_value",
                    DataType: "Text",
                    Nullable: false,
                    MultiValue: false,
                    Prompt: "All value",
                    Required: true,
                    PromptUser: true),
            ]);

        var response = await _client.GetAsync("/api/reports/parameters?path=/Sales/Revenue");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ParametersResponse>();
        Assert.NotNull(body);
        Assert.Equal(2, body.Parameters.Length);
        var region = Assert.Single(body.Parameters, p => p.Name == "Region");
        Assert.Contains(region.ValidValues!, v => v.Value == "<ALL>");
        Assert.Contains(body.Parameters, p => p.Name == "all_value");
    }

    [Fact]
    public async Task Get_parameters_returns_empty_list_when_only_non_prompted()
    {
        _factory.Fake.SeedReport(
            "/Sales/Internal",
            parameters:
            [
                new FakeReportParameter(
                    Name: "InternalFlag",
                    DataType: "Boolean",
                    Nullable: false,
                    MultiValue: false,
                    Prompt: null,
                    Required: false,
                    PromptUser: false,
                    DefaultValues: ["true"]),
            ]);

        var response = await _client.GetAsync("/api/reports/parameters?path=/Sales/Internal");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ParametersResponse>();
        Assert.NotNull(body);
        Assert.Empty(body.Parameters);
    }

    [Fact]
    public async Task Get_parameters_returns_text_boolean_date_and_multi_value_metadata()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters:
            [
                new FakeReportParameter(
                    Name: "Title",
                    DataType: "Text",
                    Nullable: true,
                    MultiValue: false,
                    Prompt: "Title",
                    Required: false),
                new FakeReportParameter(
                    Name: "IncludeInactive",
                    DataType: "Boolean",
                    Nullable: false,
                    MultiValue: false,
                    Prompt: "Include inactive",
                    Required: true,
                    DefaultValues: ["false"]),
                new FakeReportParameter(
                    Name: "AsOf",
                    DataType: "DateTime",
                    Nullable: false,
                    MultiValue: false,
                    Prompt: "As of",
                    Required: true),
                new FakeReportParameter(
                    Name: "Regions",
                    DataType: "Text",
                    Nullable: false,
                    MultiValue: true,
                    Prompt: "Regions",
                    Required: true,
                    ValidValues: [("North", "N"), ("South", "S")]),
            ]);

        var response = await _client.GetAsync("/api/reports/parameters?path=/Sales/Revenue");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<ParametersResponse>();
        Assert.NotNull(body);
        Assert.Equal("/Sales/Revenue", body.Path);
        Assert.Equal(4, body.Parameters.Length);

        Assert.Contains(body.Parameters, p => p is { Name: "Title", DataType: "Text", MultiValue: false });
        Assert.Contains(body.Parameters, p => p is { Name: "IncludeInactive", DataType: "Boolean" });
        Assert.Contains(body.Parameters, p => p is { Name: "AsOf", DataType: "DateTime" });
        var regions = Assert.Single(body.Parameters, p => p.Name == "Regions");
        Assert.True(regions.MultiValue);
        Assert.Equal(2, regions.ValidValues?.Length);
        Assert.True(_factory.Fake.LastGetParametersForRendering);
    }

    [Fact]
    public async Task Get_parameters_requests_forRendering_true_on_initial_load()
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
                    Required: true,
                    ValidValues: [("North", "N")]),
            ]);

        var response = await _client.GetAsync("/api/reports/parameters?path=/Sales/Revenue");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(_factory.Fake.LastGetParametersForRendering);
    }

    [Fact]
    public async Task Post_render_requests_forRendering_false_for_metadata_check()
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
            html: "<div class=\"report\">Revenue for {{Region}}</div>");

        var response = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new
            {
                reportPath = "/Sales/Revenue",
                parameters = new[]
                {
                    new { name = "Region", values = new[] { "N" } },
                },
            });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(_factory.Fake.LastGetParametersForRendering);
    }

    [Fact]
    public async Task Post_render_returns_session_id_and_html_for_valid_parameters()
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
            streams: [new FakeStream("img1", "image/png", [0x89, 0x50, 0x4E, 0x47])]);

        var response = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new
            {
                reportPath = "/Sales/Revenue",
                parameters = new[]
                {
                    new { name = "Region", values = new[] { "North" } },
                },
            });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<RenderResponse>();
        Assert.NotNull(body);
        Assert.False(string.IsNullOrWhiteSpace(body.SessionId));
        Assert.Contains("Revenue for North", body.Html, StringComparison.Ordinal);
        Assert.Contains($"/api/sessions/{body.SessionId}/resources/", body.Html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Post_render_includes_open_report_path_and_applied_parameters()
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
                new FakeReportParameter(
                    Name: "Years",
                    DataType: "Text",
                    Nullable: false,
                    MultiValue: true,
                    Prompt: "Years",
                    Required: true),
            ],
            html: "<div class=\"report\">ok</div>");

        var response = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new
            {
                reportPath = "/Sales/Revenue",
                parameters = new[]
                {
                    new { name = "Region", values = new[] { "North" } },
                    new { name = "Years", values = new[] { "2024", "2025" } },
                },
            });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<RenderResponse>();
        Assert.NotNull(body);
        Assert.Equal("/Sales/Revenue", body.ReportPath);
        Assert.NotNull(body.Parameters);
        Assert.Equal(2, body.Parameters.Length);

        var region = Assert.Single(body.Parameters, p => p.Name == "Region");
        Assert.Equal(["North"], region.Values);
        var years = Assert.Single(body.Parameters, p => p.Name == "Years");
        Assert.Equal(["2024", "2025"], years.Values);
    }

    [Fact]
    public async Task Post_render_returns_problem_details_and_no_session_when_required_parameter_missing()
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
            ]);

        var response = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new
            {
                reportPath = "/Sales/Revenue",
                parameters = Array.Empty<object>(),
            });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(JsonValueKind.Object, problem.ValueKind);
        Assert.True(
            problem.TryGetProperty("title", out _) || problem.TryGetProperty("detail", out _),
            "Expected ProblemDetails-shaped body");

        Assert.Equal(0, _factory.Fake.ActiveExecutionCount);
        Assert.Equal(0, _factory.SessionCount);
    }

    [Fact]
    public async Task Post_render_succeeds_when_nullable_parameter_submitted_with_empty_values()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters:
            [
                new FakeReportParameter(
                    Name: "Title",
                    DataType: "Text",
                    Nullable: true,
                    MultiValue: false,
                    Prompt: "Title",
                    Required: false,
                    DefaultValues: ["East"]),
            ],
            html: "<div class=\"report\">Title={{Title}}</div>");

        var response = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new
            {
                reportPath = "/Sales/Revenue",
                parameters = new[]
                {
                    new { name = "Title", values = Array.Empty<string>() },
                },
            });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<RenderResponse>();
        Assert.NotNull(body);
        Assert.False(string.IsNullOrWhiteSpace(body.SessionId));
    }

    [Fact]
    public async Task Post_render_keeps_default_when_non_nullable_parameter_submitted_empty()
    {
        // Client always posts every parameter; blank non-nullables must not be applied as SSRS NULL
        // (that clears LoadReport defaults and faults Render — e.g. Boolean 'Enabled').
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters:
            [
                new FakeReportParameter(
                    Name: "Enabled",
                    DataType: "Boolean",
                    Nullable: false,
                    MultiValue: false,
                    Prompt: "Enabled",
                    Required: false,
                    DefaultValues: ["true"]),
            ],
            html: "<div class=\"report\">Enabled={{Enabled}}</div>");

        var response = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new
            {
                reportPath = "/Sales/Revenue",
                parameters = new[]
                {
                    new { name = "Enabled", values = Array.Empty<string>() },
                },
            });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<RenderResponse>();
        Assert.NotNull(body);

        var executionId = _factory.Fake.LastRenderedExecutionId;
        Assert.False(string.IsNullOrWhiteSpace(executionId));
        Assert.True(
            _factory.Fake.TryGetExecutionParameter(executionId!, "Enabled", out var stored),
            "Expected Enabled to remain set on the Execution");
        Assert.Equal(["true"], stored);
        Assert.Contains("Enabled=true", body.Html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Post_render_applies_null_for_nullable_parameter_with_empty_values()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters:
            [
                new FakeReportParameter(
                    Name: "Title",
                    DataType: "Text",
                    Nullable: true,
                    MultiValue: false,
                    Prompt: "Title",
                    Required: false,
                    DefaultValues: ["East"]),
            ],
            html: "<div class=\"report\">Title={{Title}}</div>");

        var response = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new
            {
                reportPath = "/Sales/Revenue",
                parameters = new[]
                {
                    new { name = "Title", values = Array.Empty<string>() },
                },
            });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<RenderResponse>();
        Assert.NotNull(body);

        var executionId = _factory.Fake.LastRenderedExecutionId;
        Assert.False(string.IsNullOrWhiteSpace(executionId));
        Assert.True(
            _factory.Fake.TryGetExecutionParameter(executionId!, "Title", out var stored),
            "Expected Title to be set on the Execution");
        Assert.NotNull(stored);
        Assert.Empty(stored);

        Assert.DoesNotContain("East", body.Html, StringComparison.Ordinal);
        Assert.Contains("Title=", body.Html, StringComparison.Ordinal);

        var title = Assert.Single(body.Parameters!, p => p.Name == "Title");
        Assert.Empty(title.Values);
    }

    [Fact]
    public async Task Get_resource_returns_stream_bytes_for_viewer_session()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: "<img src=\"{resource:img1}\" />",
            streams: [new FakeStream("img1", "image/png", [0x89, 0x50, 0x4E, 0x47])]);

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.OK, render.StatusCode);
        var body = await render.Content.ReadFromJsonAsync<RenderResponse>();
        Assert.NotNull(body);

        var resource = await _client.GetAsync($"/api/sessions/{body.SessionId}/resources/img1");

        Assert.Equal(HttpStatusCode.OK, resource.StatusCode);
        Assert.Equal("image/png", resource.Content.Headers.ContentType?.MediaType);
        var bytes = await resource.Content.ReadAsByteArrayAsync();
        Assert.Equal([0x89, 0x50, 0x4E, 0x47], bytes);
    }

    [Fact]
    public async Task Expired_viewer_session_hard_fails_resource_fetch()
    {
        _factory.ConfigureSessionIdleTimeout(TimeSpan.FromMinutes(20));
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: "<div>ok</div>",
            streams: [new FakeStream("img1", "image/png", [1, 2, 3])]);

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });
        var body = await render.Content.ReadFromJsonAsync<RenderResponse>();
        Assert.NotNull(body);

        _factory.AdvanceTime(TimeSpan.FromMinutes(21));

        var resource = await _client.GetAsync($"/api/sessions/{body.SessionId}/resources/img1");

        Assert.Equal(HttpStatusCode.Gone, resource.StatusCode);
        var problem = await resource.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(
            problem.TryGetProperty("title", out _) || problem.TryGetProperty("detail", out _),
            "Expected ProblemDetails-shaped body");
        Assert.Equal(0, _factory.SessionCount);
    }

    [Fact]
    public async Task Get_parameters_with_values_returns_cascading_valid_values()
    {
        _factory.Fake.SeedReport(
            "/Sales/Cascading",
            parameters:
            [
                new FakeReportParameter(
                    Name: "Region",
                    DataType: "Text",
                    Nullable: false,
                    MultiValue: false,
                    Prompt: "Region",
                    Required: true,
                    ValidValues: [("North", "North"), ("South", "South")]),
                new FakeReportParameter(
                    Name: "City",
                    DataType: "Text",
                    Nullable: false,
                    MultiValue: false,
                    Prompt: "City",
                    Required: true,
                    Dependencies: ["Region"],
                    ValidValues: [],
                    CascadingByDependencyValue: new Dictionary<string, IReadOnlyList<(string Label, string Value)>>(
                        StringComparer.OrdinalIgnoreCase)
                    {
                        ["North"] = [("Seattle", "SEA"), ("Portland", "PDX")],
                        ["South"] = [("Austin", "AUS")],
                    }),
            ]);

        var response = await _client.GetAsync(
            "/api/reports/parameters?path=/Sales/Cascading&values=" +
            Uri.EscapeDataString("""[{"name":"Region","values":["North"]}]"""));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(_factory.Fake.LastGetParametersForRendering);
        var body = await response.Content.ReadFromJsonAsync<ParametersResponse>();
        Assert.NotNull(body);
        var city = Assert.Single(body.Parameters, p => p.Name == "City");
        Assert.Equal(2, city.ValidValues?.Length);
        Assert.Contains(city.ValidValues!, v => v.Value == "SEA");
        Assert.Contains(city.ValidValues!, v => v.Value == "PDX");
    }

    [Fact]
    public async Task Concurrent_session_ops_serialize_extras_are_conflict()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: "<div>ok</div>",
            streams: [new FakeStream("img1", "image/png", [1])]);
        _factory.Fake.StreamDelay = TimeSpan.FromMilliseconds(400);

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });
        var body = await render.Content.ReadFromJsonAsync<RenderResponse>();
        Assert.NotNull(body);

        var first = _client.GetAsync($"/api/sessions/{body.SessionId}/resources/img1");
        await Task.Delay(50);
        var second = await _client.GetAsync($"/api/sessions/{body.SessionId}/resources/img1");

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);

        var firstResponse = await first;
        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);

        // Second concurrent mutating op must not corrupt the Execution after the first completes.
        var after = await _client.GetAsync($"/api/sessions/{body.SessionId}/resources/img1");
        Assert.Equal(HttpStatusCode.OK, after.StatusCode);
        Assert.Equal(new byte[] { 1 }, await after.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task Concurrent_toggle_ops_block_without_corrupting_execution()
    {
        _factory.Fake.SeedReport(
            "/Sales/Revenue",
            parameters: [],
            html: """<a data-ssrs-action="drilldown" data-ssrs-toggle-id="t1">x</a>""",
            streams: []);
        _factory.Fake.ToggleDelay = TimeSpan.FromMilliseconds(400);

        var render = await _client.PostAsJsonAsync(
            "/api/reports/render",
            new { reportPath = "/Sales/Revenue", parameters = Array.Empty<object>() });
        var body = await render.Content.ReadFromJsonAsync<RenderResponse>();
        Assert.NotNull(body);

        var payload = JsonContent.Create(new { toggleId = "t1" });
        var first = _client.PostAsync($"/api/sessions/{body.SessionId}/toggle", payload);
        await Task.Delay(50);
        var second = await _client.PostAsync(
            $"/api/sessions/{body.SessionId}/toggle",
            JsonContent.Create(new { toggleId = "t1" }));

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        var problem = await second.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Viewer Session busy", problem.GetProperty("title").GetString());

        var firstResponse = await first;
        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);
        var firstBody = await firstResponse.Content.ReadFromJsonAsync<RenderResponse>();
        Assert.NotNull(firstBody);
        Assert.Equal(body.SessionId, firstBody.SessionId);
        Assert.False(string.IsNullOrWhiteSpace(firstBody.Html));
    }

    private sealed record ParametersResponse(string Path, ParameterResponse[] Parameters);

    private sealed record ParameterResponse(
        string Name,
        string DataType,
        bool Nullable,
        bool MultiValue,
        bool Required,
        string? Prompt,
        string[]? DefaultValues,
        ValidValueResponse[]? ValidValues,
        string[]? Dependencies);

    private sealed record ValidValueResponse(string Label, string Value);

    private sealed record RenderResponse(
        string SessionId,
        string Html,
        string? ReportPath = null,
        AppliedParameter[]? Parameters = null);

    private sealed record AppliedParameter(string Name, string[] Values);
}
