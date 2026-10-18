using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace SsrsReportViewer.Api.Tests;

/// <summary>
/// Test-host logger capture seam for high-value observability assertions (ADR-0006).
/// Implements <see cref="ISupportExternalScope"/> so BeginScope from the host logger factory
/// is visible on captured entries (Find/Export/View Report scopes are assertable).
/// </summary>
public sealed class CapturingLoggerProvider : ILoggerProvider, ISupportExternalScope
{
    private readonly ConcurrentQueue<CapturedLogEntry> _entries = new();
    private IExternalScopeProvider _scopeProvider = new LoggerExternalScopeProvider();

    public IReadOnlyList<CapturedLogEntry> Entries => _entries.ToArray();

    public void Clear()
    {
        while (_entries.TryDequeue(out _))
        {
        }
    }

    public void SetScopeProvider(IExternalScopeProvider scopeProvider) =>
        _scopeProvider = scopeProvider;

    public ILogger CreateLogger(string categoryName) =>
        new CapturingLogger(categoryName, _entries, () => _scopeProvider);

    public void Dispose()
    {
    }

    private sealed class CapturingLogger(
        string categoryName,
        ConcurrentQueue<CapturedLogEntry> entries,
        Func<IExternalScopeProvider> scopeProvider) : ILogger
    {
        private static bool IsAppCategory(string category) =>
            category.StartsWith("SsrsReportViewer", StringComparison.Ordinal);

        public IDisposable BeginScope<TState>(TState state) where TState : notnull =>
            scopeProvider().Push(state);

        // Information+ for app categories so View Report / Find / Export logs are assertable (ADR-0006).
        public bool IsEnabled(LogLevel logLevel) =>
            IsAppCategory(categoryName) && logLevel >= LogLevel.Information;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel))
            {
                return;
            }

            var scopes = new List<object?>();
            scopeProvider().ForEachScope((scope, bag) => bag.Add(scope), scopes);

            entries.Enqueue(new CapturedLogEntry(
                categoryName,
                logLevel,
                formatter(state, exception),
                exception,
                state,
                scopes));
        }
    }
}

public sealed record CapturedLogEntry(
    string Category,
    LogLevel Level,
    string Message,
    Exception? Exception,
    object? State,
    IReadOnlyList<object?> Scopes);
