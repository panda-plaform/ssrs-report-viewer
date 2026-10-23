namespace SsrsReportViewer.Api.Features.ViewReport;

public sealed record ViewReportRequest(string? ReportPath, ViewReportParameter[]? Parameters);

public sealed record ViewReportParameter(string Name, string[]? Values);
