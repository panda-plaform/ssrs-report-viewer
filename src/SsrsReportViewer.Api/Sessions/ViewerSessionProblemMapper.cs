using Microsoft.Extensions.Logging;
using SsrsReportViewer.Api.Shared;

namespace SsrsReportViewer.Api.Sessions;

/// <summary>
/// Shared-kernel helper: maps Viewer Session lifecycle faults to ProblemDetails and emits
/// structured Microsoft logs (ADR-0005 / ADR-0006).
/// </summary>
public sealed class ViewerSessionProblemMapper
{
    private readonly ILogger<ViewerSessionProblemMapper> _logger;

    public ViewerSessionProblemMapper(ILogger<ViewerSessionProblemMapper> logger)
    {
        _logger = logger;
    }

    public async Task<IResult> ExecuteAsync(Func<Task<IResult>> action)
    {
        try
        {
            return await action();
        }
        catch (InvalidViewerInteractionException ex)
        {
            return Results.Problem(
                detail: ex.Message,
                statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid Viewer Session interaction");
        }
        catch (ViewerSessionNotFoundException ex)
        {
            _logger.LogWarning(
                ex,
                "Viewer Session not found {SessionId}",
                ex.SessionId);
            return Results.Problem(
                detail: ex.Message,
                statusCode: StatusCodes.Status404NotFound,
                title: "Viewer Session not found");
        }
        catch (ViewerSessionExpiredException ex)
        {
            _logger.LogWarning(
                ex,
                "Viewer Session expired {SessionId}",
                ex.SessionId);
            return Results.Problem(
                detail: ex.Message,
                statusCode: StatusCodes.Status410Gone,
                title: "Viewer Session expired");
        }
        catch (ViewerSessionBusyException ex)
        {
            _logger.LogWarning(
                ex,
                "Viewer Session busy {SessionId}",
                ex.SessionId);
            return Results.Problem(
                detail: ex.Message,
                statusCode: StatusCodes.Status409Conflict,
                title: "Viewer Session busy");
        }
    }
}
