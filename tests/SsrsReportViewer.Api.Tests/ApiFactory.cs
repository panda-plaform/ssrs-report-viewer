using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
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
    private int _sessionIdleTimeoutMinutes = 20;

    public FakeSsrsAdapter Fake { get; } = new();

    public int SessionCount =>
        Services.GetRequiredService<IViewerSessionStore>().Count;

    public void ConfigureSessionIdleTimeout(TimeSpan idleTimeout)
    {
        _sessionIdleTimeoutMinutes = Math.Max(1, (int)Math.Ceiling(idleTimeout.TotalMinutes));
    }

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

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<ISsrsAdapter>();
            services.AddSingleton<ISsrsAdapter>(Fake);

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
