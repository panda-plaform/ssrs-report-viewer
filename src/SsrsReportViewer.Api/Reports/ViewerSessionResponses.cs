using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Reports;

/// <summary>
/// Shared HTTP payload shapes for Viewer Session interaction responses.
/// Kept in the kernel so feature slices and remaining Program routes stay contract-aligned.
/// </summary>
public static class ViewerSessionResponses
{
    public static object ToPayload(ViewReportResult result) =>
        new
        {
            sessionId = result.SessionId,
            html = result.Html,
            pageInfo = new
            {
                currentPage = result.PageInfo.CurrentPage,
                pageCount = result.PageInfo.PageCount,
            },
            zoomPercent = result.ZoomPercent,
            documentMap = result.DocumentMap?.Select(MapDocumentMapNode).ToArray(),
            canGoBack = result.CanGoBack,
            reportPath = result.ReportPath,
            parameters = result.Parameters
                .Select(p => new { name = p.Name, values = p.Values.ToArray() })
                .ToArray(),
        };

    public static object ToFindPayload(FindResult result) =>
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

    private static object MapDocumentMapNode(DocumentMapNode node) =>
        new
        {
            id = node.Id,
            label = node.Label,
            children = node.Children.Select(MapDocumentMapNode).ToArray(),
        };
}
