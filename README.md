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

Catalog: `GET /api/catalog?path=/` → `{ path, folders[{ name, path }], reports[{ name, path }] }` (browse only; no Viewer Session).

Parameters: `GET /api/reports/parameters?path=/Report` → Report Parameter metadata.

View Report: `POST /api/reports/render` `{ reportPath, parameters[{ name, values }] }` → `{ sessionId, html, pageInfo, zoomPercent, canGoBack, documentMap? }`.

Resources: `GET /api/sessions/{sessionId}/resources/{streamId}` (RenderStream proxy; idle TTL / busy rules apply).

Viewer Session interactions (serialized per session; Zoom via SSRS DeviceInfo re-render):

- `POST /api/sessions/{sessionId}/zoom` `{ zoomPercent }` → `{ sessionId, html, pageInfo, zoomPercent, canGoBack, documentMap? }`
- `POST /api/sessions/{sessionId}/page` `{ action: "next"|"previous"|"goto", page? }` → same shape
- `POST /api/sessions/{sessionId}/refresh` → reloads path + parameters into a new Execution; same Viewer Session id
- `POST /api/sessions/{sessionId}/drillthrough` `{ reportPath, parameters[{ name, values }] }` → pushes the current Execution onto the Viewer Session back stack, loads the child report, returns session HTML with `canGoBack: true`
- `POST /api/sessions/{sessionId}/back` → pops the back stack; restores the prior Execution when SSRS still holds it, otherwise reloads path + parameters (reload-fallback)

Export (current Execution for a Viewer Session — the child after Drillthrough): `GET /api/sessions/{sessionId}/export?format=PDF|EXCELOPENXML|CSV` → downloadable attachment.

Print: Report Viewer toolbar calls `window.print()` with print CSS focused on the HTML report surface (use PDF Export for high fidelity).

## Tests

HTTP API tests use a fake SSRS adapter (no live ReportServer):

```bash
dotnet test
```
