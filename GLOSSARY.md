# SSRS Report Viewer

Domain language for the Panda SSRS Report Viewer: a proxied viewer over on-prem SQL Server Reporting Services.

## Language

**Report Viewer**:
The React UI that browses the catalog, collects parameters, shows report HTML, and owns toolbar actions (find, zoom, page, print, export).

**Viewer Session**:
Our opaque client-facing session for one open report interaction, including zoom, page, Document Map visibility, and the drillthrough back stack.

**Execution**:
The SSRS report-execution instance bound to a Viewer Session (SSRS execution id / execution header).

**Catalog**:
The folder and report tree exposed by SSRS for browsing.

**Catalog Item**:
A node in the Catalog; either a Folder or a Report.

**Folder**:
A Catalog Item that contains other Catalog Items.

**Report**:
A paginated RDL Catalog Item identified by its SSRS path.

**Report Parameter**:
A named input defined by a Report, including type and valid-value metadata. The parameter form lists only parameters native SSRS would show (prompt-user with a non-empty Prompt); hidden or blank-prompt parameters are omitted from the form.

**Valid Value**:
A label and value pair offered for a Report Parameter, whether static in the report or from an SSRS parameter query. Includes report-authored choices such as `<ALL>` when the Report defines them.

**Select All**:
Report Viewer chrome for choosing every Valid Value on a multi-value Report Parameter at once, shown as the first checkbox in the multi-value dropdown. Not a Report Parameter and not a Valid Value.
_Avoid_: Select-all parameter value, all_value, all_value *

**Drilldown**:
Toggling show/hide of an item inside the same Report (SSRS toggle).

**Drillthrough**:
Navigating from one Report to another Report with parameters.

**Document Map**:
The hierarchical navigation tree for positions within the current Execution.

**Document Map Visibility**:
Whether the Report Viewer shows the Document Map pane for the current Viewer Session. Distinct from the Document Map tree itself.
_Avoid_: document-map state (ambiguous), map open, sidebar visible

**Document Map Visibility Preference**:
The user's durable choice of Document Map Visibility for a Report path, restored when a new Viewer Session is created or after the previous session is gone.
_Avoid_: localStorage preference, cookie, remembered map state

**Bookmark**:
A named jump target within the current Execution.

**Service Account**:
The domain identity the API uses to authenticate to SSRS via NTLM.

**API Availability**:
Whether the Report Viewer can reach our API process. Distinct from whether the Catalog (and thus SSRS) is reachable.
_Avoid_: API Healthy, API up, connection status (ambiguous with SSRS)

**Catalog Availability**:
Whether the Report Viewer can load the Catalog through the API (SSRS reachable for browsing). Requires API Availability; failure here does not mean the API process is down.
_Avoid_: API Healthy, SSRS down (implementation), connection status

**View Report**:
The explicit user action that applies Report Parameters and creates or replaces a Viewer Session / Execution for display.

**Find**:
Server-side text search within the current Execution, including navigation to the next match.

**Export**:
Producing a downloadable file from the current Execution via the native format set (Word, Excel, PowerPoint, PDF, Accessible PDF, TIFF, MHTML, CSV, or XML).

**Print**:
Report Viewer toolbar action that opens page size and orientation settings, creates a printer-friendly PDF of the current Execution (via Export with page DeviceInfo), then opens the browser print dialog on that PDF. Distinct from the Export menu’s direct file download.

**Action Link**:
A clickable target inside report HTML that the Report Viewer interprets (Drilldown, sort, Drillthrough, Bookmark).

**External Link**:
A URL or document link that leaves the Report Viewer (opened outside the Viewer Session).

**Sort**:
Re-ordering data in the current Execution via SSRS sort, followed by re-render.

**Report Page**:
The current page or section within a paginated Execution.

**Zoom**:
The render scale for the current Execution, applied by re-rendering with SSRS zoom settings.

**Back**:
Returning from a Drillthrough Report to the previous Viewer Session entry on the back stack.
