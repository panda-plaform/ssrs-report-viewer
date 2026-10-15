namespace SsrsReportViewer.Api.Reports;

/// <summary>
/// Allowed PDF Print page sizes and default orientation names for Export DeviceInfo.
/// Keep keys aligned with the client <c>PRINT_PAGE_SIZES</c> / <c>PRINT_ORIENTATIONS</c> lists.
/// </summary>
public static class PdfPrintSettings
{
    public const string DefaultPageSize = "A4";

    public const string Portrait = "Portrait";

    public const string Landscape = "Landscape";

    /// <summary>Allowed <c>pageSize</c> values → portrait width/height DeviceInfo inches.</summary>
    public static readonly IReadOnlyDictionary<string, (string Width, string Height)> PageSizes =
        new Dictionary<string, (string Width, string Height)>(StringComparer.OrdinalIgnoreCase)
        {
            ["A4"] = ("8.27in", "11.69in"),
            ["A3"] = ("11.69in", "16.54in"),
            ["Letter"] = ("8.5in", "11in"),
            ["Legal"] = ("8.5in", "14in"),
        };
}
