using SsrsReportViewer.Api.Shared;
using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Hosting;

/// <summary>
/// Shared HTTP payload shaping for Viewer Session responses (multi-slice).
/// </summary>
public static class SessionResponse
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
            documentMapVisible = result.DocumentMapVisible,
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
