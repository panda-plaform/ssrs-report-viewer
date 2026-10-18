namespace SsrsReportViewer.Api.Tests;

/// <summary>
/// Helpers for asserting ADR-0006 BeginScope dimensions on captured log entries.
/// </summary>
internal static class LogScopeAssertions
{
    public static void AssertScopeValue(CapturedLogEntry entry, string key, object expected)
    {
        Assert.True(
            TryGetScopeValue(entry, key, out var actual) && Equals(actual, expected),
            $"Expected scope '{key}'={expected}; scopes were: {FormatScopes(entry)}");
    }

    public static bool TryGetScopeValue(CapturedLogEntry entry, string key, out object? value)
    {
        foreach (var scope in entry.Scopes)
        {
            if (scope is IEnumerable<KeyValuePair<string, object>> pairs)
            {
                foreach (var pair in pairs)
                {
                    if (string.Equals(pair.Key, key, StringComparison.Ordinal))
                    {
                        value = pair.Value;
                        return true;
                    }
                }
            }
        }

        value = null;
        return false;
    }

    private static string FormatScopes(CapturedLogEntry entry) =>
        string.Join("; ", entry.Scopes.Select(s => s?.ToString() ?? "null"));
}
