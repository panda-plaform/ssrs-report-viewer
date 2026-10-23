using System.Text;
using SsrsReportViewer.Api.Shared;

namespace SsrsReportViewer.Api.Tests;

public sealed class FixedDataParserTests
{
    [Fact]
    public void Parse_counts_leading_FixedData_row_and_column_members()
    {
        const string rdl =
            """
            <?xml version="1.0" encoding="utf-8"?>
            <Report xmlns="http://schemas.microsoft.com/sqlserver/reporting/2016/01/reportdefinition">
              <Body>
                <ReportItems>
                  <Tablix Name="T1">
                    <TablixBody />
                    <TablixColumnHierarchy>
                      <TablixMembers>
                        <TablixMember><FixedData>true</FixedData></TablixMember>
                        <TablixMember><FixedData>true</FixedData></TablixMember>
                        <TablixMember />
                      </TablixMembers>
                    </TablixColumnHierarchy>
                    <TablixRowHierarchy>
                      <TablixMembers>
                        <TablixMember>
                          <FixedData>true</FixedData>
                          <KeepWithGroup>After</KeepWithGroup>
                        </TablixMember>
                        <TablixMember>
                          <Group Name="Details" />
                        </TablixMember>
                      </TablixMembers>
                    </TablixRowHierarchy>
                  </Tablix>
                </ReportItems>
              </Body>
            </Report>
            """;

        var info = FixedDataParser.Parse(Encoding.UTF8.GetBytes(rdl));

        Assert.Equal(1, info.FixedHeaderRows);
        Assert.Equal(2, info.FixedLeadingColumns);
    }

    [Fact]
    public void Annotate_tags_COLS_tablix_with_fixed_counts()
    {
        const string html =
            """<TABLE CELLSPACING="0" COLS="3" ID="8iT0" class="a150"><TR ID="8iT0tr0"></TR></TABLE>""";

        var annotated = FixedHeaderAnnotator.Annotate(html, new FixedDataInfo(1, 2));

        Assert.Contains("data-ssrs-fixed-rows=\"1\"", annotated, StringComparison.Ordinal);
        Assert.Contains("data-ssrs-fixed-cols=\"2\"", annotated, StringComparison.Ordinal);
        Assert.DoesNotContain("data-ssrs-fixed-rows=\"1\" data-ssrs-fixed-cols=\"2\" data-ssrs-fixed-rows", annotated, StringComparison.Ordinal);
    }
}
