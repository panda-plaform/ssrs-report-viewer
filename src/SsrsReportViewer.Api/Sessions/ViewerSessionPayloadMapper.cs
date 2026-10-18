using SsrsReportViewer.Api.Reports;
using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Sessions;

/// <summary>
/// Shared-kernel JSON payload shaping for Viewer Session HTTP responses.
/// Used by feature slices and remaining host-mapped session routes.
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
