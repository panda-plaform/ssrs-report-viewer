using System.Text;
using Microsoft.Extensions.Options;
using SsrsReportViewer.Api.Sessions;
using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Reports;

public sealed class ReportViewerService
{
    private readonly ISsrsAdapter _ssrs;
    private readonly IViewerSessionStore _sessions;
    private readonly SsrsOptions _options;

    public ReportViewerService(
        ISsrsAdapter ssrs,
        IViewerSessionStore sessions,
        IOptions<SsrsOptions> options)
    {
        _ssrs = ssrs;
        _sessions = sessions;
        _options = options.Value;
    }

    public Task<IReadOnlyList<ReportParameterDefinition>> GetParametersAsync(
        string reportPath,
        IReadOnlyList<ParameterValue>? valuesForCascading,
        CancellationToken cancellationToken) =>
        _ssrs.GetParametersAsync(reportPath, valuesForCascading, cancellationToken);

    public async Task<ViewReportResult> ViewReportAsync(
        string reportPath,
        IReadOnlyList<ParameterValue> parameters,
        CancellationToken cancellationToken)
    {
        var definitions = await _ssrs.GetParametersAsync(reportPath, parameters, cancellationToken);
        var missing = definitions
            .Where(d => d.Required)
            .Where(d =>
            {
                var submitted = parameters.FirstOrDefault(p =>
                    string.Equals(p.Name, d.Name, StringComparison.OrdinalIgnoreCase));
                return submitted is null || submitted.Values.Count == 0 ||
                       submitted.Values.All(string.IsNullOrWhiteSpace);
            })
            .Select(d => d.Name)
            .ToArray();

        if (missing.Length > 0)
        {
            throw new RequiredParameterMissingException(missing);
        }

        var execution = await _ssrs.LoadReportAsync(reportPath, cancellationToken);
        await _ssrs.SetParametersAsync(execution, parameters, _options.DefaultCulture, cancellationToken);

        var session = _sessions.Create(reportPath, execution, parameters);
        return await RenderSessionAsync(session, cancellationToken);
    }

    public async Task<ViewReportResult> DrillthroughAsync(
        string sessionId,
        string reportPath,
        IReadOnlyList<ParameterValue> parameters,
        ViewerSessionGuard guard,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(reportPath))
        {
            throw new ArgumentException("reportPath is required.", nameof(reportPath));
        }

        return await guard.ExecuteAsync(
            sessionId,
            async (session, ct) =>
            {
                var definitions = await _ssrs.GetParametersAsync(reportPath, parameters, ct);
                var missing = definitions
                    .Where(d => d.Required)
                    .Where(d =>
                    {
                        var submitted = parameters.FirstOrDefault(p =>
                            string.Equals(p.Name, d.Name, StringComparison.OrdinalIgnoreCase));
                        return submitted is null || submitted.Values.Count == 0 ||
                               submitted.Values.All(string.IsNullOrWhiteSpace);
                    })
                    .Select(d => d.Name)
                    .ToArray();

                if (missing.Length > 0)
                {
                    throw new RequiredParameterMissingException(missing);
                }

                var execution = await _ssrs.LoadReportAsync(reportPath, ct);
                await _ssrs.SetParametersAsync(execution, parameters, _options.DefaultCulture, ct);
                session.DrillthroughTo(reportPath, execution, parameters);

                return await RenderSessionAsync(session, ct);
            },
            cancellationToken);
    }

    public async Task<ViewReportResult> BackAsync(
        string sessionId,
        ViewerSessionGuard guard,
        CancellationToken cancellationToken)
    {
        return await guard.ExecuteAsync(
            sessionId,
            async (session, ct) =>
            {
                var entry = session.PopBack();

                try
                {
                    session.Restore(entry, entry.Execution);
                    return await RenderSessionAsync(session, ct);
                }
                catch (ExecutionNotFoundException)
                {
                    var execution = await _ssrs.LoadReportAsync(entry.ReportPath, ct);
                    await _ssrs.SetParametersAsync(
                        execution,
                        entry.Parameters,
                        _options.DefaultCulture,
                        ct);
                    session.Restore(entry, execution);
                    return await RenderSessionAsync(session, ct);
                }
            },
            cancellationToken);
    }

    public async Task<ViewReportResult> SetZoomAsync(
        string sessionId,
        int zoomPercent,
        ViewerSessionGuard guard,
        CancellationToken cancellationToken)
    {
        if (zoomPercent is < 10 or > 500)
        {
            throw new InvalidViewerInteractionException($"Zoom percent '{zoomPercent}' is out of range (10-500).");
        }

        return await guard.ExecuteAsync(
            sessionId,
            async (session, ct) =>
            {
                session.ZoomPercent = zoomPercent;
                return await RenderSessionAsync(session, ct);
            },
            cancellationToken);
    }

    public async Task<ViewReportResult> SetPageAsync(
        string sessionId,
        string action,
        int? page,
        ViewerSessionGuard guard,
        CancellationToken cancellationToken)
    {
        return await guard.ExecuteAsync(
            sessionId,
            async (session, ct) =>
            {
                var target = ResolveTargetPage(session, action, page);
                if (target < 1 || target > Math.Max(1, session.PageCount))
                {
                    throw new InvalidViewerInteractionException(
                        $"Report Page '{target}' is outside 1–{Math.Max(1, session.PageCount)}.");
                }

                session.CurrentPage = target;
                return await RenderSessionAsync(session, ct);
            },
            cancellationToken);
    }

    public async Task<ViewReportResult> RefreshAsync(
        string sessionId,
        ViewerSessionGuard guard,
        CancellationToken cancellationToken)
    {
        return await guard.ExecuteAsync(
            sessionId,
            async (session, ct) =>
            {
                var execution = await _ssrs.LoadReportAsync(session.ReportPath, ct);
                await _ssrs.SetParametersAsync(
                    execution,
                    session.Parameters,
                    _options.DefaultCulture,
                    ct);
                session.ReplaceExecution(execution);
                session.CurrentPage = 1;
                return await RenderSessionAsync(session, ct);
            },
            cancellationToken);
    }

    public Task<ViewReportResult> ToggleAsync(
        string sessionId,
        string toggleId,
        ViewerSessionGuard guard,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(toggleId))
        {
            throw new ArgumentException("toggleId is required.", nameof(toggleId));
        }

        return guard.ExecuteAsync(
            sessionId,
            async (session, ct) =>
            {
                await _ssrs.ToggleItemAsync(session.Execution, toggleId, ct);
                return await RenderSessionAsync(session, ct);
            },
            cancellationToken);
    }

    public async Task<StreamResult> GetResourceAsync(
        string sessionId,
        string streamId,
        ViewerSessionGuard guard,
        CancellationToken cancellationToken)
    {
        return await guard.ExecuteAsync(
            sessionId,
            (session, ct) => _ssrs.RenderStreamAsync(session.Execution, "HTML4.0", streamId, ct),
            cancellationToken);
    }

    public Task<ViewReportResult> NavigateDocumentMapAsync(
        string sessionId,
        string documentMapId,
        ViewerSessionGuard guard,
        CancellationToken cancellationToken)
    {
        return guard.ExecuteAsync(
            sessionId,
            async (session, ct) =>
            {
                await _ssrs.NavigateDocumentMapAsync(session.Execution, documentMapId, ct);
                return await RenderSessionAsync(session, ct);
            },
            cancellationToken);
    }

    public Task<ViewReportResult> NavigateBookmarkAsync(
        string sessionId,
        string bookmarkId,
        ViewerSessionGuard guard,
        CancellationToken cancellationToken)
    {
        return guard.ExecuteAsync(
            sessionId,
            async (session, ct) =>
            {
                await _ssrs.NavigateBookmarkAsync(session.Execution, bookmarkId, ct);
                return await RenderSessionAsync(session, ct);
            },
            cancellationToken);
    }

    public async Task<ExportResult> ExportAsync(
        string sessionId,
        string format,
        ViewerSessionGuard guard,
        CancellationToken cancellationToken)
    {
        var normalized = NormalizeExportFormat(format);
        return await guard.ExecuteAsync(
            sessionId,
            async (session, ct) =>
            {
                var deviceInfo = new DeviceInfo(
                    HtmlFragment: true,
                    Toolbar: false,
                    ZoomPercent: session.ZoomPercent,
                    Section: session.CurrentPage);

                var render = await _ssrs.RenderAsync(session.Execution, normalized, deviceInfo, ct);
                var fileName = BuildExportFileName(session.ReportPath, normalized);
                return new ExportResult(render.Content, render.MimeType, fileName);
            },
            cancellationToken);
    }

    public Task<FindResult> FindAsync(
        string sessionId,
        string findValue,
        ViewerSessionGuard guard,
        CancellationToken cancellationToken) =>
        guard.ExecuteAsync(
            sessionId,
            (session, ct) => FindOnSessionAsync(session, findValue, nextMatch: false, ct),
            cancellationToken);

    public Task<FindResult> FindNextAsync(
        string sessionId,
        string findValue,
        ViewerSessionGuard guard,
        CancellationToken cancellationToken) =>
        guard.ExecuteAsync(
            sessionId,
            (session, ct) => FindOnSessionAsync(session, findValue, nextMatch: true, ct),
            cancellationToken);

    private async Task<FindResult> FindOnSessionAsync(
        ViewerSession session,
        string findValue,
        bool nextMatch,
        CancellationToken cancellationToken)
    {
        var pageCount = Math.Max(1, session.PageCount);
        var currentPage = Math.Clamp(session.CurrentPage, 1, pageCount);

        int startPage;
        int endPage;
        if (nextMatch)
        {
            startPage = currentPage >= pageCount ? 1 : currentPage + 1;
            endPage = currentPage;
        }
        else
        {
            startPage = 1;
            endPage = pageCount;
        }

        var foundPage = await _ssrs.FindStringAsync(
            session.Execution,
            startPage,
            endPage,
            findValue,
            cancellationToken);

        var found = foundPage > 0;
        if (found)
        {
            session.CurrentPage = foundPage;
        }

        var render = await RenderSessionAsync(session, cancellationToken);
        return new FindResult(
            render.Html,
            found,
            new PageInfo(session.CurrentPage, session.PageCount));
    }

    private async Task<ViewReportResult> RenderSessionAsync(
        ViewerSession session,
        CancellationToken cancellationToken)
    {
        var resourceRoot = $"/api/sessions/{session.Id}/resources/";
        var replacementRoot = $"/api/sessions/{session.Id}/actions/";
        var deviceInfo = new DeviceInfo(
            HtmlFragment: true,
            Toolbar: false,
            ZoomPercent: session.ZoomPercent,
            Section: session.CurrentPage,
            ReplacementRoot: replacementRoot,
            ResourceStreamRoot: resourceRoot);

        var render = await _ssrs.RenderAsync(session.Execution, "HTML4.0", deviceInfo, cancellationToken);
        session.CurrentPage = render.CurrentPage;
        session.PageCount = render.PageCount;

        var html = PrepareHtml(render, resourceRoot, replacementRoot);
        return new ViewReportResult(
            session.Id,
            html,
            new PageInfo(render.CurrentPage, render.PageCount),
            session.ZoomPercent,
            render.DocumentMap,
            session.CanGoBack);
    }

    private static int ResolveTargetPage(ViewerSession session, string action, int? page)
    {
        var normalized = action.Trim().ToLowerInvariant();
        return normalized switch
        {
            "next" => session.CurrentPage + 1,
            "previous" or "prev" => session.CurrentPage - 1,
            "goto" => page ?? throw new InvalidViewerInteractionException("page is required for goto."),
            _ => throw new InvalidViewerInteractionException($"Unknown page action '{action}'."),
        };
    }

    private static string NormalizeExportFormat(string format)
    {
        if (string.IsNullOrWhiteSpace(format))
        {
            throw new UnsupportedExportFormatException(format ?? string.Empty);
        }

        var normalized = format.Trim().ToUpperInvariant();
        return normalized switch
        {
            "PDF" => "PDF",
            "EXCELOPENXML" => "EXCELOPENXML",
            "CSV" => "CSV",
            _ => throw new UnsupportedExportFormatException(format),
        };
    }

    private static string BuildExportFileName(string reportPath, string format)
    {
        var leaf = reportPath.Trim('/').Split('/').LastOrDefault();
        if (string.IsNullOrWhiteSpace(leaf))
        {
            leaf = "report";
        }

        var extension = format switch
        {
            "PDF" => "pdf",
            "EXCELOPENXML" => "xlsx",
            "CSV" => "csv",
            _ => "bin",
        };

        return $"{leaf}.{extension}";
    }

    private static string PrepareHtml(RenderResult render, string resourceRoot, string? replacementRoot)
    {
        var html = Encoding.UTF8.GetString(render.Content);
        html = RewriteResourcePlaceholders(html, resourceRoot, render.StreamIds);
        if (!string.IsNullOrEmpty(replacementRoot))
        {
            html = html.Replace("{ReplacementRoot}", replacementRoot, StringComparison.Ordinal);
        }

        return ActionLinkRewriter.Rewrite(html, replacementRoot);
    }

    private static string RewriteResourcePlaceholders(
        string html,
        string resourceRoot,
        IReadOnlyList<string> streamIds)
    {
        var rewritten = html.Replace("{ResourceStreamRoot}", resourceRoot, StringComparison.Ordinal);
        foreach (var streamId in streamIds)
        {
            rewritten = rewritten.Replace(
                $"{{resource:{streamId}}}",
                resourceRoot + Uri.EscapeDataString(streamId),
                StringComparison.Ordinal);
        }

        return rewritten;
    }
}

public sealed record ViewReportResult(
    string SessionId,
    string Html,
    PageInfo PageInfo,
    int ZoomPercent,
    IReadOnlyList<DocumentMapNode>? DocumentMap,
    bool CanGoBack);

public sealed record FindResult(string Html, bool Found, PageInfo PageInfo);

public sealed record PageInfo(int CurrentPage, int PageCount);

public sealed record ExportResult(byte[] Content, string MimeType, string FileName);

public sealed class UnsupportedExportFormatException : Exception
{
    public UnsupportedExportFormatException(string format)
        : base($"Unsupported Export format '{format}'. Use PDF, EXCELOPENXML, or CSV.")
    {
        Format = format;
    }

    public string Format { get; }
}

public sealed class InvalidViewerInteractionException : Exception
{
    public InvalidViewerInteractionException(string message)
        : base(message)
    {
    }
}
