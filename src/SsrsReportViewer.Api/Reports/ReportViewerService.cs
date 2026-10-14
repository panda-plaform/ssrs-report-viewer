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

        var session = _sessions.Create(reportPath, execution);
        return await RenderSessionAsync(session, cancellationToken);
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

        var html = PrepareHtml(render, resourceRoot, replacementRoot);
        return new ViewReportResult(
            session.Id,
            html,
            new PageInfo(render.CurrentPage, render.PageCount),
            render.DocumentMap);
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
    IReadOnlyList<DocumentMapNode>? DocumentMap);

public sealed record PageInfo(int CurrentPage, int PageCount);
