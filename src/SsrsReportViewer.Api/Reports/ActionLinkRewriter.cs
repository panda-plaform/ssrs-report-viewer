using System.Text.RegularExpressions;

namespace SsrsReportViewer.Api.Reports;

/// <summary>
/// Rewrites SSRS Action Link URL shapes so the browser never targets ReportServer (ADR-0003).
/// Drilldown / Bookmark links become data-attribute markers for Report Viewer delegation; External Links stay absolute.
/// </summary>
public static partial class ActionLinkRewriter
{
    public static string Rewrite(string html, string? replacementRoot = null)
    {
        var rewritten = html;

        if (!string.IsNullOrEmpty(replacementRoot))
        {
            rewritten = ReplacementRootToggleRegex().Replace(rewritten, match =>
            {
                var toggleId = Uri.UnescapeDataString(match.Groups["id"].Value);
                var label = match.Groups["label"].Value;
                return DrilldownAnchor(toggleId, label);
            });

            rewritten = ReplacementRootBookmarkRegex().Replace(rewritten, match =>
            {
                var bookmarkId = Uri.UnescapeDataString(match.Groups["id"].Value);
                var label = match.Groups["label"].Value;
                return BookmarkAnchor(bookmarkId, label);
            });
        }

        rewritten = ReportServerToggleRegex().Replace(rewritten, match =>
        {
            var toggleId = Uri.UnescapeDataString(match.Groups["id"].Value);
            var label = match.Groups["label"].Value;
            return DrilldownAnchor(toggleId, label);
        });

        rewritten = AbsoluteHttpAnchorRegex().Replace(rewritten, match =>
        {
            var href = match.Groups["href"].Value;
            var label = match.Groups["label"].Value;
            if (IsReportServerUrl(href))
            {
                // Non-toggle ReportServer URLs are stripped to a non-navigating stub.
                return $"<a href=\"#\" data-ssrs-action=\"blocked-reportserver\">{label}</a>";
            }

            return ExternalAnchor(href, label);
        });

        // Final sweep: no ReportServer host fragments should remain for the browser.
        rewritten = ReportServerHostRegex().Replace(rewritten, string.Empty);

        return rewritten;
    }

    private static string DrilldownAnchor(string toggleId, string label) =>
        $"<a href=\"#\" data-ssrs-action=\"drilldown\" data-ssrs-toggle-id=\"{EscapeAttr(toggleId)}\">{label}</a>";

    private static string BookmarkAnchor(string bookmarkId, string label) =>
        $"<a href=\"#\" data-ssrs-action=\"bookmark\" data-ssrs-bookmark-id=\"{EscapeAttr(bookmarkId)}\">{label}</a>";

    private static string ExternalAnchor(string href, string label) =>
        $"<a href=\"{EscapeAttr(href)}\" data-ssrs-action=\"external\" target=\"_blank\" rel=\"noopener noreferrer\">{label}</a>";

    private static bool IsReportServerUrl(string href) =>
        href.Contains("ReportServer", StringComparison.OrdinalIgnoreCase) ||
        href.Contains("reportserver", StringComparison.OrdinalIgnoreCase);

    private static string EscapeAttr(string value) =>
        value
            .Replace("&", "&amp;", StringComparison.Ordinal)
            .Replace("\"", "&quot;", StringComparison.Ordinal)
            .Replace("<", "&lt;", StringComparison.Ordinal);

    [GeneratedRegex(
        """<a\s+href="(?<root>[^"]*?)\?rc:Toggle=(?<id>[^"&]+)[^"]*"[^>]*>(?<label>.*?)</a>""",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex ReplacementRootToggleRegex();

    [GeneratedRegex(
        """<a\s+href="[^"]*?/actions/bookmark/(?<id>[^"?#]+)[^"]*"[^>]*>(?<label>.*?)</a>""",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex ReplacementRootBookmarkRegex();

    [GeneratedRegex(
        """<a\s+href="[^"]*ReportServer[^"]*[?&](?:amp;)?rc:Toggle=(?<id>[^"&]+)[^"]*"[^>]*>(?<label>.*?)</a>""",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex ReportServerToggleRegex();

    [GeneratedRegex(
        """<a\s+href="(?<href>https?://[^"]+)"[^>]*>(?<label>.*?)</a>""",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex AbsoluteHttpAnchorRegex();

    [GeneratedRegex(
        """https?://[^"'>\s]*reportserver[^"'>\s]*""",
        RegexOptions.IgnoreCase)]
    private static partial Regex ReportServerHostRegex();
}
