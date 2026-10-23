using Microsoft.Extensions.Logging;
using SsrsReportViewer.Api.Shared;
using SsrsReportViewer.Api.Ssrs;

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
            using (_logger.BeginScope(new Dictionary<string, object>
            {
                ["SessionId"] = ex.SessionId,
            }))
            {
                _logger.LogWarning(
                    ex,
                    "Viewer Session not found {SessionId}",
                    ex.SessionId);
            }

            return Results.Problem(
                detail: ex.Message,
                statusCode: StatusCodes.Status404NotFound,
                title: "Viewer Session not found");
        }
        catch (ViewerSessionExpiredException ex)
        {
            using (_logger.BeginScope(new Dictionary<string, object>
            {
                ["SessionId"] = ex.SessionId,
            }))
            {
                _logger.LogWarning(
                    ex,
                    "Viewer Session expired {SessionId}",
                    ex.SessionId);
            }

            return Results.Problem(
                detail: ex.Message,
                statusCode: StatusCodes.Status410Gone,
                title: "Viewer Session expired");
        }
        catch (ViewerSessionBusyException ex)
        {
            using (_logger.BeginScope(new Dictionary<string, object>
            {
                ["SessionId"] = ex.SessionId,
            }))
            {
                _logger.LogWarning(
                    ex,
                    "Viewer Session busy {SessionId}",
                    ex.SessionId);
            }

            return Results.Problem(
                detail: ex.Message,
                statusCode: StatusCodes.Status409Conflict,
                title: "Viewer Session busy");
        }
        catch (ReportNotReadyException ex)
        {
            _logger.LogWarning(ex, "SSRS Report not ready for Execution interaction");

            return Results.Problem(
                detail: string.IsNullOrWhiteSpace(ex.Message)
                    ? "The selected report is not ready for viewing. View the report again, then retry."
                    : ex.Message,
                statusCode: StatusCodes.Status409Conflict,
                title: "Report not ready");
        }
        catch (ParameterValueNotSetException ex)
        {
            using (_logger.BeginScope(new Dictionary<string, object>
            {
                ["ParameterName"] = ex.ParameterName ?? "(unknown)",
            }))
            {
                _logger.LogWarning(
                    ex,
                    "SSRS ParameterValueNotSet on Viewer Session interaction {ParameterName}",
                    ex.ParameterName ?? "(unknown)");
            }

            return Results.Problem(
                detail: ex.Message,
                statusCode: StatusCodes.Status400BadRequest,
                title: "Required Report Parameters missing");
        }
        catch (RequiredParameterMissingException ex)
        {
            _logger.LogWarning(ex, "Required Report Parameters missing on Viewer Session interaction");

            return Results.Problem(
                detail: ex.Message,
                statusCode: StatusCodes.Status400BadRequest,
                title: "Required Report Parameters missing");
        }
    }
}
