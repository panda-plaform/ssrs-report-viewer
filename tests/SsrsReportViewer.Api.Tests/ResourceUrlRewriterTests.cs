using SsrsReportViewer.Api.Reports;

namespace SsrsReportViewer.Api.Tests;

public sealed class ResourceUrlRewriterTests
{
    private const string ResourceRoot = "/api/sessions/sess-1/resources/";

    [Fact]
    public void Rewrite_maps_double_quoted_reportserver_img_src()
    {
        var html =
            """<img src="http://ssrs-host/ReportServer?rs:Command=Get&amp;rc:StreamId=img1" alt="x" />""";

        var rewritten = ResourceUrlRewriter.Rewrite(html, ResourceRoot);

        Assert.Contains($"{ResourceRoot}img1", rewritten, StringComparison.Ordinal);
        Assert.DoesNotContain("reportserver", rewritten, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Rewrite_maps_single_quoted_img_src()
    {
        var html =
            """<img src='http://ssrs-host/reportSERVER?rs:Command=Get&amp;rc:StreamId=logo' />""";

        var rewritten = ResourceUrlRewriter.Rewrite(html, ResourceRoot);

        Assert.Contains($"{ResourceRoot}logo", rewritten, StringComparison.Ordinal);
        Assert.DoesNotContain("reportSERVER", rewritten, StringComparison.Ordinal);
    }

    [Fact]
    public void Rewrite_maps_stream_id_when_path_omits_reportserver_token()
    {
        var html =
            """<img src="https://ssrs-host/Reserved.ReportViewerWebControl.axd?StreamID=status2" />""";

        var rewritten = ResourceUrlRewriter.Rewrite(html, ResourceRoot);

        Assert.Contains($"{ResourceRoot}status2", rewritten, StringComparison.Ordinal);
        Assert.DoesNotContain("ssrs-host", rewritten, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Rewrite_maps_input_type_image_src()
    {
        var html =
            """<input type="image" src="http://ssrs-host/ReportServer?rc:StreamId=btn1" alt="Go" />""";

        var rewritten = ResourceUrlRewriter.Rewrite(html, ResourceRoot);

        Assert.Contains($"{ResourceRoot}btn1", rewritten, StringComparison.Ordinal);
        Assert.DoesNotContain("ReportServer", rewritten, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Rewrite_leaves_non_image_input_unchanged()
    {
        var html =
            """<input type="text" src="http://ssrs-host/ReportServer?rc:StreamId=nope" />""";

        var rewritten = ResourceUrlRewriter.Rewrite(html, ResourceRoot);

        Assert.Equal(html, rewritten);
    }

    [Fact]
    public void Rewrite_leaves_external_img_without_stream_id()
    {
        var html = """<img src="https://cdn.example/logo.png" />""";

        var rewritten = ResourceUrlRewriter.Rewrite(html, ResourceRoot);

        Assert.Equal(html, rewritten);
    }
}
