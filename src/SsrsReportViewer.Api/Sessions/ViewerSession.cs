using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Sessions;

/// <summary>
/// Snapshot of a Viewer Session entry pushed onto the Drillthrough back stack.
/// </summary>
public sealed record BackStackEntry(
    string ReportPath,
    IReadOnlyList<ParameterValue> Parameters,
    ExecutionHandle Execution,
    int ZoomPercent,
    int CurrentPage);

/// <summary>
/// In-memory Viewer Session bound to one SSRS Execution (plus Drillthrough back stack).
/// </summary>
public sealed class ViewerSession : IAsyncDisposable
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly Stack<BackStackEntry> _backStack = new();

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

    public string ReportPath { get; private set; }

    public ExecutionHandle Execution { get; private set; }

    public IReadOnlyList<ParameterValue> Parameters { get; private set; }

    public DateTimeOffset LastActivityUtc { get; private set; }

    public int ZoomPercent { get; set; } = 100;

    public int CurrentPage { get; set; } = 1;

    public int PageCount { get; set; } = 1;

    public bool CanGoBack => _backStack.Count > 0;

    public void Touch(DateTimeOffset utcNow) => LastActivityUtc = utcNow;

    public bool IsExpired(DateTimeOffset utcNow, TimeSpan idleTimeout) =>
        utcNow - LastActivityUtc > idleTimeout;

    public void PushBackStack()
    {
        _backStack.Push(new BackStackEntry(
            ReportPath,
            Parameters,
            Execution,
            ZoomPercent,
            CurrentPage));
    }

    public bool TryPopBackStack(out BackStackEntry? entry)
    {
        if (_backStack.Count == 0)
        {
            entry = null;
            return false;
        }

        entry = _backStack.Pop();
        return true;
    }

    public BackStackEntry PopBack()
    {
        if (!TryPopBackStack(out var entry) || entry is null)
        {
            throw new BackStackEmptyException(Id);
        }

        return entry;
    }

    public void ReplaceExecution(ExecutionHandle execution) =>
        SwitchTo(ReportPath, execution, Parameters);

    public void SwitchTo(
        string reportPath,
        ExecutionHandle execution,
        IReadOnlyList<ParameterValue> parameters)
    {
        ReportPath = reportPath;
        Execution = execution;
        Parameters = parameters;
    }

    /// <summary>
    /// Pushes the current entry onto the back stack and switches to a Drillthrough target.
    /// </summary>
    public void DrillthroughTo(
        string reportPath,
        ExecutionHandle execution,
        IReadOnlyList<ParameterValue> parameters)
    {
        PushBackStack();
        SwitchTo(reportPath, execution, parameters);
        CurrentPage = 1;
    }

    public void Restore(BackStackEntry entry) =>
        Restore(entry, entry.Execution);

    public void Restore(BackStackEntry entry, ExecutionHandle execution)
    {
        ReportPath = entry.ReportPath;
        Execution = execution;
        Parameters = entry.Parameters;
        ZoomPercent = entry.ZoomPercent;
        CurrentPage = entry.CurrentPage;
    }

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

public sealed class BackStackEmptyException : Exception
{
    public BackStackEmptyException(string sessionId)
        : base($"Viewer Session '{sessionId}' has an empty Drillthrough back stack.")
    {
        SessionId = sessionId;
    }

    public string SessionId { get; }
}
