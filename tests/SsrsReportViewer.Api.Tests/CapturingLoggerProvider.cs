using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace SsrsReportViewer.Api.Tests;

/// <summary>
/// Test-host logger capture seam for high-value observability assertions (ADR-0006).
/// </summary>
public sealed class CapturingLoggerProvider : ILoggerProvider
{
    private readonly ConcurrentQueue<CapturedLogEntry> _entries = new();

    public IReadOnlyList<CapturedLogEntry> Entries => _entries.ToArray();

    public void Clear()
    {
        while (_entries.TryDequeue(out _))
        {
        }
    }

    public ILogger CreateLogger(string categoryName) => new CapturingLogger(categoryName, _entries);

    public void Dispose()
    {
    }

    private sealed class CapturingLogger(
        string categoryName,
        ConcurrentQueue<CapturedLogEntry> entries) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        private static bool IsAppCategory(string category) =>
            category.StartsWith("SsrsReportViewer", StringComparison.Ordinal);

        // Information+ for app categories so View Report start logs are assertable (ADR-0006).
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

            entries.Enqueue(new CapturedLogEntry(
                categoryName,
                logLevel,
                formatter(state, exception),
                exception,
                state));
        }
    }
}

public sealed record CapturedLogEntry(
    string Category,
    LogLevel Level,
    string Message,
    Exception? Exception,
    object? State);
