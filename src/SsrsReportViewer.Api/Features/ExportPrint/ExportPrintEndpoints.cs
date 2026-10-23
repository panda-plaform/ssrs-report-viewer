using Microsoft.Extensions.Logging;
using SsrsReportViewer.Api.Shared;
using SsrsReportViewer.Api.Sessions;

namespace SsrsReportViewer.Api.Features.ExportPrint;

/// <summary>
/// Export and Print (printer-friendly PDF) Viewer Session endpoints with outcome logging
/// (ADR-0005 / ADR-0006).
/// </summary>
public static class ExportPrintEndpoints
{
    /// <summary>Logger category type for Export/Print observability (ADR-0006).</summary>
    public sealed class Log;

    public static RouteGroupBuilder MapExportPrintEndpoints(this RouteGroupBuilder group)
    {
        group.MapGet("/export", ExportAsync);
        return group;
    }

    private static async Task<IResult> ExportAsync(
        string sessionId,
        string? format,
        string? pageSize,
        string? orientation,
        ReportViewerService viewer,
        ViewerSessionGuard guard,
        ViewerSessionProblemMapper sessionProblems,
        ILogger<Log> logger,
        CancellationToken cancellationToken)
    {
        var isPrint = !string.IsNullOrWhiteSpace(pageSize) || !string.IsNullOrWhiteSpace(orientation);
        var operation = isPrint ? "print" : "export";
        var formatToken = format ?? string.Empty;

        return await sessionProblems.ExecuteAsync(async () =>
        {
            try
            {
                var export = await viewer.ExportAsync(
                    sessionId,
                    formatToken,
                    guard,
                    cancellationToken,
                    pageSize,
                    orientation);

                LogExportOutcome(
                    logger,
                    operation,
                    sessionId,
                    export.ReportPath,
                    formatToken);

                return Results.File(export.Content, export.MimeType, export.FileName);
            }
            catch (UnsupportedExportFormatException ex)
            {
                using (logger.BeginScope(new Dictionary<string, object>
                {
                    ["SessionId"] = sessionId,
                    ["Operation"] = operation,
                    ["Format"] = formatToken,
                }))
                {
                    logger.LogWarning(
                        ex,
                        "Unsupported Export format {Format} session {SessionId} operation {Operation}",
                        formatToken,
                        sessionId,
                        operation);
                }

                return Results.Problem(
                    detail: ex.Message,
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Unsupported Export format");
            }
            catch (InvalidViewerInteractionException ex)
            {
                return Results.Problem(
                    detail: ex.Message,
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid Export request");
            }
        });
    }

    private static void LogExportOutcome(
        ILogger logger,
        string operation,
        string sessionId,
        string reportPath,
        string format)
    {
        using (logger.BeginScope(new Dictionary<string, object>
        {
            ["SessionId"] = sessionId,
            ["ReportPath"] = reportPath,
            ["Operation"] = operation,
            ["Format"] = format,
        }))
        {
            logger.LogInformation(
                "Export outcome {Operation} session {SessionId} report {ReportPath} format {Format}",
                operation,
                sessionId,
                reportPath,
                format);
        }
    }
}
