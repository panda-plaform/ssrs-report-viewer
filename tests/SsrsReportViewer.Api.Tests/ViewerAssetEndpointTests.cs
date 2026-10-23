using System.Net;
using System.Net.Http.Json;

namespace SsrsReportViewer.Api.Tests;

/// <summary>
/// HTTP-seam coverage for the SSRS viewer-asset proxy (host/infra slice #69).
/// </summary>
public sealed class ViewerAssetEndpointTests : IClassFixture<ApiFactory>
{
    private readonly HttpClient _client;

    public ViewerAssetEndpointTests(ApiFactory factory)
    {
        _client = factory.CreateClient();
    }

    [Theory]
    [InlineData("foo..bar")]
    [InlineData("foo%5Cbar")]
    [InlineData("%20")]
    public async Task Get_viewer_asset_rejects_invalid_name(string name)
    {
        var response = await _client.GetAsync($"/api/ssrs-viewer-assets/{name}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<ProblemBody>();
        Assert.NotNull(problem);
        Assert.Equal("Invalid ReportViewer asset request", problem.Title);
    }

    private sealed record ProblemBody(string? Title);
}
