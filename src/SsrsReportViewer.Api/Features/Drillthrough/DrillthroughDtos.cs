namespace SsrsReportViewer.Api.Features.Drillthrough;

public sealed record DrillthroughRequest(string? ReportPath, DrillthroughParameter[]? Parameters);

public sealed record DrillthroughParameter(string Name, string[]? Values);
