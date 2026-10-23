using SsrsReportViewer.Api.Hosting;
using SsrsReportViewer.Api.Shared;
using SsrsReportViewer.Api.Sessions;
using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Features.ActionLinks;

/// <summary>
/// Action Links vertical slice: Drilldown, Sort, Bookmark, and Execution resource streams (#66).
/// HTML Action Link rewrite lives beside these endpoints; client ReportSurface delegates clicks (ADR-0003).
/// </summary>
public static class ActionLinksEndpoints
{
    public static IEndpointRouteBuilder MapActionLinksEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var sessions = endpoints.MapGroup("/api/sessions/{sessionId}");

        sessions.MapPost("/bookmark", async (
            string sessionId,
            BookmarkNavigateRequest request,
            ReportViewerService viewer,
            ViewerSessionGuard guard,
            ViewerSessionProblemMapper sessionProblems,
            CancellationToken cancellationToken) =>
        {
            if (string.IsNullOrWhiteSpace(request.Id))
            {
                return Results.Problem(
                    detail: "id is required.",
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Bookmark request");
            }

            return await sessionProblems.ExecuteAsync(async () =>
            {
                var result = await viewer.NavigateBookmarkAsync(sessionId, request.Id.Trim(), guard, cancellationToken);
                return Results.Ok(SessionResponse.From(result));
            });
        });

        sessions.MapGet("/resources/{streamId}", async (
            string sessionId,
            string streamId,
            ReportViewerService viewer,
            ViewerSessionGuard guard,
            ViewerSessionProblemMapper sessionProblems,
            CancellationToken cancellationToken) =>
            await sessionProblems.ExecuteAsync(async () =>
            {
                var stream = await viewer.GetResourceAsync(sessionId, streamId, guard, cancellationToken);
                return Results.File(stream.Content, stream.MimeType);
            }));

        // Drilldown (glossary) — keep /toggle as backward-compatible alias for ToggleItem.
        async Task<IResult> DrilldownToggleAsync(
            string sessionId,
            ToggleRequest request,
            ReportViewerService viewer,
            ViewerSessionGuard guard,
            ViewerSessionProblemMapper sessionProblems,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(request.ToggleId))
            {
                return Results.Problem(
                    detail: "toggleId is required.",
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Drilldown toggle request");
            }

            return await sessionProblems.ExecuteAsync(async () =>
            {
                var result = await viewer.ToggleAsync(sessionId, request.ToggleId, guard, cancellationToken);
                return Results.Ok(SessionResponse.From(result));
            });
        }

        sessions.MapPost("/drilldown", DrilldownToggleAsync);
        sessions.MapPost("/toggle", DrilldownToggleAsync);

        sessions.MapPost("/sort", async (
            string sessionId,
            SortRequest request,
            ReportViewerService viewer,
            ViewerSessionGuard guard,
            ViewerSessionProblemMapper sessionProblems,
            CancellationToken cancellationToken) =>
        {
            if (string.IsNullOrWhiteSpace(request.SortItem))
            {
                return Results.Problem(
                    detail: "sortItem is required.",
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Sort request");
            }

            if (!TryParseSortDirection(request.Direction, out var direction))
            {
                return Results.Problem(
                    detail: "direction must be Ascending, Descending, or None.",
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Sort request");
            }

            return await sessionProblems.ExecuteAsync(async () =>
            {
                var result = await viewer.SortAsync(
                    sessionId,
                    request.SortItem,
                    direction,
                    request.Clear ?? false,
                    guard,
                    cancellationToken);
                return Results.Ok(SessionResponse.From(result));
            });
        });

        return endpoints;
    }

    private static bool TryParseSortDirection(string? value, out SortDirection direction)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            direction = SortDirection.Ascending;
            return true;
        }

        return Enum.TryParse(value.Trim(), ignoreCase: true, out direction);
    }
}

public sealed record BookmarkNavigateRequest(string? Id);

public sealed record ToggleRequest(string? ToggleId);

public sealed record SortRequest(string? SortItem, string? Direction, bool? Clear);
