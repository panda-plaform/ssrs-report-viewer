import { postSessionAction } from '../../shared/api/sessionHttp'
import type { RenderResponse, SortDirection } from '../../shared/api/sessionTypes'

export type { SortDirection } from '../../shared/api/sessionTypes'

export function toggleDrilldown(sessionId: string, toggleId: string): Promise<RenderResponse> {
  // Glossary path; /toggle remains as a server-side alias.
  return postSessionAction(sessionId, 'drilldown', { toggleId })
}

export function navigateBookmark(sessionId: string, id: string): Promise<RenderResponse> {
  return postSessionAction(sessionId, 'bookmark', { id })
}

export function sortReport(
  sessionId: string,
  sortItem: string,
  direction: SortDirection,
  clear = false,
): Promise<RenderResponse> {
  return postSessionAction(sessionId, 'sort', { sortItem, direction, clear })
}
