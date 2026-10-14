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

/// <summary>
/// SSRS no longer holds the Execution (idle drop / unknown Execution id).
/// </summary>
public sealed class ExecutionNotFoundException : Exception
{
    public ExecutionNotFoundException(string executionId)
        : base($"Execution '{executionId}' was not found.")
    {
        ExecutionId = executionId;
    }

    public string ExecutionId { get; }
}
