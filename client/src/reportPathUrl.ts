/** History API helpers for Catalog ↔ report-focused Viewer (`?path=` only). */

export type ViewerMode = 'catalog' | 'report'

export function readReportPathFromSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const path = params.get('path')
  if (path === null) {
    return null
  }

  const trimmed = path.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function buildReportPathSearch(reportPath: string): string {
  return `?path=${encodeURIComponent(reportPath)}`
}

export function catalogSearch(): string {
  return ''
}

export function viewerModeFromReportPath(reportPath: string | null): ViewerMode {
  return reportPath ? 'report' : 'catalog'
}

/** True when Drillthrough/Back should replaceState `?path=` to match the open Report. */
export function openReportPathDiffers(currentSearch: string, nextReportPath: string): boolean {
  return readReportPathFromSearch(currentSearch) !== nextReportPath
}
