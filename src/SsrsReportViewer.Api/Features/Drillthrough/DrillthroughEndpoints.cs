using SsrsReportViewer.Api.Composition;
using SsrsReportViewer.Api.Hosting;
using SsrsReportViewer.Api.Reports;
using SsrsReportViewer.Api.Sessions;
using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Features.Drillthrough;

/// <summary>
/// Drillthrough + Back vertical slice (glossary: Drillthrough, Viewer Session back stack).
/// </summary>
public static class DrillthroughEndpoints
{
    public static IEndpointRouteBuilder MapDrillthroughEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapViewerSessionGroup();

        group.MapPost("/drillthrough", DrillthroughAsync);
        group.MapPost("/back", BackAsync);

        return endpoints;
    }

    private static async Task<IResult> DrillthroughAsync(
        string sessionId,
        DrillthroughRequest request,
        ReportViewerService viewer,
        ViewerSessionGuard guard,
        ViewerSessionProblemMapper sessionProblems,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.ReportPath))
        {
            return Results.Problem(
                detail: "reportPath is required.",
                statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid Drillthrough request");
        }

        var reportPath = CatalogPaths.Normalize(request.ReportPath);
        var parameters = (request.Parameters ?? [])
            .Select(p => new ParameterValue(p.Name, p.Values ?? []))
            .ToArray();

        return await sessionProblems.ExecuteAsync(async () =>
        {
            try
            {
                var result = await viewer.DrillthroughAsync(
                    sessionId,
                    reportPath,
                    parameters,
                    guard,
                    cancellationToken);
                return Results.Ok(ViewerSessionPayloadMapper.ToSessionPayload(result));
            }
            catch (RequiredParameterMissingException ex)
            {
                return Results.Problem(
                    detail: ex.Message,
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Required Report Parameters missing");
            }
            catch (ReportNotFoundException ex)
            {
                return Results.Problem(
                    detail: ex.Message,
                    statusCode: StatusCodes.Status404NotFound,
                    title: "Report not found");
            }
        });
    }

    private static async Task<IResult> BackAsync(
        string sessionId,
        ReportViewerService viewer,
        ViewerSessionGuard guard,
        ViewerSessionProblemMapper sessionProblems,
        CancellationToken cancellationToken) =>
        await sessionProblems.ExecuteAsync(async () =>
        {
            try
            {
                var result = await viewer.BackAsync(sessionId, guard, cancellationToken);
                return Results.Ok(ViewerSessionPayloadMapper.ToSessionPayload(result));
            }
            catch (BackStackEmptyException ex)
            {
                return Results.Problem(
                    detail: ex.Message,
                    statusCode: StatusCodes.Status400BadRequest,
                    title: "Drillthrough back stack empty");
            }
        });
}
