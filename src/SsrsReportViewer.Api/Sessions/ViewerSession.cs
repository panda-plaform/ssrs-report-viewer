using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Sessions;

/// <summary>
/// In-memory Viewer Session bound to one SSRS Execution.
/// </summary>
public sealed class ViewerSession : IAsyncDisposable
{
    private readonly SemaphoreSlim _gate = new(1, 1);

    public ViewerSession(
        string id,
        string reportPath,
        ExecutionHandle execution,
        IReadOnlyList<ParameterValue> parameters,
        DateTimeOffset createdAt)
    {
        Id = id;
        ReportPath = reportPath;
        Execution = execution;
        Parameters = parameters;
        LastActivityUtc = createdAt;
    }

    public string Id { get; }

    public string ReportPath { get; }

    public ExecutionHandle Execution { get; private set; }

    public IReadOnlyList<ParameterValue> Parameters { get; }

    public DateTimeOffset LastActivityUtc { get; private set; }

    public int ZoomPercent { get; set; } = 100;

    public int CurrentPage { get; set; } = 1;

    public int PageCount { get; set; } = 1;

    public void ReplaceExecution(ExecutionHandle execution) => Execution = execution;

    public void Touch(DateTimeOffset utcNow) => LastActivityUtc = utcNow;

    public bool IsExpired(DateTimeOffset utcNow, TimeSpan idleTimeout) =>
        utcNow - LastActivityUtc > idleTimeout;

    /// <summary>
    /// Tries to enter the per-session busy gate. Returns false if another SSRS op is in flight.
    /// </summary>
    public async Task<bool> TryEnterAsync(CancellationToken cancellationToken)
    {
        return await _gate.WaitAsync(0, cancellationToken);
    }

    public void Exit() => _gate.Release();

    public ValueTask DisposeAsync()
    {
        _gate.Dispose();
        return ValueTask.CompletedTask;
    }
}
