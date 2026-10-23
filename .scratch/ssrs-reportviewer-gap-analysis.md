# Gap analysis: Panda Report Viewer vs native SSRS ReportViewer

**Date:** 2026-10-23  
**Baseline:** Microsoft ReportViewer (WebForms remote mode) and the SSRS HTML Viewer toolbar it mirrors — not the full Report Manager / portal (subscriptions, security admin, etc.).  
**Product:** Panda SSRS Report Viewer (proxied SOAP + React Report Viewer; ADR-0001).  
**Spec / tickets:** [#72](https://github.com/panda-web-solutions/ssrs-report-viewer/issues/72) (parent); [#73](https://github.com/panda-web-solutions/ssrs-report-viewer/issues/73)–[#76](https://github.com/panda-web-solutions/ssrs-report-viewer/issues/76).

## Verdict

For interactive viewing of remote paginated RDLs, Panda covers most native ReportViewer toolbar and surface behavior. Remaining gaps are chrome/export modes, parameter UX fidelity, intentional platform differences (auth, local RDLC), and Document Map show/hide plus durable preference (in scope to close).

Interactive surface parity for typical remote RDL viewing is roughly **85–90%**. Enterprise drop-in replacement for ReportViewer stays lower until identity and remaining chrome gaps close.

## Parity matrix

| Capability | Native ReportViewer | Panda | Status |
|---|---|---|---|
| Page nav (first / prev / goto / next / last) | Yes | Yes | Parity |
| Refresh | Yes | Yes | Parity |
| Back (Drillthrough) | Yes | Yes | Parity |
| Zoom % list | Yes | Yes (`500`…`10`) | Parity |
| Zoom Page Width / Whole Page | Yes | No | Gap (ADR-0004) |
| Find / Find next | Yes | Yes | Parity |
| Export (Word/Excel/PPT/PDF/Accessible PDF/TIFF/MHTML/CSV/XML) | Yes (server formats) | Yes (same menu set) | Parity |
| Atom / data feed | Often available from server | Explicitly rejected | Gap |
| Print | Yes (historically IE-centric) | PDF + browser print dialog | Different, usable |
| Document Map pane | Toggle + pane | Pane when present; **no toolbar show/hide** | **In scope** (closing) |
| Document Map visibility persistence | Session / control state | None across reload / new session | **In scope** (closing) |
| Document Map navigation UX | Collapsible split, native chrome | Flat tree buttons → navigate | **In scope** (closing) |
| Parameters (prompt, cascade, multi-value, NULL, View Report) | Yes | Yes + Select All | Mostly parity |
| DateTime parameters | Date + time calendar | Date-only input | Gap |
| Drilldown / Sort / Drillthrough / Bookmark | Yes | Yes (Action Link delegation) | Parity |
| Fixed headers | Yes | Implemented to match | Parity aim |
| Maximize / fullscreen | Yes (control chrome) | Browser fullscreen | Close |
| Stop / cancel in-flight render | Yes (WebForms) | No | Gap |
| Catalog browse | Not in control (host/portal) | Built-in folders + reports | Extra |
| Local / RDLC processing | Yes | Out of product scope | N/A by design |
| Per-user SSRS identity | Typical (impersonation / Windows auth) | Service Account only | Product gap (ADR-0002) |
| Data-source credential prompts | Yes when needed | No | Gap |
| Report history / snapshots (`HistoryID`) | Supported | Omitted in SOAP path | Gap |
| Linked reports / resources / models in catalog | Via portal | Reports + folders only | Partial |
| Host `ShowXxx` toolbar API | Rich properties | None (own React chrome) | Different product shape |

## Document Map (in scope to close)

### Current state

- Document Map tree is returned on Viewer Session responses when the Execution provides one.
- Sidebar renders when nodes exist and the shell is not maximized.
- Node click navigates via `POST .../document-map` and re-renders HTML.
- No toolbar show/hide control.
- Visibility is not stored on the Viewer Session and does not survive new sessions or TTL expiry.

### Target (product)

1. **Toolbar Document Map button** — show/hide when a map exists (native `ShowDocumentMapButton` parity).
2. **Client visibility state** — pane follows the preference immediately; hidden while maximized; restore on exit maximize.
3. **Viewer Session persistence** — `documentMapVisible` on the session and on every session response; toggle via session API without SSRS re-render.
4. **Durable preference** — per Report path, browser-local; seeded into new Viewer Sessions and restored after reload / session TTL expiry.
5. **Navigation UX** — closer to native Document Map chrome: collapsible tree expand/collapse without navigating, and clear current-node affordance after navigate (keep existing navigate → re-render path).

Default when no durable preference exists: pane **visible**.

## Documented intentional gaps

| Gap | Reference |
|---|---|
| Page Width / Whole Page Zoom | ADR-0004 |
| Anonymous API + Service Account NTLM | ADR-0002 |
| ATOM export unsupported | Export format allow-list |
| HTML4.0 render + Action Link rewrite | ADR-0001 / ADR-0003 |

## Remaining gaps (not this work)

| Priority | Gap | Why it matters |
|---|---|---|
| High | Auth / row-level security | Shared Service Account proxy vs per-user identity |
| Medium | Page Width / Whole Page Zoom | Common native Zoom habit |
| Medium | DateTime (and typed) parameters | Time-of-day and native calendar UX |
| Medium | Cancel long renders | Native Stop/cancel |
| Lower | ATOM / feeds | Power Pivot / Power BI consumers |
| Lower | Snapshots / history | Historical executions |
| Lower | Credential prompts | Prompted data-source credentials |

## Where Panda differs by design (not gaps)

- Catalog browser and `?path=` deep links (beyond embedding the native control).
- Cross-browser Print via PDF DeviceInfo + browser dialog.
- ASP.NET Core + React host (reason native control was rejected).
- Controlled Action Links via DOM injection + API (ADR-0003).
