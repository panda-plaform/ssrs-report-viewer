using SsrsReportViewer.Api.Reports;

namespace SsrsReportViewer.Api.Tests;

public sealed class ActionLinkRewriterTests
{
    [Fact]
    public void Rewrite_maps_report_manager_itempath_even_when_tabindex_precedes_href()
    {
        var html =
            """
            <a tabindex="2" href="http://thor/Reports/Pages/Report.aspx?ItemPath=%2fDatabase%20Server%2fDatabase%20Dictionary" style="text-decoration:none;"><img border="0" alt="go to this report" title="go to this report" src="http://thor/ReportServer?rs:Command=Get&amp;rc:StreamId=GoToReport"></a>
            """;

        var resourceRoot = "/api/sessions/sess-1/resources/";
        var withResources = ResourceUrlRewriter.Rewrite(html, resourceRoot);
        var rewritten = ActionLinkRewriter.Rewrite(withResources, "/api/sessions/sess-1/actions/");

        Assert.Contains("data-ssrs-action=\"drillthrough\"", rewritten, StringComparison.Ordinal);
        Assert.Contains(
            "data-ssrs-report-path=\"/Database Server/Database Dictionary\"",
            rewritten,
            StringComparison.Ordinal);
        Assert.DoesNotContain("Report.aspx", rewritten, StringComparison.OrdinalIgnoreCase);
        Assert.Contains($"{resourceRoot}GoToReport", rewritten, StringComparison.Ordinal);
        Assert.DoesNotContain("src=\"\"", rewritten, StringComparison.Ordinal);
        Assert.DoesNotContain("src=''", rewritten, StringComparison.Ordinal);
    }

    [Fact]
    public void Strip_does_not_empty_img_src_when_stream_id_was_not_rewritable()
    {
        // No StreamId — ResourceUrlRewriter leaves the URL; host strip must not yield src="".
        var html =
            """<img alt="icon" src="http://thor/ReportServer?/Sales/Revenue&amp;rs:Command=Get" />""";

        var rewritten = ActionLinkRewriter.Rewrite(html);

        Assert.Contains("ReportServer", rewritten, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("src=\"\"", rewritten, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(
        "http://thor/Reports/Pages/Report.aspx?ItemPath=%2fDatabase%20Server%2fDatabase%20Dictionary",
        "/Database Server/Database Dictionary")]
    [InlineData(
        "http://host/Reports/Pages/Report.aspx?ItemPath=/Example%20Reports/Data%20Sources",
        "/Example Reports/Data Sources")]
    public void TryParseReportManagerItemPath_extracts_catalog_path(string href, string expectedPath)
    {
        Assert.True(ActionLinkRewriter.TryParseReportManagerItemPath(href, out var path));
        Assert.Equal(expectedPath, path);
    }
}
