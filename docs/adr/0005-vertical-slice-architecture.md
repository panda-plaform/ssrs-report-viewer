# Vertical slice architecture for API and Report Viewer

The API grew as layer folders (`Ssrs`, `Sessions`, `Reports`) with all Minimal API routes in one host file, and the React Report Viewer is a flat `src/` of feature components over shared API modules. That layout makes cross-cutting changes cheap but makes each Catalog / View Report / Viewer Session interaction harder to find and change safely as the surface grows.

We organize both sides by **vertical slice** (feature): each slice owns its HTTP endpoints (or UI + API client), DTOs, and slice-local helpers, following Microsoft Minimal API feature-folder guidance and React feature-folder colocation. A thin shared kernel remains for the SSRS adapter boundary, Viewer Session store/guard, and HTML helpers used by multiple slices. We rejected staying on pure layers (navigation cost already hurts) and rejected a full Clean Architecture rewrite (too much ceremony for a single proxied Report Viewer context).

`Program.cs` and `App.tsx` stay composition roots only. Public HTTP contracts and glossary behaviour are unchanged by the restructuring itself.
