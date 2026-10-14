namespace SsrsReportViewer.Api.Ssrs;

/// <summary>
/// Report Parameter metadata (ReportingService2010 GetItemParameters / ExecutionInfo).
/// </summary>
public sealed record ReportParameterDefinition(
    string Name,
    string DataType,
    bool Nullable,
    bool MultiValue,
    bool Required,
    string? Prompt,
    IReadOnlyList<string> DefaultValues,
    IReadOnlyList<ReportParameterValidValue> ValidValues,
    IReadOnlyList<string> Dependencies,
    bool PromptUser = true);

public sealed record ReportParameterValidValue(string Label, string Value);

public sealed record ParameterValue(string Name, IReadOnlyList<string> Values);
