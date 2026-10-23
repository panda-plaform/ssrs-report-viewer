namespace SsrsReportViewer.Api.Sessions;

/// <summary>
/// Shared ProblemDetails shapes for Viewer Session / View Report SSRS faults.
/// </summary>
internal static class ViewerFaultProblems
{
    public static IResult RequiredParametersMissing(string detail) =>
        Results.Problem(
            detail: detail,
            statusCode: StatusCodes.Status400BadRequest,
            title: "Required Report Parameters missing");

    public static IResult ReportNotReady(string? message) =>
        Results.Problem(
            detail: string.IsNullOrWhiteSpace(message)
                ? "The selected report is not ready for viewing. View the report again, then retry."
                : message,
            statusCode: StatusCodes.Status409Conflict,
            title: "Report not ready");
}
