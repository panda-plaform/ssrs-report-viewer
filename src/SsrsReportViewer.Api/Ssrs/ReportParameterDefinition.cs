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
    bool PromptUser = true)
{
    /// <summary>
    /// Native SSRS parameter bar: PromptUser and a non-empty Prompt. Empty Prompt with
    /// PromptUser still true (e.g. Report List <c>all_value</c>) is not shown.
    /// </summary>
    public bool ShownOnParameterForm =>
        PromptUser && !string.IsNullOrWhiteSpace(Prompt);
}

public sealed record ReportParameterValidValue(string Label, string Value);

public sealed record ParameterValue(string Name, IReadOnlyList<string> Values);
