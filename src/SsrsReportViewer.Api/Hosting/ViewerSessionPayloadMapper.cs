using SsrsReportViewer.Api.Reports;
using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Hosting;

/// <summary>
/// Shared-kernel HTTP payload shaping for Viewer Session render responses.
/// </summary>
public static class ViewerSessionPayloadMapper
{
    public static object ToSessionPayload(ViewReportResult result) =>
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

    public static object MapDocumentMapNode(DocumentMapNode node) =>
        new
        {
            id = node.Id,
            label = node.Label,
            children = node.Children.Select(MapDocumentMapNode).ToArray(),
        };
}
