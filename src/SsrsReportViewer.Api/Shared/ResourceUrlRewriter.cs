using System.Text.RegularExpressions;

namespace SsrsReportViewer.Api.Shared;

/// <summary>
/// Rewrites ReportServer-shaped resource URLs in report HTML to Viewer Session resource endpoints
/// so ActionLinkRewriter host stripping cannot empty them (ADR-0003).
/// </summary>
public static partial class ResourceUrlRewriter
{
    /// <summary>
    /// Maps <c>img</c> / <c>input type=image</c> <c>src</c> URLs that carry a StreamId / ImageID
    /// (RenderStream, ReportServer URL-access, ReportViewerWebControl shapes) to
    /// <paramref name="resourceRoot"/> + id. Supports single- and double-quoted attributes.
    /// </summary>
    public static string Rewrite(string html, string resourceRoot)
    {
        return ResourceSrcRegex().Replace(html, match =>
        {
            var tag = match.Groups["tag"].Value;
            if (tag.Equals("input", StringComparison.OrdinalIgnoreCase) &&
                !IsImageInput(match.Value))
            {
                return match.Value;
            }

            var src = match.Groups["src"].Value;
            var decoded = NormalizeResourceUrl(src);
            if (!LooksLikeReportServerResourceUrl(decoded))
            {
                return match.Value;
            }

            var streamId = ExtractStreamIdFromResourceUrl(decoded);
            if (string.IsNullOrEmpty(streamId))
            {
                return match.Value;
            }

            var sessionUrl = resourceRoot + Uri.EscapeDataString(streamId);
            return match.Value.Replace(src, sessionUrl, StringComparison.Ordinal);
        });
    }

    private static bool IsImageInput(string tagHtml) =>
        ImageInputTypeRegex().IsMatch(tagHtml);

    /// <summary>
    /// HTML entity decode + unescape common query encoding so <c>rs%3AImageID=</c> matches.
    /// </summary>
    private static string NormalizeResourceUrl(string src) =>
        Uri.UnescapeDataString(src.Replace("&amp;", "&", StringComparison.Ordinal));

    /// <summary>
    /// Accept ReportServer-shaped resource URLs even when the host token casing or path segment
    /// varies (e.g. reportSERVER, Reserved.ReportViewerWebControl.axd, rs:ImageID GUIDs).
    /// </summary>
    private static bool LooksLikeReportServerResourceUrl(string url) =>
        url.Contains("reportserver", StringComparison.OrdinalIgnoreCase) ||
        url.Contains("ReportViewerWebControl", StringComparison.OrdinalIgnoreCase) ||
        url.Contains("RenderStream", StringComparison.OrdinalIgnoreCase) ||
        url.Contains("ImageID", StringComparison.OrdinalIgnoreCase) ||
        url.Contains("StreamId", StringComparison.OrdinalIgnoreCase) ||
        url.Contains("StreamID", StringComparison.OrdinalIgnoreCase);

    private static string? ExtractStreamIdFromResourceUrl(string url)
    {
        var match = StreamOrImageIdQueryRegex().Match(url);
        if (!match.Success)
        {
            return null;
        }

        return Uri.UnescapeDataString(match.Groups["id"].Value);
    }

    [GeneratedRegex(
        """<(?<tag>img|input)\b[^>]*?\bsrc\s*=\s*(?<quote>["'])(?<src>.*?)\k<quote>[^>]*>""",
        RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex ResourceSrcRegex();

    [GeneratedRegex(
        """\btype\s*=\s*(["']?)image\1""",
        RegexOptions.IgnoreCase)]
    private static partial Regex ImageInputTypeRegex();

    /// <summary>
    /// SOAP RenderStream ids (<c>rc:StreamId</c> / <c>StreamID</c>) and HTML URL-access
    /// image ids (<c>rs:ImageID</c>). Input should already be percent-decoded.
    /// </summary>
    [GeneratedRegex(
        """(?:^|[?&])(?:(?:rc|rs):)?(?:StreamI[dD]|ImageID)=(?<id>[^&]*)""",
        RegexOptions.IgnoreCase)]
    private static partial Regex StreamOrImageIdQueryRegex();
}
