namespace SsrsReportViewer.Api.Features.ViewReport;

public sealed record ViewReportRequest(
    string? ReportPath,
    ViewReportParameter[]? Parameters,
    bool? DocumentMapVisible = null);

public sealed record ViewReportParameter(string Name, string[]? Values);
