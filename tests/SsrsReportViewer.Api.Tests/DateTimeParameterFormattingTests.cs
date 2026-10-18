using System.Globalization;
using SsrsReportViewer.Api.Reports;
using SsrsReportViewer.Api.Ssrs;

namespace SsrsReportViewer.Api.Tests;

public sealed class DateTimeParameterFormattingTests
{
    [Theory]
    [InlineData("2026-10-14", "en-GB", "14/10/2026")]
    [InlineData("2026-10-14", "en-US", "10/14/2026")]
    [InlineData("10/14/2026 10:25:13 PM", "en-GB", "14/10/2026")]
    [InlineData("2026-10-14T22:25:13", "en-GB", "14/10/2026")]
    public void FormatDateTimeValue_maps_html_and_ssrs_defaults_to_parameter_language(
        string input,
        string cultureName,
        string expected)
    {
        var culture = CultureInfo.GetCultureInfo(cultureName);
        Assert.Equal(expected, ReportViewerService.FormatDateTimeValue(input, culture));
    }

    [Theory]
    [InlineData("2026-10-14", "2026-10-14")]
    [InlineData("10/14/2026 10:25:13 PM", "2026-10-14T22:25:13")]
    [InlineData("2026-10-14T22:25:13", "2026-10-14T22:25:13")]
    public void FormatDateTimeValueForCascading_uses_invariant_forms_for_GetItemParameters(
        string input,
        string expected)
    {
        Assert.Equal(expected, ReportViewerService.FormatDateTimeValueForCascading(input));
    }

    [Fact]
    public void FormatDateTimeParameterValues_only_rewrites_DateTime_parameters()
    {
        var definitions = new[]
        {
            new ReportParameterDefinition(
                "StartDate",
                "DateTime",
                Nullable: true,
                MultiValue: false,
                Required: false,
                Prompt: "Start Date",
                DefaultValues: [],
                ValidValues: [],
                Dependencies: []),
            new ReportParameterDefinition(
                "Region",
                "String",
                Nullable: false,
                MultiValue: false,
                Required: false,
                Prompt: "Region",
                DefaultValues: [],
                ValidValues: [],
                Dependencies: []),
        };

        var formatted = ReportViewerService.FormatDateTimeParameterValues(
            definitions,
            [
                new ParameterValue("StartDate", ["2026-10-14"]),
                new ParameterValue("Region", ["East"]),
            ],
            "en-GB");

        Assert.Equal(["14/10/2026"], Assert.Single(formatted, p => p.Name == "StartDate").Values);
        Assert.Equal(["East"], Assert.Single(formatted, p => p.Name == "Region").Values);
    }
}
