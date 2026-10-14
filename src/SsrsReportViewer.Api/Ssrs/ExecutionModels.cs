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
    int CurrentPage,
    IReadOnlyList<DocumentMapNode>? DocumentMap = null);

/// <summary>
/// Hierarchical Document Map node for positions within the current Execution.
/// </summary>
public sealed record DocumentMapNode(
    string Id,
    string Label,
    IReadOnlyList<DocumentMapNode> Children);

public sealed record StreamResult(byte[] Content, string MimeType);

/// <summary>
/// Sort direction for ReportExecution2005 Sort (Ascending / Descending / None).
/// </summary>
public enum SortDirection
{
    None = 0,
    Ascending = 1,
    Descending = 2,
}

/// <summary>
/// Positioning hints returned from SSRS Sort before the Viewer Session re-renders HTML.
/// </summary>
public sealed record SortResult(int CurrentPage, int PageCount, string? ReportItem = null);

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
