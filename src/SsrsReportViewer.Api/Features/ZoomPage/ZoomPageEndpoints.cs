using SsrsReportViewer.Api.Hosting;
using SsrsReportViewer.Api.Shared;
using SsrsReportViewer.Api.Sessions;

namespace SsrsReportViewer.Api.Features.ZoomPage;

/// <summary>
/// Zoom, Report Page, and refresh Viewer Session endpoints (ADR-0004 / ADR-0005).
/// Zoom remains an SSRS re-render via DeviceInfo; no product behaviour change in this slice.
/// </summary>
public static class ZoomPageEndpoints
{
    public static RouteGroupBuilder MapZoomPageEndpoints(this RouteGroupBuilder group)
    {
        group.MapPost("/zoom", SetZoomAsync);
        group.MapPost("/page", SetPageAsync);
        group.MapPost("/refresh", RefreshAsync);
        return group;
    }

    private static async Task<IResult> SetZoomAsync(
        string sessionId,
        ZoomRequest request,
        ReportViewerService viewer,
        ViewerSessionGuard guard,
        ViewerSessionProblemMapper sessionProblems,
        CancellationToken cancellationToken) =>
        await sessionProblems.ExecuteAsync(async () =>
        {
            var result = await viewer.SetZoomAsync(sessionId, request.ZoomPercent, guard, cancellationToken);
            return Results.Ok(SessionResponse.From(result));
        });

    private static async Task<IResult> SetPageAsync(
        string sessionId,
        PageRequest request,
        ReportViewerService viewer,
        ViewerSessionGuard guard,
        ViewerSessionProblemMapper sessionProblems,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Action))
        {
            return Results.Problem(
                detail: "action is required (next, previous, or goto).",
                statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid Report Page request");
        }

        return await sessionProblems.ExecuteAsync(async () =>
        {
            var result = await viewer.SetPageAsync(
                sessionId,
                request.Action,
                request.Page,
                guard,
                cancellationToken);
            return Results.Ok(SessionResponse.From(result));
        });
    }

    private static async Task<IResult> RefreshAsync(
        string sessionId,
        ReportViewerService viewer,
        ViewerSessionGuard guard,
        ViewerSessionProblemMapper sessionProblems,
        CancellationToken cancellationToken) =>
        await sessionProblems.ExecuteAsync(async () =>
        {
            var result = await viewer.RefreshAsync(sessionId, guard, cancellationToken);
            return Results.Ok(SessionResponse.From(result));
        });
}

public sealed record ZoomRequest(int ZoomPercent);

public sealed record PageRequest(string? Action, int? Page);
