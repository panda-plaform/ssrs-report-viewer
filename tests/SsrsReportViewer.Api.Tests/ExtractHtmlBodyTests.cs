using SsrsReportViewer.Api.Reports;

namespace SsrsReportViewer.Api.Tests;

public sealed class ExtractHtmlBodyTests
{
    [Fact]
    public void ExtractHtmlBody_keeps_head_styles_with_body_for_report_grid_chrome()
    {
        var html =
            """
            <!DOCTYPE HTML>
            <html><head><title>Report</title>
            <style type="text/css">.a150{border:0.75pt solid Black;}.zebra{background-color:LightYellow;}</style>
            </head>
            <body><DIV ID="oReportDiv"><TABLE class="a150"><TR class="zebra"><TD>cell</TD></TR></TABLE></DIV></body></html>
            """;

        var fragment = ReportViewerService.ExtractHtmlBody(html);

        Assert.Contains("<style type=\"text/css\">.a150{border:0.75pt solid Black;}", fragment, StringComparison.Ordinal);
        Assert.Contains("ID=\"oReportDiv\"", fragment, StringComparison.Ordinal);
        Assert.DoesNotContain("<!DOCTYPE", fragment, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<head>", fragment, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<body>", fragment, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ExtractHtmlBody_returns_input_when_not_a_full_document()
    {
        const string fragment = "<DIV class=\"report\">rows</DIV>";
        Assert.Equal(fragment, ReportViewerService.ExtractHtmlBody(fragment));
    }
}
