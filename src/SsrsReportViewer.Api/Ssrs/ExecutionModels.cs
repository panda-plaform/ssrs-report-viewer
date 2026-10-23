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
    string? ResourceStreamRoot = null,
    string? PageWidth = null,
    string? PageHeight = null,
    /// <summary>IMAGE Export OutputFormat (e.g. TIFF).</summary>
    string? OutputFormat = null,
    /// <summary>PDF AccessiblePDF DeviceInfo (tagged / accessible PDF).</summary>
    bool AccessiblePdf = false,
    /// <summary>HTML FindString DeviceInfo — highlights matches on Render when Toolbar is false.</summary>
    string? FindString = null);

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

/// <summary>
/// SSRS Render (or SetExecutionParameters) rejected the Execution because a Report Parameter
/// has no value (<c>rsReportParameterValueNotSet</c> / ReportParameterValueNotSetException).
/// </summary>
public sealed class ParameterValueNotSetException : Exception
{
    public ParameterValueNotSetException(string? parameterName, string? faultMessage = null)
        : base(BuildMessage(parameterName, faultMessage))
    {
        ParameterName = parameterName;
    }

    public string? ParameterName { get; }

    private static string BuildMessage(string? parameterName, string? faultMessage)
    {
        if (!string.IsNullOrWhiteSpace(parameterName))
        {
            return $"This report requires a default or user-defined value for the report parameter '{parameterName}'.";
        }

        if (!string.IsNullOrWhiteSpace(faultMessage))
        {
            return faultMessage;
        }

        return "This report requires a default or user-defined value for a report parameter.";
    }
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
