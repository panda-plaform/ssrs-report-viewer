namespace SsrsReportViewer.Api.Shared;

/// <summary>
/// Leading FixedData counts from the first tablix in an RDL (ReportViewer freeze chrome).
/// </summary>
public sealed record FixedDataInfo(int FixedHeaderRows, int FixedLeadingColumns)
{
    public static FixedDataInfo None { get; } = new(0, 0);

    public bool HasFixedMembers => FixedHeaderRows > 0 || FixedLeadingColumns > 0;
}
