using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace SsrsReportViewer.Api.Tests;

public sealed class CatalogEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;
    private readonly HttpClient _client;

    public CatalogEndpointTests(ApiFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
        _factory.Fake.ResetCatalog();
    }

    [Fact]
    public async Task Get_catalog_returns_folders_and_reports_for_path()
    {
        _factory.Fake.SeedCatalog(
            folder: "/",
            folders: [("/Sales", "Sales")],
            reports: [("/Welcome", "Welcome")]);
        _factory.Fake.SeedCatalog(
            folder: "/Sales",
            folders: [("/Sales/Q1", "Q1")],
            reports: [("/Sales/Revenue", "Revenue")]);

        var response = await _client.GetAsync("/api/catalog?path=/Sales");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<CatalogResponse>();
        Assert.NotNull(body);
        Assert.Equal("/Sales", body.Path);
        Assert.Equal(
            [new CatalogItemResponse("Q1", "/Sales/Q1")],
            body.Folders);
        Assert.Equal(
            [new CatalogItemResponse("Revenue", "/Sales/Revenue")],
            body.Reports);
    }

    [Fact]
    public async Task Get_catalog_returns_empty_lists_for_empty_folder()
    {
        _factory.Fake.SeedCatalog(folder: "/Empty", folders: [], reports: []);

        var response = await _client.GetAsync("/api/catalog?path=/Empty");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadFromJsonAsync<CatalogResponse>();
        Assert.NotNull(body);
        Assert.Equal("/Empty", body.Path);
        Assert.Empty(body.Folders);
        Assert.Empty(body.Reports);
    }

    [Fact]
    public async Task Get_catalog_returns_problem_details_for_missing_path()
    {
        var response = await _client.GetAsync("/api/catalog?path=/Does/Not/Exist");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(JsonValueKind.Object, problem.ValueKind);
        Assert.True(
            problem.TryGetProperty("title", out _) || problem.TryGetProperty("detail", out _),
            "Expected ProblemDetails-shaped body");
    }

    [Fact]
    public async Task Get_catalog_does_not_create_or_mutate_viewer_session()
    {
        _factory.Fake.SeedCatalog(
            folder: "/",
            folders: [],
            reports: [("/Welcome", "Welcome")]);

        var response = await _client.GetAsync("/api/catalog?path=/");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(json);
        Assert.False(
            doc.RootElement.TryGetProperty("sessionId", out _),
            "Catalog browse must not return a Viewer Session id");
        Assert.Equal(0, _factory.Fake.ViewerSessionMutations);
    }

    private sealed record CatalogResponse(
        string Path,
        CatalogItemResponse[] Folders,
        CatalogItemResponse[] Reports);

    private sealed record CatalogItemResponse(string Name, string Path);
}
