using System.Text.RegularExpressions;

namespace SsrsReportViewer.Api.Shared;

/// <summary>
/// Tags SSRS tablix tables with FixedData freeze counts for client CreateFixedHeaders.
/// </summary>
public static partial class FixedHeaderAnnotator
{
    public static string Annotate(string html, FixedDataInfo info)
    {
        if (string.IsNullOrEmpty(html) || !info.HasFixedMembers)
        {
            return html;
        }

        return TablixTableRegex().Replace(
            html,
            match =>
            {
                var tag = match.Value;
                if (tag.Contains("data-ssrs-fixed-rows", StringComparison.OrdinalIgnoreCase))
                {
                    return tag;
                }

                var insert =
                    $" data-ssrs-fixed-rows=\"{info.FixedHeaderRows}\" data-ssrs-fixed-cols=\"{info.FixedLeadingColumns}\"";
                var close = tag.EndsWith("/>", StringComparison.Ordinal)
                    ? tag.Length - 2
                    : tag.Length - 1;
                return tag.Insert(close, insert);
            });
    }

    /// <summary>
    /// Matches the outer SSRS data tablix (<c>COLS</c> attribute), not nested sort chrome tables.
    /// </summary>
    [GeneratedRegex(
        """
        <TABLE\b(?=[^>]*\bCOLS\s*=)[^>]*>
        """,
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex TablixTableRegex();
}
