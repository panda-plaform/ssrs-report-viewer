using SsrsReportViewer.Api.Reports;
using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Sessions;

/// <summary>
/// Shared Viewer Session JSON payload shape used by session feature slices.
/// </summary>
public static class ViewerSessionPayload
{
    public static object From(ViewReportResult result) =>
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

    private static object MapDocumentMapNode(DocumentMapNode node) =>
        new
        {
            id = node.Id,
            label = node.Label,
            children = node.Children.Select(MapDocumentMapNode).ToArray(),
        };
}
