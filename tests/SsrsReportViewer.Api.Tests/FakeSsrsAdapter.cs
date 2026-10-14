using System.Collections.Concurrent;
using System.Text;
using System.Text.RegularExpressions;
using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Tests;

public sealed record FakeReportParameter(
    string Name,
    string DataType,
    bool Nullable,
    bool MultiValue,
    string? Prompt,
    bool Required,
    IReadOnlyList<string>? DefaultValues = null,
    IReadOnlyList<(string Label, string Value)>? ValidValues = null,
    IReadOnlyList<string>? Dependencies = null);

public sealed record FakeStream(string StreamId, string MimeType, byte[] Content);

/// <summary>
/// In-memory SSRS adapter for API tests. Catalog + Report Parameter + Execution behaviors.
/// </summary>
public sealed partial class FakeSsrsAdapter : ISsrsAdapter
{
    private readonly Dictionary<string, CatalogChildren> _catalog = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, SeededReport> _reports = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, FakeExecution> _executions = new(StringComparer.Ordinal);

    /// <summary>
    /// Counts any Viewer Session / Execution mutations. Catalog ListChildren must leave this at 0.
    /// </summary>
    public int ViewerSessionMutations { get; private set; }

    public int ActiveExecutionCount => _executions.Count;

    /// <summary>Execution id from the most recent LoadReportAsync call.</summary>
    public string? LastLoadedExecutionId { get; private set; }

    /// <summary>Optional delay applied inside RenderStreamAsync (busy serialization tests).</summary>
    public TimeSpan StreamDelay { get; set; } = TimeSpan.Zero;

    public void Reset()
    {
        _catalog.Clear();
        _reports.Clear();
        _executions.Clear();
        ViewerSessionMutations = 0;
        StreamDelay = TimeSpan.Zero;
        LastLoadedExecutionId = null;
    }

    public void ResetCatalog() => Reset();

    public void SeedCatalog(
        string folder,
        IReadOnlyList<(string Path, string Name)> folders,
        IReadOnlyList<(string Path, string Name)> reports)
    {
        var key = NormalizePath(folder);
        _catalog[key] = new CatalogChildren(
            folders.Select(f => new CatalogItem(f.Name, NormalizePath(f.Path), CatalogItemType.Folder)).ToList(),
            reports.Select(r => new CatalogItem(r.Name, NormalizePath(r.Path), CatalogItemType.Report)).ToList());
    }

    public void SeedReport(
        string reportPath,
        IReadOnlyList<FakeReportParameter> parameters,
        string html = "<div class=\"report\">ok</div>",
        IReadOnlyList<FakeStream>? streams = null,
        IReadOnlyList<string>? pageHtml = null)
    {
        var path = NormalizePath(reportPath);
        var pages = pageHtml is { Count: > 0 }
            ? pageHtml.ToList()
            : [html];
        _reports[path] = new SeededReport(
            path,
            parameters.ToList(),
            pages,
            (streams ?? []).ToDictionary(s => s.StreamId, s => s, StringComparer.Ordinal));
    }

    public Task<IReadOnlyList<CatalogItem>> ListChildrenAsync(string path, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var key = NormalizePath(path);
        if (!_catalog.TryGetValue(key, out var children))
        {
            throw new CatalogPathNotFoundException(key);
        }

        IReadOnlyList<CatalogItem> items =
            [.. children.Folders, .. children.Reports];
        return Task.FromResult(items);
    }

    public Task<IReadOnlyList<ReportParameterDefinition>> GetParametersAsync(
        string reportPath,
        IReadOnlyList<ParameterValue>? valuesForCascading = null,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var report = RequireReport(reportPath);

        IReadOnlyList<ReportParameterDefinition> defs = report.Parameters
            .Select(p => new ReportParameterDefinition(
                p.Name,
                p.DataType,
                p.Nullable,
                p.MultiValue,
                p.Required,
                p.Prompt,
                p.DefaultValues ?? [],
                (p.ValidValues ?? []).Select(v => new ReportParameterValidValue(v.Label, v.Value)).ToArray(),
                p.Dependencies ?? []))
            .ToArray();

        // Cascading is best-effort: presence of valuesForCascading is enough for the seam.
        _ = valuesForCascading;
        return Task.FromResult(defs);
    }

    public Task<ExecutionHandle> LoadReportAsync(string reportPath, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var report = RequireReport(reportPath);
        ViewerSessionMutations++;

        var id = Guid.NewGuid().ToString("N");
        LastLoadedExecutionId = id;
        _executions[id] = new FakeExecution(
            id,
            report,
            new Dictionary<string, IReadOnlyList<string>>(StringComparer.OrdinalIgnoreCase),
            new HashSet<string>(StringComparer.Ordinal),
            ActiveSort: null);
        return Task.FromResult(new ExecutionHandle(id));
    }

    public Task SetParametersAsync(
        ExecutionHandle execution,
        IReadOnlyList<ParameterValue> values,
        string culture,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var exec = RequireExecution(execution);
        ViewerSessionMutations++;
        _ = culture;

        foreach (var value in values)
        {
            exec.Parameters[value.Name] = value.Values;
        }

        return Task.CompletedTask;
    }

    public Task<RenderResult> RenderAsync(
        ExecutionHandle execution,
        string format,
        DeviceInfo deviceInfo,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var exec = RequireExecution(execution);
        ViewerSessionMutations++;

        if (!string.Equals(format, "HTML4.0", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(format, "HTML5", StringComparison.OrdinalIgnoreCase))
        {
            return Task.FromResult(RenderExport(exec, format, deviceInfo));
        }

        var pageCount = exec.Report.PageHtml.Count;
        var page = deviceInfo.Section ?? 1;
        if (page < 1)
        {
            page = 1;
        }

        if (page > pageCount)
        {
            page = pageCount;
        }

        var html = exec.Report.PageHtml[page - 1];
        foreach (var (name, values) in exec.Parameters)
        {
            html = html.Replace($"{{{{{name}}}}}", string.Join(",", values), StringComparison.OrdinalIgnoreCase);
        }

        var resourceRoot = deviceInfo.ResourceStreamRoot ?? "{ResourceStreamRoot}";
        var replacementRoot = deviceInfo.ReplacementRoot ?? "{ReplacementRoot}";
        html = html.Replace("{ResourceStreamRoot}", resourceRoot, StringComparison.Ordinal);
        html = html.Replace("{ReplacementRoot}", replacementRoot, StringComparison.Ordinal);

        foreach (var streamId in exec.Report.Streams.Keys)
        {
            html = html.Replace(
                $"{{resource:{streamId}}}",
                resourceRoot + streamId,
                StringComparison.Ordinal);
        }

        foreach (Match match in ToggleStatePlaceholderRegex().Matches(html))
        {
            var toggleId = match.Groups[1].Value;
            var state = exec.ToggledItems.Contains(toggleId) ? "expanded" : "collapsed";
            html = html.Replace(match.Value, state, StringComparison.Ordinal);
        }

        foreach (Match match in SortStatePlaceholderRegex().Matches(html))
        {
            var sortItem = match.Groups[1].Value;
            var state = exec.ActiveSort is not null
                && string.Equals(exec.ActiveSort.SortItem, sortItem, StringComparison.Ordinal)
                ? exec.ActiveSort.Direction.ToString()
                : "unsorted";
            html = html.Replace(match.Value, state, StringComparison.Ordinal);
        }

        // Ensure View Report responses expose the API resource root when streams exist.
        if (exec.Report.Streams.Count > 0 &&
            !html.Contains(resourceRoot, StringComparison.Ordinal) &&
            !string.IsNullOrEmpty(deviceInfo.ResourceStreamRoot))
        {
            html += $"<!-- resources:{deviceInfo.ResourceStreamRoot} -->";
        }

        var bytes = Encoding.UTF8.GetBytes(html);
        var streamIds = exec.Report.Streams.Keys.ToArray();
        return Task.FromResult(new RenderResult(bytes, "text/html", streamIds, PageCount: pageCount, CurrentPage: page));
    }

    public Task<int> FindStringAsync(
        ExecutionHandle execution,
        int startPage,
        int endPage,
        string findValue,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var exec = RequireExecution(execution);
        ViewerSessionMutations++;

        if (string.IsNullOrEmpty(findValue))
        {
            return Task.FromResult(0);
        }

        var pageCount = exec.Report.PageHtml.Count;
        if (pageCount == 0)
        {
            return Task.FromResult(0);
        }

        // Mirror ReportExecution2005 FindString wrap semantics.
        var start = startPage <= 0 ? 1 : startPage;
        var stop = endPage <= 0 ? start : endPage;
        if (start > pageCount)
        {
            start = 1;
        }

        if (stop > pageCount)
        {
            stop = pageCount;
        }

        var page = start;
        while (true)
        {
            if (exec.Report.PageHtml[page - 1].Contains(findValue, StringComparison.OrdinalIgnoreCase))
            {
                return Task.FromResult(page);
            }

            if (page == stop)
            {
                break;
            }

            page++;
            if (page > pageCount)
            {
                page = 1;
            }
        }

        return Task.FromResult(0);
    }

    private static RenderResult RenderExport(FakeExecution exec, string format, DeviceInfo deviceInfo)
    {
        var normalized = format.Trim().ToUpperInvariant();
        var (prefix, mime) = normalized switch
        {
            "PDF" => ("FAKE-PDF:", "application/pdf"),
            "EXCELOPENXML" => ("FAKE-XLSX:", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            "CSV" => ("FAKE-CSV:", "text/csv"),
            _ => throw new InvalidOperationException($"Unsupported Export format '{format}'."),
        };

        _ = deviceInfo;
        var bytes = Encoding.UTF8.GetBytes(prefix + exec.Id);
        return new RenderResult(bytes, mime, StreamIds: [], PageCount: 1, CurrentPage: 1);
    }

    public Task ToggleItemAsync(
        ExecutionHandle execution,
        string toggleId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var exec = RequireExecution(execution);
        ViewerSessionMutations++;

        if (string.IsNullOrWhiteSpace(toggleId))
        {
            throw new ArgumentException("toggleId is required.", nameof(toggleId));
        }

        if (!exec.ToggledItems.Add(toggleId))
        {
            exec.ToggledItems.Remove(toggleId);
        }

        return Task.CompletedTask;
    }

    public Task<SortResult> SortAsync(
        ExecutionHandle execution,
        string sortItem,
        SortDirection direction,
        bool clear,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var exec = RequireExecution(execution);
        ViewerSessionMutations++;

        if (string.IsNullOrWhiteSpace(sortItem))
        {
            throw new ArgumentException("sortItem is required.", nameof(sortItem));
        }

        if (clear || direction == SortDirection.None)
        {
            exec.ActiveSort = null;
        }
        else
        {
            exec.ActiveSort = new ActiveSort(sortItem.Trim(), direction);
        }

        return Task.FromResult(new SortResult(CurrentPage: 1, PageCount: 1, ReportItem: sortItem.Trim()));
    }

    public async Task<StreamResult> RenderStreamAsync(
        ExecutionHandle execution,
        string format,
        string streamId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var exec = RequireExecution(execution);
        ViewerSessionMutations++;

        if (StreamDelay > TimeSpan.Zero)
        {
            await Task.Delay(StreamDelay, cancellationToken);
        }

        if (!exec.Report.Streams.TryGetValue(streamId, out var stream))
        {
            throw new InvalidOperationException($"Unknown stream '{streamId}'.");
        }

        return new StreamResult(stream.Content, stream.MimeType);
    }

    private SeededReport RequireReport(string reportPath)
    {
        var path = NormalizePath(reportPath);
        if (!_reports.TryGetValue(path, out var report))
        {
            throw new ReportNotFoundException(path);
        }

        return report;
    }

    private FakeExecution RequireExecution(ExecutionHandle execution)
    {
        if (!_executions.TryGetValue(execution.Id, out var exec))
        {
            throw new InvalidOperationException($"Unknown Execution '{execution.Id}'.");
        }

        return exec;
    }

    private static string NormalizePath(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || path == "/")
        {
            return "/";
        }

        return "/" + path.Trim().Trim('/');
    }

    private sealed record CatalogChildren(
        IReadOnlyList<CatalogItem> Folders,
        IReadOnlyList<CatalogItem> Reports);

    private sealed record SeededReport(
        string Path,
        IReadOnlyList<FakeReportParameter> Parameters,
        IReadOnlyList<string> PageHtml,
        Dictionary<string, FakeStream> Streams);

    private sealed record ActiveSort(string SortItem, SortDirection Direction);

    private sealed class FakeExecution(
        string Id,
        SeededReport Report,
        Dictionary<string, IReadOnlyList<string>> Parameters,
        HashSet<string> ToggledItems,
        ActiveSort? ActiveSort)
    {
        public string Id { get; } = Id;
        public SeededReport Report { get; } = Report;
        public Dictionary<string, IReadOnlyList<string>> Parameters { get; } = Parameters;
        public HashSet<string> ToggledItems { get; } = ToggledItems;
        public ActiveSort? ActiveSort { get; set; } = ActiveSort;
    }

    [GeneratedRegex(@"\{toggle:([^}]+)\}", RegexOptions.CultureInvariant)]
    private static partial Regex ToggleStatePlaceholderRegex();

    [GeneratedRegex(@"\{sort:([^}]+)\}", RegexOptions.CultureInvariant)]
    private static partial Regex SortStatePlaceholderRegex();
}
