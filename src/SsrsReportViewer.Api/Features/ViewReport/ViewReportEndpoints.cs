using System.Text.Json;
using Microsoft.Extensions.Logging;
using SsrsReportViewer.Api.Hosting;
using SsrsReportViewer.Api.Reports;
using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Features.ViewReport;

/// <summary>
/// Report Parameters + View Report vertical slice (glossary: Report Parameter, Valid Value, View Report).
/// </summary>
public static class ViewReportEndpoints
{
    private const string ViewReportOperation = "ViewReport";

    /// <summary>Logger category type for View Report observability (ADR-0006).</summary>
    public sealed class Log;

    public static IEndpointRouteBuilder MapViewReportEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/reports/parameters", GetParametersAsync);
        endpoints.MapPost("/api/reports/render", RenderAsync);
        return endpoints;
    }

    private static async Task<IResult> GetParametersAsync(
        string? path,
        string? values,
        ReportViewerService viewer,
        CancellationToken cancellationToken)
    {
        var reportPath = ReportPath.Normalize(path);
        try
        {
            var valuesForCascading = ParseParameterValuesJson(values);
            var parameters = await viewer.GetParametersAsync(
                reportPath,
                forRendering: true,
                valuesForCascading,
                cancellationToken);
            // Parameter-form list only: omit params native SSRS does not show (PromptUser false
            // or empty Prompt). View Report / drillthrough keep the full definition list.
            var prompted = parameters.Where(p => p.ShownOnParameterForm);
            return Results.Ok(new
            {
                path = reportPath,
                parameters = prompted.Select(p => new
                {
                    name = p.Name,
                    dataType = p.DataType,
                    nullable = p.Nullable,
                    multiValue = p.MultiValue,
                    required = p.Required,
                    prompt = p.Prompt,
                    defaultValues = p.DefaultValues,
                    validValues = p.ValidValues.Select(v => new { label = v.Label, value = v.Value }),
                    dependencies = p.Dependencies,
                }),
            });
        }
        catch (ReportNotFoundException ex)
        {
            return Results.Problem(
                detail: ex.Message,
                statusCode: StatusCodes.Status404NotFound,
                title: "Report not found");
        }
    }

    private static async Task<IResult> RenderAsync(
        ViewReportRequest request,
        ReportViewerService viewer,
        ILogger<Log> logger,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.ReportPath))
        {
            return Results.Problem(
                detail: "reportPath is required.",
                statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid View Report request");
        }

        var reportPath = ReportPath.Normalize(request.ReportPath);
        var parameters = (request.Parameters ?? [])
            .Select(p => new ParameterValue(p.Name, p.Values ?? []))
            .ToArray();

        logger.LogInformation(
            "View Report starting {ReportPath} {Operation}",
            reportPath,
            ViewReportOperation);

        try
        {
            var result = await viewer.ViewReportAsync(reportPath, parameters, cancellationToken);
            return Results.Ok(SessionResponse.From(result));
        }
        catch (RequiredParameterMissingException ex)
        {
            logger.LogWarning(
                ex,
                "View Report failed {ReportPath} {Operation}",
                reportPath,
                ViewReportOperation);
            return Results.Problem(
                detail: ex.Message,
                statusCode: StatusCodes.Status400BadRequest,
                title: "Required Report Parameters missing");
        }
        catch (ReportNotFoundException ex)
        {
            logger.LogWarning(
                ex,
                "View Report failed {ReportPath} {Operation}",
                reportPath,
                ViewReportOperation);
            return Results.Problem(
                detail: ex.Message,
                statusCode: StatusCodes.Status404NotFound,
                title: "Report not found");
        }
    }

    private static IReadOnlyList<ParameterValue>? ParseParameterValuesJson(string? values)
    {
        if (string.IsNullOrWhiteSpace(values))
        {
            return null;
        }

        try
        {
            var parsed = JsonSerializer.Deserialize<ViewReportParameter[]>(
                values,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (parsed is null || parsed.Length == 0)
            {
                return null;
            }

            return parsed
                .Where(p => !string.IsNullOrWhiteSpace(p.Name))
                .Select(p => new ParameterValue(p.Name, p.Values ?? []))
                .ToArray();
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
