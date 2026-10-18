using SsrsReportViewer.Api.Reports;
using SsrsReportViewer.Api.Sessions;

namespace SsrsReportViewer.Api.Features.DocumentMap;

/// <summary>
/// Document Map vertical slice: in-Execution navigation via ReportExecution2005 NavigateDocumentMap.
/// </summary>
public static class DocumentMapEndpoints
{
    public static RouteGroupBuilder MapDocumentMapEndpoints(this RouteGroupBuilder group)
    {
        group.MapPost("/document-map", async (
            string sessionId,
            DocumentMapNavigateRequest request,
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
                    title: "Invalid Document Map request");
            }

            return await sessionProblems.ExecuteAsync(async () =>
            {
                var result = await viewer.NavigateDocumentMapAsync(
                    sessionId,
                    request.Id.Trim(),
                    guard,
                    cancellationToken);
                return Results.Ok(ViewerSessionPayloadMapper.ToSessionPayload(result));
            });
        });

        return group;
    }
}

public sealed record DocumentMapNavigateRequest(string? Id);
