# SSRS Report Viewer

Domain language for the Panda SSRS Report Viewer: a proxied viewer over on-prem SQL Server Reporting Services.

## Language

**Report Viewer**:
The React UI that browses the catalog, collects parameters, shows report HTML, and owns toolbar actions (find, zoom, page, print, export).

**Viewer Session**:
Our opaque client-facing session for one open report interaction, including zoom, page, document-map state, and the drillthrough back stack.

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
A named input defined by a Report, including type and valid-value metadata.

**Valid Value**:
A label and value pair offered for a Report Parameter, whether static in the report or from an SSRS parameter query.

**Select All**:
Report Viewer chrome for choosing every Valid Value on a multi-value Report Parameter at once.
_Avoid_: Select-all parameter value

**Drilldown**:
Toggling show/hide of an item inside the same Report (SSRS toggle).

**Drillthrough**:
Navigating from one Report to another Report with parameters.

**Document Map**:
The hierarchical navigation tree for positions within the current Execution.

**Bookmark**:
A named jump target within the current Execution.

**Service Account**:
The domain identity the API uses to authenticate to SSRS via NTLM.

**View Report**:
The explicit user action that applies Report Parameters and creates or replaces a Viewer Session / Execution for display.

**Find**:
Server-side text search within the current Execution, including navigation to the next match.

**Export**:
Producing a downloadable file (PDF, Excel, or CSV) from the current Execution.

**Print**:
Browser printing of the current HTML report surface.

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
