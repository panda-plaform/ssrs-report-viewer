using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Reports;

/// <summary>
/// Rewrites SSRS Action Link URL shapes so the browser never targets ReportServer (ADR-0003).
/// Drilldown / Sort / Drillthrough / Bookmark links become data-attribute markers for Report Viewer
/// delegation; External Links stay absolute.
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

            rewritten = ReplacementRootBookmarkRegex().Replace(rewritten, match =>
            {
                var bookmarkId = Uri.UnescapeDataString(match.Groups["id"].Value);
                var label = match.Groups["label"].Value;
                return BookmarkAnchor(bookmarkId, label);
            });

            rewritten = ReplacementRootDrillthroughRegex().Replace(rewritten, match =>
            {
                var query = match.Groups["query"].Value;
                var label = match.Groups["label"].Value;
                return TryDrillthroughAnchor(query, label) ?? match.Value;
            });
        }

        rewritten = ReportServerToggleRegex().Replace(rewritten, match =>
        {
            var toggleId = Uri.UnescapeDataString(match.Groups["id"].Value);
            var label = match.Groups["label"].Value;
            return DrilldownAnchor(toggleId, label);
        });

        rewritten = ReportServerDrillthroughRegex().Replace(rewritten, match =>
        {
            var query = match.Groups["query"].Value;
            var label = match.Groups["label"].Value;
            return TryDrillthroughAnchor(query, label) ?? match.Value;
        });

        rewritten = AbsoluteHttpAnchorRegex().Replace(rewritten, match =>
        {
            var href = match.Groups["href"].Value;
            var label = match.Groups["label"].Value;
            var decodedHref = href.Replace("&amp;", "&", StringComparison.Ordinal);

            // Report Manager "open report" links (often have tabindex before href).
            if (TryParseReportManagerItemPath(decodedHref, out var itemPath))
            {
                return DrillthroughAnchor(itemPath, [], label);
            }

            if (IsReportServerUrl(decodedHref))
            {
                return $"<a href=\"#\" data-ssrs-action=\"blocked-reportserver\">{label}</a>";
            }

            return ExternalAnchor(href, label);
        });

        // Never strip ReportServer hosts out of src=… (that yields src="" and broken icons).
        rewritten = StripLeftoverReportServerHosts(rewritten);

        return rewritten;
    }

    /// <summary>
    /// Report Manager URLs like /Reports/Pages/Report.aspx?ItemPath=%2fFolder%2fReport.
    /// </summary>
    internal static bool TryParseReportManagerItemPath(string href, out string reportPath)
    {
        reportPath = string.Empty;
        if (string.IsNullOrWhiteSpace(href))
        {
            return false;
        }

        if (!href.Contains("Report.aspx", StringComparison.OrdinalIgnoreCase) &&
            !href.Contains("/Pages/Report", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var query = ExtractQuery(href.Replace("&amp;", "&", StringComparison.Ordinal));
        var itemPath = FirstQueryValue(query, "ItemPath");
        if (string.IsNullOrWhiteSpace(itemPath))
        {
            return false;
        }

        reportPath = NormalizePath(itemPath);
        return reportPath.Length > 1;
    }

    /// <summary>
    /// Removes residual ReportServer absolute URLs, but masks <c>src</c> attributes first so
    /// unrewritten (or already session-proxied) image URLs are never turned into <c>src=""</c>.
    /// </summary>
    private static string StripLeftoverReportServerHosts(string html)
    {
        var masks = new List<string>();
        var masked = SrcAttributeRegex().Replace(html, match =>
        {
            var token = $"\u0001SRC{masks.Count}\u0001";
            masks.Add(match.Value);
            return token;
        });

        masked = ReportServerHostRegex().Replace(masked, string.Empty);

        for (var i = 0; i < masks.Count; i++)
        {
            masked = masked.Replace($"\u0001SRC{i}\u0001", masks[i], StringComparison.Ordinal);
        }

        return masked;
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

    private static string? TryDrillthroughAnchor(string rawQuery, string label)
    {
        var decoded = WebUtility.HtmlDecode(rawQuery);
        if (!TryParseDrillthroughQuery(decoded, out var reportPath, out var parameters))
        {
            return null;
        }

        return DrillthroughAnchor(reportPath, parameters, label);
    }

    internal static bool TryParseDrillthroughQuery(
        string query,
        out string reportPath,
        out IReadOnlyList<ParameterValue> parameters)
    {
        reportPath = string.Empty;
        parameters = [];

        if (string.IsNullOrWhiteSpace(query))
        {
            return false;
        }

        var q = query.TrimStart('?');
        var parts = q.Split('&', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        string? path = null;
        var multi = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);

        foreach (var part in parts)
        {
            var eq = part.IndexOf('=');
            if (eq < 0)
            {
                var candidate = Uri.UnescapeDataString(part);
                if (candidate.StartsWith('/') && path is null)
                {
                    path = NormalizePath(candidate);
                }

                continue;
            }

            var key = Uri.UnescapeDataString(part[..eq]);
            var value = Uri.UnescapeDataString(part[(eq + 1)..]);

            if (key.StartsWith("rs:", StringComparison.OrdinalIgnoreCase) ||
                key.StartsWith("rc:", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (string.Equals(key, "ReportPath", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(key, "Report", StringComparison.OrdinalIgnoreCase))
            {
                path = NormalizePath(value);
                continue;
            }

            if (!multi.TryGetValue(key, out var list))
            {
                list = [];
                multi[key] = list;
            }

            list.Add(value);
        }

        if (path is null)
        {
            return false;
        }

        var values = multi
            .Select(kv => new ParameterValue(kv.Key, kv.Value))
            .ToArray();

        reportPath = path;
        parameters = values;
        return true;
    }

    private static string NormalizePath(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || path.Trim() == "/")
        {
            return "/";
        }

        return "/" + path.Trim().Trim('/');
    }

    private static string DrilldownAnchor(string toggleId, string label) =>
        $"<a href=\"#\" data-ssrs-action=\"drilldown\" data-ssrs-toggle-id=\"{EscapeAttr(toggleId)}\">{label}</a>";

    private static string SortAnchor(string sortItem, string direction, bool clear, string label)
    {
        var clearValue = clear ? "true" : "false";
        return $"<a href=\"#\" data-ssrs-action=\"sort\" data-ssrs-sort-item=\"{EscapeAttr(sortItem)}\" data-ssrs-sort-direction=\"{EscapeAttr(direction)}\" data-ssrs-sort-clear=\"{clearValue}\">{label}</a>";
    }

    private static string BookmarkAnchor(string bookmarkId, string label) =>
        $"<a href=\"#\" data-ssrs-action=\"bookmark\" data-ssrs-bookmark-id=\"{EscapeAttr(bookmarkId)}\">{label}</a>";

    private static string DrillthroughAnchor(
        string reportPath,
        IReadOnlyList<ParameterValue> parameters,
        string label)
    {
        var paramsJson = JsonSerializer.Serialize(
            parameters.Select(p => new { name = p.Name, values = p.Values }));
        return $"<a href=\"#\" data-ssrs-action=\"drillthrough\" data-ssrs-report-path=\"{EscapeAttr(reportPath)}\" data-ssrs-parameters=\"{EscapeAttr(paramsJson)}\">{label}</a>";
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

    // Allow attributes before href (SSRS often emits tabindex=… before href=…).
    [GeneratedRegex(
        """<a\b[^>]*?\bhref\s*=\s*"(?<href>[^"]*(?:SortItem|SortId)=[^"]*)"[^>]*>(?<label>.*?)</a>""",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex SortAnchorRegex();

    [GeneratedRegex(
        """<a\b[^>]*?\bhref\s*=\s*"(?<root>[^"]*?)\?rc:Toggle=(?<id>[^"&]+)[^"]*"[^>]*>(?<label>.*?)</a>""",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex ReplacementRootToggleRegex();

    [GeneratedRegex(
        """<a\b[^>]*?\bhref\s*=\s*"[^"]*?/actions/bookmark/(?<id>[^"?#]+)[^"]*"[^>]*>(?<label>.*?)</a>""",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex ReplacementRootBookmarkRegex();

    [GeneratedRegex(
        """<a\b[^>]*?\bhref\s*=\s*"(?<root>[^"]*?)\?(?<query>(?!rc:Toggle=)[^"]+)"[^>]*>(?<label>.*?)</a>""",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex ReplacementRootDrillthroughRegex();

    [GeneratedRegex(
        """<a\b[^>]*?\bhref\s*=\s*"[^"]*ReportServer[^"]*[?&](?:amp;)?rc:Toggle=(?<id>[^"&]+)[^"]*"[^>]*>(?<label>.*?)</a>""",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex ReportServerToggleRegex();

    [GeneratedRegex(
        """<a\b[^>]*?\bhref\s*=\s*"[^"]*ReportServer/?(?<query>\?[^"]*)"[^>]*>(?<label>.*?)</a>""",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex ReportServerDrillthroughRegex();

    [GeneratedRegex(
        """<a\b[^>]*?\bhref\s*=\s*"(?<href>https?://[^"]+)"[^>]*>(?<label>.*?)</a>""",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex AbsoluteHttpAnchorRegex();

    [GeneratedRegex(
        """\bsrc\s*=\s*(["'])(?:.*?)\1""",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex SrcAttributeRegex();

    [GeneratedRegex(
        """https?://[^"'>\s]*reportserver[^"'>\s]*""",
        RegexOptions.IgnoreCase)]
    private static partial Regex ReportServerHostRegex();
}
