using Microsoft.Extensions.Logging;

namespace SsrsReportViewer.Api.Ssrs;

/// <summary>
/// Decorator that logs SSRS adapter faults without Service Account credentials (ADR-0006).
/// </summary>
public sealed class LoggingSsrsAdapter : ISsrsAdapter
{
    private readonly ISsrsAdapter _inner;
    private readonly ILogger<LoggingSsrsAdapter> _logger;

    public LoggingSsrsAdapter(ISsrsAdapter inner, ILogger<LoggingSsrsAdapter> logger)
    {
        _inner = inner;
        _logger = logger;
    }

    public Task<IReadOnlyList<CatalogItem>> ListChildrenAsync(
        string path,
        CancellationToken cancellationToken = default) =>
        ExecuteAsync(nameof(ListChildrenAsync), () => _inner.ListChildrenAsync(path, cancellationToken));

    public Task<IReadOnlyList<ReportParameterDefinition>> GetParametersAsync(
        string reportPath,
        bool forRendering,
        IReadOnlyList<ParameterValue>? valuesForCascading = null,
        CancellationToken cancellationToken = default) =>
        ExecuteAsync(
            nameof(GetParametersAsync),
            () => _inner.GetParametersAsync(reportPath, forRendering, valuesForCascading, cancellationToken));

    public Task<ExecutionHandle> LoadReportAsync(
        string reportPath,
        CancellationToken cancellationToken = default) =>
        ExecuteAsync(nameof(LoadReportAsync), () => _inner.LoadReportAsync(reportPath, cancellationToken));

    public Task SetParametersAsync(
        ExecutionHandle execution,
        IReadOnlyList<ParameterValue> values,
        string culture,
        CancellationToken cancellationToken = default) =>
        ExecuteAsync(
            nameof(SetParametersAsync),
            () => _inner.SetParametersAsync(execution, values, culture, cancellationToken));

    public Task<RenderResult> RenderAsync(
        ExecutionHandle execution,
        string format,
        DeviceInfo deviceInfo,
        CancellationToken cancellationToken = default) =>
        ExecuteAsync(
            nameof(RenderAsync),
            () => _inner.RenderAsync(execution, format, deviceInfo, cancellationToken));

    public Task<StreamResult> RenderStreamAsync(
        ExecutionHandle execution,
        string format,
        string streamId,
        CancellationToken cancellationToken = default) =>
        ExecuteAsync(
            nameof(RenderStreamAsync),
            () => _inner.RenderStreamAsync(execution, format, streamId, cancellationToken));

    public Task ToggleItemAsync(
        ExecutionHandle execution,
        string toggleId,
        CancellationToken cancellationToken = default) =>
        ExecuteAsync(
            nameof(ToggleItemAsync),
            () => _inner.ToggleItemAsync(execution, toggleId, cancellationToken));

    public Task<SortResult> SortAsync(
        ExecutionHandle execution,
        string sortItem,
        SortDirection direction,
        bool clear,
        CancellationToken cancellationToken = default) =>
        ExecuteAsync(
            nameof(SortAsync),
            () => _inner.SortAsync(execution, sortItem, direction, clear, cancellationToken));

    public Task<int> FindStringAsync(
        ExecutionHandle execution,
        int startPage,
        int endPage,
        string findValue,
        CancellationToken cancellationToken = default) =>
        ExecuteAsync(
            nameof(FindStringAsync),
            () => _inner.FindStringAsync(execution, startPage, endPage, findValue, cancellationToken));

    public Task NavigateDocumentMapAsync(
        ExecutionHandle execution,
        string documentMapId,
        CancellationToken cancellationToken = default) =>
        ExecuteAsync(
            nameof(NavigateDocumentMapAsync),
            () => _inner.NavigateDocumentMapAsync(execution, documentMapId, cancellationToken));

    public Task NavigateBookmarkAsync(
        ExecutionHandle execution,
        string bookmarkId,
        CancellationToken cancellationToken = default) =>
        ExecuteAsync(
            nameof(NavigateBookmarkAsync),
            () => _inner.NavigateBookmarkAsync(execution, bookmarkId, cancellationToken));

    public Task<byte[]> GetItemDefinitionAsync(
        string reportPath,
        CancellationToken cancellationToken = default) =>
        ExecuteAsync(
            nameof(GetItemDefinitionAsync),
            () => _inner.GetItemDefinitionAsync(reportPath, cancellationToken));

    private async Task ExecuteAsync(string operation, Func<Task> action)
    {
        try
        {
            await action();
        }
        catch (Exception ex) when (ShouldLogFault(ex))
        {
            LogFault(operation, ex);
            throw;
        }
    }

    private async Task<T> ExecuteAsync<T>(string operation, Func<Task<T>> action)
    {
        try
        {
            return await action();
        }
        catch (Exception ex) when (ShouldLogFault(ex))
        {
            LogFault(operation, ex);
            throw;
        }
    }

    /// <summary>
    /// Expected Catalog / Report not-found outcomes stay as HTTP mappings without Error noise.
    /// Unexpected SSRS SOAP / transport faults are logged.
    /// </summary>
    private static bool ShouldLogFault(Exception ex) =>
        ex is not OperationCanceledException
        and not CatalogPathNotFoundException
        and not ReportNotFoundException
        and not ParameterValueNotSetException
        and not ReportNotReadyException;

    private void LogFault(string operation, Exception ex)
    {
        // Structured dimensions only — never log SsrsOptions credentials / secrets.
        _logger.LogError(
            ex,
            "SSRS adapter fault during {Operation}",
            operation);
    }
}
