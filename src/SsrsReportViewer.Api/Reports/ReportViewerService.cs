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

    public async Task<ViewReportResult> SetZoomAsync(
        string sessionId,
        int zoomPercent,
        ViewerSessionGuard guard,
        CancellationToken cancellationToken)
    {
        if (zoomPercent is < 10 or > 500)
        {
            throw new InvalidViewerInteractionException($"Zoom percent '{zoomPercent}' is out of range (10–500).");
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

    private async Task<ViewReportResult> RenderSessionAsync(
        ViewerSession session,
        CancellationToken cancellationToken)
    {
        var resourceRoot = $"/api/sessions/{session.Id}/resources/";
        var deviceInfo = new DeviceInfo(
            HtmlFragment: true,
            Toolbar: false,
            ZoomPercent: session.ZoomPercent,
            Section: session.CurrentPage,
            ReplacementRoot: $"/api/sessions/{session.Id}/actions/",
            ResourceStreamRoot: resourceRoot);

        var render = await _ssrs.RenderAsync(session.Execution, "HTML4.0", deviceInfo, cancellationToken);
        session.CurrentPage = render.CurrentPage;
        session.PageCount = render.PageCount;

        var html = Encoding.UTF8.GetString(render.Content);
        html = RewriteResourcePlaceholders(html, resourceRoot, render.StreamIds);

        return new ViewReportResult(
            session.Id,
            html,
            new PageInfo(render.CurrentPage, render.PageCount),
            session.ZoomPercent);
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

public sealed record ViewReportResult(string SessionId, string Html, PageInfo PageInfo, int ZoomPercent);

public sealed record PageInfo(int CurrentPage, int PageCount);

public sealed class InvalidViewerInteractionException : Exception
{
    public InvalidViewerInteractionException(string message)
        : base(message)
    {
    }
}
