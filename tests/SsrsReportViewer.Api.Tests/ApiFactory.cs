using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Tests;

/// <summary>
/// HTTP-seam host with the SSRS adapter replaced by a fake (no live ReportServer).
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public FakeSsrsAdapter Fake { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<ISsrsAdapter>();
            services.AddSingleton<ISsrsAdapter>(Fake);
        });
    }
}
