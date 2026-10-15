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
            var decodedHref = NormalizeQuerySeparators(href.Replace("&amp;", "&", StringComparison.Ordinal));

            // Report Manager links (often tabindex before href): ItemPath + optional Report Parameters.
            if (IsReportManagerUrl(decodedHref))
            {
                var managerQuery = ExtractQuery(decodedHref);
                // ViewMode=List is folder browsing, not a Report Drillthrough.
                if (FirstQueryValue(managerQuery, "ViewMode") is not null)
                {
                    return ExternalAnchor(href, label);
                }

                if (TryParseDrillthroughQuery(managerQuery, out var managerPath, out var managerParams))
                {
                    return DrillthroughAnchor(
                        managerPath,
                        managerParams,
                        FriendlyDrillthroughLabel(label, managerPath));
                }
            }

            if (IsReportServerUrl(decodedHref))
            {
                var query = ExtractQuery(decodedHref);
                if (TryParseDrillthroughQuery(query, out var reportPath, out var parameters))
                {
                    return DrillthroughAnchor(
                        reportPath,
                        parameters,
                        FriendlyDrillthroughLabel(label, reportPath));
                }

                return $"<a href=\"#\" data-ssrs-action=\"blocked-reportserver\">{FriendlyDrillthroughLabel(label, reportPath: string.Empty)}</a>";
            }

            return ExternalAnchor(href, label);
        });

        // Never strip ReportServer hosts out of src=… (that yields src="" and broken icons).
        rewritten = StripLeftoverReportServerHosts(rewritten);

        return rewritten;
    }

    private static bool IsReportManagerUrl(string href) =>
        href.Contains("Report.aspx", StringComparison.OrdinalIgnoreCase) ||
        href.Contains("/Pages/Report", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Report Manager URLs like /Reports/Pages/Report.aspx?ItemPath=%2fFolder%2fReport.
    /// </summary>
    internal static bool TryParseReportManagerItemPath(string href, out string reportPath)
    {
        reportPath = string.Empty;
        if (string.IsNullOrWhiteSpace(href) || !IsReportManagerUrl(href))
        {
            return false;
        }

        var query = ExtractQuery(NormalizeQuerySeparators(href));
        if (!TryParseDrillthroughQuery(query, out reportPath, out _))
        {
            return false;
        }

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
        // Same separator decoding as Drillthrough: live HTML uses &amp;; SOAP may leave &amp;amp;.
        var decodedHref = NormalizeQuerySeparators(href);
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
        if (!TryParseDrillthroughQuery(rawQuery, out var reportPath, out var parameters))
        {
            return null;
        }

        return DrillthroughAnchor(
            reportPath,
            parameters,
            FriendlyDrillthroughLabel(label, reportPath));
    }

    /// <summary>
    /// When SSRS uses the raw ReportServer URL as link text, show the Report leaf name instead.
    /// Labels that already contain markup (e.g. icons) are left unchanged.
    /// </summary>
    internal static string FriendlyDrillthroughLabel(string label, string reportPath)
    {
        var text = WebUtility.HtmlDecode(label).Trim();
        if (text.Contains('<', StringComparison.Ordinal))
        {
            return label;
        }

        if (string.IsNullOrWhiteSpace(text) ||
            text.Contains("ReportServer", StringComparison.OrdinalIgnoreCase) ||
            text.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
            text.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            var leaf = reportPath.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries).LastOrDefault();
            return string.IsNullOrWhiteSpace(leaf) ? "Report" : leaf;
        }

        return label;
    }

    /// <summary>
    /// SSRS HTML often uses <c>&amp;</c> separators; SOAP/XML can leave them double-encoded
    /// (<c>&amp;amp;</c>). Decode until stable so keys are <c>ReportName</c>, not <c>amp;ReportName</c>.
    /// </summary>
    private static string NormalizeQuerySeparators(string query)
    {
        var current = query;
        for (var i = 0; i < 5; i++)
        {
            var next = WebUtility.HtmlDecode(current);
            if (string.Equals(next, current, StringComparison.Ordinal))
            {
                break;
            }

            current = next;
        }

        return current.Replace("&amp;", "&", StringComparison.OrdinalIgnoreCase);
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

        var q = NormalizeQuerySeparators(query).TrimStart('?');
        var parts = q.Split('&', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        string? path = null;
        var multi = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);

        foreach (var part in parts)
        {
            var eq = part.IndexOf('=');
            if (eq < 0)
            {
                // UrlDecode maps + to space (common in ReportServer path segments).
                var candidate = WebUtility.UrlDecode(part) ?? part;
                if (candidate.StartsWith('/') && path is null)
                {
                    path = NormalizePath(candidate);
                }

                continue;
            }

            var key = WebUtility.UrlDecode(part[..eq]) ?? part[..eq];
            var value = WebUtility.UrlDecode(part[(eq + 1)..]) ?? part[(eq + 1)..];
            if (key.StartsWith("rs:", StringComparison.OrdinalIgnoreCase) ||
                key.StartsWith("rc:", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (string.Equals(key, "ReportPath", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(key, "Report", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(key, "ItemPath", StringComparison.OrdinalIgnoreCase))
            {
                path = NormalizePath(value);
                continue;
            }
            // URL access null syntax: StartDate:isnull=True → StartDate with empty values (SSRS NULL).
            const string isnullSuffix = ":isnull";
            if (key.EndsWith(isnullSuffix, StringComparison.OrdinalIgnoreCase))
            {
                if (!IsTruthy(value))
                {
                    continue;
                }

                var nullName = key[..^isnullSuffix.Length];
                if (string.IsNullOrWhiteSpace(nullName))
                {
                    continue;
                }

                multi[nullName] = [];
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
