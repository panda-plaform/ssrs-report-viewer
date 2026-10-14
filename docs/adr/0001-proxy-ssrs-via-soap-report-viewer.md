# Proxy SSRS via SOAP and a custom Report Viewer

We need interactive paginated reports (Drilldown, Sort, Document Map, Drillthrough, Find, Zoom, paging) inside a React app with a Service Account on the server. Microsoft’s WebForms/WinForms ReportViewer does not fit ASP.NET Core + React, and iframe URL access gives weak control over auth and Action Links. We therefore proxy on-prem SSRS through our API using ReportExecution2005 / ReportingService2010 (NTLM) and host HTML in our own Report Viewer.
