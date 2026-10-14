# SSRS Report Viewer

Anonymous ASP.NET Core (.NET 10) API that proxies on-prem SSRS, plus a Vite React Report Viewer shell.

## Prerequisites

- .NET 10 SDK
- Node.js 20+

## Configure Service Account (server only)

Never put SSRS credentials in the client. Prefer User Secrets locally:

```bash
dotnet user-secrets set "Ssrs:ReportServerBaseUrl" "https://ssrs.example/ReportServer" --project src/SsrsReportViewer.Api
dotnet user-secrets set "Ssrs:Domain" "CONTOSO" --project src/SsrsReportViewer.Api
dotnet user-secrets set "Ssrs:Username" "ssrs-svc" --project src/SsrsReportViewer.Api
dotnet user-secrets set "Ssrs:Password" "<secret>" --project src/SsrsReportViewer.Api
```

Or environment variables (`Ssrs__ReportServerBaseUrl`, `Ssrs__Domain`, `Ssrs__Username`, `Ssrs__Password`).

## Run

API (http://localhost:5201):

```bash
dotnet run --project src/SsrsReportViewer.Api --launch-profile http
```

Client (http://localhost:5173, proxies `/api` → API):

```bash
cd client
npm install
npm run dev
```

Health: `GET /api/health` → `{ "status": "Healthy" }`.

## Tests

HTTP API tests use a fake SSRS adapter (no live ReportServer):

```bash
dotnet test
```
