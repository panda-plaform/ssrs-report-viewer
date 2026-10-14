namespace SsrsReportViewer.Api.Ssrs;

/// <summary>
/// Opaque handle for an SSRS Execution (never exposed to the browser).
/// </summary>
public sealed record ExecutionHandle(string Id);

public sealed record DeviceInfo(
    bool HtmlFragment = true,
    bool Toolbar = false,
    int ZoomPercent = 100,
    int? Section = null,
    string? ReplacementRoot = null,
    string? ResourceStreamRoot = null);

public sealed record RenderResult(
    byte[] Content,
    string MimeType,
    IReadOnlyList<string> StreamIds,
    int PageCount,
    int CurrentPage);

public sealed record StreamResult(byte[] Content, string MimeType);

public sealed class ReportNotFoundException : Exception
{
    public ReportNotFoundException(string path)
        : base($"Report '{path}' was not found.")
    {
        Path = path;
    }

    public string Path { get; }
}

public sealed class RequiredParameterMissingException : Exception
{
    public RequiredParameterMissingException(IReadOnlyList<string> parameterNames)
        : base($"Required Report Parameters missing: {string.Join(", ", parameterNames)}")
    {
        ParameterNames = parameterNames;
    }

    public IReadOnlyList<string> ParameterNames { get; }
}
