using System.Collections.Concurrent;
using Microsoft.Extensions.Options;
using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Sessions;

public interface IViewerSessionStore
{
    int Count { get; }

    ViewerSession Create(
        string reportPath,
        ExecutionHandle execution,
        IReadOnlyList<ParameterValue> parameters);

    bool TryGet(string sessionId, out ViewerSession? session);

    void Remove(string sessionId);

    void Clear();
}

public sealed class ViewerSessionStore : IViewerSessionStore
{
    private readonly ConcurrentDictionary<string, ViewerSession> _sessions = new(StringComparer.Ordinal);
    private readonly TimeProvider _timeProvider;

    public ViewerSessionStore(TimeProvider timeProvider)
    {
        _timeProvider = timeProvider;
    }

    public int Count => _sessions.Count;

    public ViewerSession Create(
        string reportPath,
        ExecutionHandle execution,
        IReadOnlyList<ParameterValue> parameters)
    {
        var id = Guid.NewGuid().ToString("N");
        var session = new ViewerSession(
            id,
            reportPath,
            execution,
            parameters,
            _timeProvider.GetUtcNow());
        if (!_sessions.TryAdd(id, session))
        {
            throw new InvalidOperationException("Failed to allocate Viewer Session id.");
        }

        return session;
    }

    public bool TryGet(string sessionId, out ViewerSession? session) =>
        _sessions.TryGetValue(sessionId, out session);

    public void Remove(string sessionId)
    {
        if (_sessions.TryRemove(sessionId, out var session))
        {
            _ = session.DisposeAsync();
        }
    }

    public void Clear()
    {
        foreach (var key in _sessions.Keys)
        {
            Remove(key);
        }
    }
}

public sealed class ViewerSessionExpiredException : Exception
{
    public ViewerSessionExpiredException(string sessionId)
        : base($"Viewer Session '{sessionId}' has expired.")
    {
        SessionId = sessionId;
    }

    public string SessionId { get; }
}

public sealed class ViewerSessionBusyException : Exception
{
    public ViewerSessionBusyException(string sessionId)
        : base($"Viewer Session '{sessionId}' is busy with another operation.")
    {
        SessionId = sessionId;
    }

    public string SessionId { get; }
}

public sealed class ViewerSessionNotFoundException : Exception
{
    public ViewerSessionNotFoundException(string sessionId)
        : base($"Viewer Session '{sessionId}' was not found.")
    {
        SessionId = sessionId;
    }

    public string SessionId { get; }
}

/// <summary>
/// Resolves a Viewer Session, enforces idle TTL, and serializes per-session SSRS work.
/// </summary>
public sealed class ViewerSessionGuard
{
    private readonly IViewerSessionStore _store;
    private readonly TimeProvider _timeProvider;
    private readonly TimeSpan _idleTimeout;

    public ViewerSessionGuard(
        IViewerSessionStore store,
        TimeProvider timeProvider,
        IOptions<SsrsOptions> options)
    {
        _store = store;
        _timeProvider = timeProvider;
        _idleTimeout = TimeSpan.FromMinutes(Math.Max(1, options.Value.SessionIdleTimeoutMinutes));
    }

    public async Task<T> ExecuteAsync<T>(
        string sessionId,
        Func<ViewerSession, CancellationToken, Task<T>> action,
        CancellationToken cancellationToken)
    {
        if (!_store.TryGet(sessionId, out var session) || session is null)
        {
            throw new ViewerSessionNotFoundException(sessionId);
        }

        var now = _timeProvider.GetUtcNow();
        if (session.IsExpired(now, _idleTimeout))
        {
            _store.Remove(sessionId);
            throw new ViewerSessionExpiredException(sessionId);
        }

        if (!await session.TryEnterAsync(cancellationToken))
        {
            throw new ViewerSessionBusyException(sessionId);
        }

        try
        {
            session.Touch(_timeProvider.GetUtcNow());
            return await action(session, cancellationToken);
        }
        finally
        {
            session.Exit();
        }
    }
}
