# Zoom via SSRS re-render

Zoom is stored on the Viewer Session and applied by re-rendering the Execution with SSRS HTML DeviceInfo zoom settings, not by CSS-scaling the fragment in the browser. CSS-only zoom is faster but diverges from SSRS layout/pagination; server re-render keeps Report Page, Find, and Export aligned with what SSRS considers the current scale.

The Viewer toolbar exposes integer percent options matching the native SSRS list (`500`, `200`, `150`, `100`, `75`, `50`, `25`, `10`). The API accepts any integer in `10`–`500` and writes it to DeviceInfo `<Zoom>`.

**Out of scope: Page Width / Whole Page.** SSRS HTML DeviceInfo documents those as string Zoom constants, but they depend on browser viewport sizing and would require changing Zoom from an integer percent to a discriminated mode end-to-end (session, API contract, DeviceInfo). Until that redesign, the toolbar offers percents only.
