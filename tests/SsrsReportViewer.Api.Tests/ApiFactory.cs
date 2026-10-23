using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Time.Testing;
using SsrsReportViewer.Api.Sessions;
using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Tests;

/// <summary>
/// HTTP-seam host with the SSRS adapter replaced by a fake (no live ReportServer).
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    private readonly FakeTimeProvider _time = new(DateTimeOffset.UtcNow);
    private readonly CapturingLoggerProvider _logs = new();
    private int _sessionIdleTimeoutMinutes = 20;
    private string _ssrsPassword = "test-password";

    public FakeSsrsAdapter Fake { get; } = new();

    /// <summary>Capturing logger seam for high-value observability assertions.</summary>
    public CapturingLoggerProvider Logs => _logs;

    public int SessionCount =>
        Services.GetRequiredService<IViewerSessionStore>().Count;

    public void ConfigureSessionIdleTimeout(TimeSpan idleTimeout)
    {
        _sessionIdleTimeoutMinutes = Math.Max(1, (int)Math.Ceiling(idleTimeout.TotalMinutes));
    }

    /// <summary>Must be called before the first <see cref="WebApplicationFactory{TEntryPoint}.CreateClient"/>.</summary>
    public void UseSsrsPassword(string password) => _ssrsPassword = password;

    public void AdvanceTime(TimeSpan delta) => _time.Advance(delta);

    public void ResetSessions()
    {
        // Host may not be built yet (first CreateClient builds it).
        try
        {
            Services.GetRequiredService<IViewerSessionStore>().Clear();
        }
        catch (InvalidOperationException)
        {
            // Server not started.
        }
    }

    /// <summary>
    /// Test arrange helper: bind a Viewer Session to a different Execution (Drillthrough-style).
    /// </summary>
    public void ReplaceSessionExecution(string sessionId, ExecutionHandle execution)
    {
        var store = Services.GetRequiredService<IViewerSessionStore>();
        if (!store.TryGet(sessionId, out var session) || session is null)
        {
            throw new InvalidOperationException($"Viewer Session '{sessionId}' was not found.");
        }

        session.SwitchTo(session.ReportPath, execution, session.Parameters);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting($"Ssrs:{nameof(SsrsOptions.SessionIdleTimeoutMinutes)}", _sessionIdleTimeoutMinutes.ToString());
        builder.UseSetting($"Ssrs:{nameof(SsrsOptions.Password)}", _ssrsPassword);

        builder.ConfigureLogging(logging =>
        {
            logging.ClearProviders();
            logging.AddProvider(_logs);
            logging.SetMinimumLevel(LogLevel.Warning);
            // App categories emit Information for high-signal slice outcomes (View Report / Find / Export / Print).
            logging.AddFilter("SsrsReportViewer", LogLevel.Information);
        });

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<ISsrsAdapter>();
            // Wrap Fake so SSRS adapter fault logging stays on the same seam as production.
            services.AddSingleton<ISsrsAdapter>(sp =>
                new LoggingSsrsAdapter(Fake, sp.GetRequiredService<ILogger<LoggingSsrsAdapter>>()));

            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(_time);

            // Recreate session store against the fake clock for each host.
            services.RemoveAll<IViewerSessionStore>();
            services.AddSingleton<IViewerSessionStore, ViewerSessionStore>();
            services.RemoveAll<ViewerSessionGuard>();
            services.AddSingleton<ViewerSessionGuard>();
        });
    }
}
