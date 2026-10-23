using Microsoft.Extensions.Logging;
using SsrsReportViewer.Api.Shared;
using SsrsReportViewer.Api.Sessions;

namespace SsrsReportViewer.Api.Features.Find;

/// <summary>
/// Find / find-next Viewer Session endpoints and outcome logging (ADR-0005 / ADR-0006).
/// </summary>
public static class FindEndpoints
{
    /// <summary>Logger category type for Find observability (ADR-0006).</summary>
    public sealed class Log;

    public static RouteGroupBuilder MapFindEndpoints(this RouteGroupBuilder group)
    {
        group.MapPost("/find", FindAsync);
        group.MapPost("/find/next", FindNextAsync);
        return group;
    }

    private static async Task<IResult> FindAsync(
        string sessionId,
        FindRequest request,
        ReportViewerService viewer,
        ViewerSessionGuard guard,
        ViewerSessionProblemMapper sessionProblems,
        ILogger<Log> logger,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.FindValue))
        {
            return Results.Problem(
                detail: "findValue is required.",
                statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid Find request");
        }

        return await sessionProblems.ExecuteAsync(async () =>
        {
            var result = await viewer.FindAsync(
                sessionId,
                request.FindValue.Trim(),
                guard,
                cancellationToken);
            LogFindOutcome(logger, operation: "find", sessionId, result);
            return Results.Ok(ToFindPayload(result));
        }, sessionId);
    }

    private static async Task<IResult> FindNextAsync(
        string sessionId,
        FindRequest request,
        ReportViewerService viewer,
        ViewerSessionGuard guard,
        ViewerSessionProblemMapper sessionProblems,
        ILogger<Log> logger,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.FindValue))
        {
            return Results.Problem(
                detail: "findValue is required.",
                statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid Find request");
        }

        return await sessionProblems.ExecuteAsync(async () =>
        {
            var result = await viewer.FindNextAsync(
                sessionId,
                request.FindValue.Trim(),
                guard,
                cancellationToken);
            LogFindOutcome(logger, operation: "find/next", sessionId, result);
            return Results.Ok(ToFindPayload(result));
        }, sessionId);
    }

    private static void LogFindOutcome(
        ILogger logger,
        string operation,
        string sessionId,
        FindResult result)
    {
        using (logger.BeginScope(new Dictionary<string, object>
        {
            ["SessionId"] = sessionId,
            ["ReportPath"] = result.ReportPath,
            ["Operation"] = operation,
        }))
        {
            logger.LogInformation(
                "Find outcome {Operation} session {SessionId} report {ReportPath} found {Found}",
                operation,
                sessionId,
                result.ReportPath,
                result.Found);
        }
    }

    private static object ToFindPayload(FindResult result) =>
        new
        {
            html = result.Html,
            found = result.Found,
            pageInfo = new
            {
                currentPage = result.PageInfo.CurrentPage,
                pageCount = result.PageInfo.PageCount,
            },
        };
}

public sealed record FindRequest(string? FindValue);
