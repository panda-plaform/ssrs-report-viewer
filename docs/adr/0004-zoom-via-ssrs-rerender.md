# Zoom via SSRS re-render

Zoom is stored on the Viewer Session and applied by re-rendering the Execution with SSRS HTML DeviceInfo zoom settings, not by CSS-scaling the fragment in the browser. CSS-only zoom is faster but diverges from SSRS layout/pagination; server re-render keeps Report Page, Find, and Export aligned with what SSRS considers the current scale.
