using System.Collections.Concurrent;
using System.Text;
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
public sealed class FakeSsrsAdapter : ISsrsAdapter
{
    private readonly Dictionary<string, CatalogChildren> _catalog = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, SeededReport> _reports = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, FakeExecution> _executions = new(StringComparer.Ordinal);

    /// <summary>
    /// Counts any Viewer Session / Execution mutations. Catalog ListChildren must leave this at 0.
    /// </summary>
    public int ViewerSessionMutations { get; private set; }

    public int ActiveExecutionCount => _executions.Count;

    /// <summary>Optional delay applied inside RenderStreamAsync (busy serialization tests).</summary>
    public TimeSpan StreamDelay { get; set; } = TimeSpan.Zero;

    public void Reset()
    {
        _catalog.Clear();
        _reports.Clear();
        _executions.Clear();
        ViewerSessionMutations = 0;
        StreamDelay = TimeSpan.Zero;
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
        int pageCount = 1)
    {
        var path = NormalizePath(reportPath);
        _reports[path] = new SeededReport(
            path,
            parameters.ToList(),
            html,
            (streams ?? []).ToDictionary(s => s.StreamId, s => s, StringComparer.Ordinal),
            Math.Max(1, pageCount));
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
        _executions[id] = new FakeExecution(id, report, new Dictionary<string, IReadOnlyList<string>>(StringComparer.OrdinalIgnoreCase));
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

        var html = exec.Report.HtmlTemplate;
        foreach (var (name, values) in exec.Parameters)
        {
            html = html.Replace($"{{{{{name}}}}}", string.Join(",", values), StringComparison.OrdinalIgnoreCase);
        }

        var resourceRoot = deviceInfo.ResourceStreamRoot ?? "{ResourceStreamRoot}";
        html = html.Replace("{ResourceStreamRoot}", resourceRoot, StringComparison.Ordinal);

        foreach (var streamId in exec.Report.Streams.Keys)
        {
            html = html.Replace(
                $"{{resource:{streamId}}}",
                resourceRoot + streamId,
                StringComparison.Ordinal);
        }

        // Ensure View Report responses expose the API resource root when streams exist.
        if (exec.Report.Streams.Count > 0 &&
            !html.Contains(resourceRoot, StringComparison.Ordinal) &&
            !string.IsNullOrEmpty(deviceInfo.ResourceStreamRoot))
        {
            html += $"<!-- resources:{deviceInfo.ResourceStreamRoot} -->";
        }

        var currentPage = deviceInfo.Section ?? 1;
        if (currentPage < 1)
        {
            currentPage = 1;
        }
        else if (currentPage > exec.Report.PageCount)
        {
            currentPage = exec.Report.PageCount;
        }

        // Expose DeviceInfo Zoom / Section and Execution id so HTTP tests can assert SSRS re-render.
        html =
            $"<div data-exec=\"{exec.Id}\" data-zoom=\"{deviceInfo.ZoomPercent}\" data-page=\"{currentPage}\">{html}</div>";

        var bytes = Encoding.UTF8.GetBytes(html);
        var streamIds = exec.Report.Streams.Keys.ToArray();
        return Task.FromResult(new RenderResult(
            bytes,
            "text/html",
            streamIds,
            PageCount: exec.Report.PageCount,
            CurrentPage: currentPage));
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
        string HtmlTemplate,
        Dictionary<string, FakeStream> Streams,
        int PageCount);

    private sealed class FakeExecution(
        string Id,
        SeededReport Report,
        Dictionary<string, IReadOnlyList<string>> Parameters)
    {
        public string Id { get; } = Id;
        public SeededReport Report { get; } = Report;
        public Dictionary<string, IReadOnlyList<string>> Parameters { get; } = Parameters;
    }
}
