using System.Text.RegularExpressions;

namespace SsrsReportViewer.Api.Reports;

/// <summary>
/// Rewrites SSRS Action Link URL shapes so the browser never targets ReportServer (ADR-0003).
/// Drilldown / Sort links become data-attribute markers for Report Viewer delegation; External Links stay absolute.
/// </summary>
public static partial class ActionLinkRewriter
{
    public static string Rewrite(string html, string? replacementRoot = null)
    {
        var rewritten = html;

        // Sort before toggle / absolute so ReportServer Sort URLs never become blocked stubs.
        rewritten = SortAnchorRegex().Replace(rewritten, match =>
            RewriteSortAnchor(match.Groups["href"].Value, match.Groups["label"].Value));

        if (!string.IsNullOrEmpty(replacementRoot))
        {
            rewritten = ReplacementRootToggleRegex().Replace(rewritten, match =>
            {
                var toggleId = Uri.UnescapeDataString(match.Groups["id"].Value);
                var label = match.Groups["label"].Value;
                return DrilldownAnchor(toggleId, label);
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
                return $"<a href=\"#\" data-ssrs-action=\"blocked-reportserver\">{label}</a>";
            }

            return ExternalAnchor(href, label);
        });

        rewritten = ReportServerHostRegex().Replace(rewritten, string.Empty);

        return rewritten;
    }

    private static string RewriteSortAnchor(string href, string label)
    {
        var decodedHref = href.Replace("&amp;", "&", StringComparison.Ordinal);
        var query = ExtractQuery(decodedHref);
        var sortItem = FirstQueryValue(query, "rc:SortItem", "SortItem", "rc:SortId", "SortId");
        var direction = FirstQueryValue(query, "rc:SortDirection", "SortDirection") ?? "Ascending";
        var clearRaw = FirstQueryValue(query, "rc:Clear", "Clear");
        var clear = IsTruthy(clearRaw);

        if (string.IsNullOrEmpty(sortItem))
        {
            return $"<a href=\"#\">{label}</a>";
        }

        return SortAnchor(sortItem, direction, clear, label);
    }

    private static string ExtractQuery(string href)
    {
        var q = href.IndexOf('?', StringComparison.Ordinal);
        return q >= 0 && q < href.Length - 1 ? href[(q + 1)..] : string.Empty;
    }

    private static string? FirstQueryValue(string query, params string[] keys)
    {
        foreach (var part in query.Split('&', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var eq = part.IndexOf('=', StringComparison.Ordinal);
            if (eq <= 0)
            {
                continue;
            }

            var key = Uri.UnescapeDataString(part[..eq]);
            foreach (var candidate in keys)
            {
                if (string.Equals(key, candidate, StringComparison.OrdinalIgnoreCase))
                {
                    return Uri.UnescapeDataString(part[(eq + 1)..]);
                }
            }
        }

        return null;
    }

    private static string DrilldownAnchor(string toggleId, string label) =>
        $"<a href=\"#\" data-ssrs-action=\"drilldown\" data-ssrs-toggle-id=\"{EscapeAttr(toggleId)}\">{label}</a>";

    private static string SortAnchor(string sortItem, string direction, bool clear, string label)
    {
        var clearValue = clear ? "true" : "false";
        return $"<a href=\"#\" data-ssrs-action=\"sort\" data-ssrs-sort-item=\"{EscapeAttr(sortItem)}\" data-ssrs-sort-direction=\"{EscapeAttr(direction)}\" data-ssrs-sort-clear=\"{clearValue}\">{label}</a>";
    }

    private static string ExternalAnchor(string href, string label) =>
        $"<a href=\"{EscapeAttr(href)}\" data-ssrs-action=\"external\" target=\"_blank\" rel=\"noopener noreferrer\">{label}</a>";

    private static bool IsReportServerUrl(string href) =>
        href.Contains("ReportServer", StringComparison.OrdinalIgnoreCase) ||
        href.Contains("reportserver", StringComparison.OrdinalIgnoreCase);

    private static bool IsTruthy(string? value) =>
        string.Equals(value, "true", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(value, "1", StringComparison.OrdinalIgnoreCase);

    private static string EscapeAttr(string value) =>
        value
            .Replace("&", "&amp;", StringComparison.Ordinal)
            .Replace("\"", "&quot;", StringComparison.Ordinal)
            .Replace("<", "&lt;", StringComparison.Ordinal);

    [GeneratedRegex(
        """<a\s+href="(?<href>[^"]*(?:SortItem|SortId)=[^"]*)"[^>]*>(?<label>.*?)</a>""",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex SortAnchorRegex();

    [GeneratedRegex(
        """<a\s+href="(?<root>[^"]*?)\?rc:Toggle=(?<id>[^"&]+)[^"]*"[^>]*>(?<label>.*?)</a>""",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex ReplacementRootToggleRegex();

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
