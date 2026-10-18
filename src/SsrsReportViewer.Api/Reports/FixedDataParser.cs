using System.Xml.Linq;

namespace SsrsReportViewer.Api.Reports;

/// <summary>
/// Reads FixedData from RDL tablix hierarchies (Report Builder "keep header visible while scrolling").
/// </summary>
public static class FixedDataParser
{
    public static FixedDataInfo Parse(byte[] rdlBytes)
    {
        if (rdlBytes is null || rdlBytes.Length == 0)
        {
            return FixedDataInfo.None;
        }

        XDocument document;
        try
        {
            using var stream = new MemoryStream(rdlBytes);
            document = XDocument.Load(stream);
        }
        catch
        {
            return FixedDataInfo.None;
        }

        var tablix = document.Descendants().FirstOrDefault(e => e.Name.LocalName == "Tablix");
        if (tablix is null)
        {
            return FixedDataInfo.None;
        }

        var rowHierarchy = tablix.Elements().FirstOrDefault(e => e.Name.LocalName == "TablixRowHierarchy");
        var columnHierarchy = tablix.Elements().FirstOrDefault(e => e.Name.LocalName == "TablixColumnHierarchy");

        // RowHierarchy FixedData → sticky column-header rows (CreateFixedHeaders).
        // ColumnHierarchy FixedData → sticky leading columns (CreateFixedRowHeaders / native
        // "keep row headers visible while scrolling").
        return new FixedDataInfo(
            CountLeadingFixedMembers(rowHierarchy),
            CountLeadingFixedMembers(columnHierarchy));
    }

    /// <summary>
    /// Counts consecutive leading top-level <c>TablixMember</c> siblings with FixedData=true
    /// (stops at the first non-fixed member or a group member that expands).
    /// </summary>
    private static int CountLeadingFixedMembers(XElement? hierarchy)
    {
        if (hierarchy is null)
        {
            return 0;
        }

        var members = hierarchy.Elements().FirstOrDefault(e => e.Name.LocalName == "TablixMembers");
        if (members is null)
        {
            return 0;
        }

        var count = 0;
        foreach (var member in members.Elements().Where(e => e.Name.LocalName == "TablixMember"))
        {
            var fixedData = member.Elements().FirstOrDefault(e => e.Name.LocalName == "FixedData");
            var isFixed = fixedData is not null &&
                          bool.TryParse(fixedData.Value, out var flag) &&
                          flag;
            if (!isFixed)
            {
                break;
            }

            count++;
        }

        return count;
    }
}
