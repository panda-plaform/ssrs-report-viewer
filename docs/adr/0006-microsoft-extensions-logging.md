# Observability via Microsoft.Extensions.Logging

The host already ships default ASP.NET Core logging configuration, but application code does not use `ILogger<T>`. Failures become ProblemDetails or client errors with little server-side trail for Viewer Session lifecycle, SSRS faults, or View Report / Find / Export outcomes.

We standardize on **`Microsoft.Extensions.Logging`** (`ILogger<T>` / `ILoggerFactory`) as the application logging API: structured messages and scopes (at least session id, report path, and operation name where applicable), categories by type, and no credentials or Service Account secrets in log output. We rejected introducing Serilog (or another facade) as the app-facing API for v1 so the stack stays on the Microsoft defaults already configured by the host; providers can still be swapped at host configuration later. OpenTelemetry / Application Insights exporters are out of scope for this decision and may layer on the same logging and activity model later.
