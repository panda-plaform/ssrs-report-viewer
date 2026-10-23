using SsrsReportViewer.Api.Shared;
using SsrsReportViewer.Api.Sessions;
using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Composition;

/// <summary>
/// Composition-root DI registration for the Report Viewer host (ADR-0005).
/// Wires the shared kernel and any slice-owned services.
/// </summary>
public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddSsrsReportViewerServices(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.Configure<SsrsOptions>(configuration.GetSection(SsrsOptions.SectionName));
        services.AddSingleton<SoapSsrsAdapter>();
        services.AddSingleton<ISsrsAdapter>(sp =>
            new LoggingSsrsAdapter(
                sp.GetRequiredService<SoapSsrsAdapter>(),
                sp.GetRequiredService<ILogger<LoggingSsrsAdapter>>()));
        services.AddSingleton<SsrsViewerAssetClient>();
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IViewerSessionStore, ViewerSessionStore>();
        services.AddSingleton<ViewerSessionGuard>();
        services.AddSingleton<ViewerSessionProblemMapper>();
        services.AddSingleton<ReportViewerService>();
        services.AddProblemDetails();
        return services;
    }
}
