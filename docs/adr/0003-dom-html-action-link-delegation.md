# Report HTML in the DOM with Action Link delegation

Interactive report HTML is injected into a DOM container in the Report Viewer, and clicks on Action Links (Drilldown, Sort, Drillthrough, Bookmark) are delegated to our API; External Links open outside the Viewer Session. We rejected an iframe / URL-access host because it weakens control over those interactions and Service Account auth. The trust boundary is that HTML comes only from our API (proxied SSRS).
