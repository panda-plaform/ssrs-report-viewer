namespace SsrsReportViewer.Api.Ssrs;

public sealed class SsrsOptions
{
    public const string SectionName = "Ssrs";

    /// <summary>Base URL of the ReportServer (e.g. https://ssrs.example/ReportServer).</summary>
    public string ReportServerBaseUrl { get; set; } = string.Empty;

    /// <summary>Service Account domain.</summary>
    public string Domain { get; set; } = string.Empty;

    /// <summary>Service Account username.</summary>
    public string Username { get; set; } = string.Empty;

    /// <summary>Service Account password (User Secrets / env in real deployments).</summary>
    public string Password { get; set; } = string.Empty;

    public string DefaultCulture { get; set; } = "en-GB";

    public int SessionIdleTimeoutMinutes { get; set; } = 20;

    public int TimeoutSeconds { get; set; } = 100;

    public long MaxMessageSizeBytes { get; set; } = 64 * 1024 * 1024;

    /// <summary>CORS origins for non-Development environments.</summary>
    public string[] AllowedOrigins { get; set; } = [];
}
