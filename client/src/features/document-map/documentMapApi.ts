import { postSessionAction } from '../../shared/api/sessionHttp'
import type { RenderResponse } from '../../shared/api/sessionTypes'

/**
 * Jump the Viewer Session Execution to a Document Map node.
 * POST /api/sessions/{sessionId}/document-map
 */
export function navigateDocumentMap(
  sessionId: string,
  id: string,
): Promise<RenderResponse> {
  return postSessionAction(sessionId, 'document-map', { id })
}

/**
 * Update Viewer Session Document Map Visibility without an SSRS re-render.
 * POST /api/sessions/{sessionId}/document-map/visibility
 */
export function setDocumentMapVisibility(
  sessionId: string,
  visible: boolean,
): Promise<RenderResponse> {
  return postSessionAction(sessionId, 'document-map/visibility', { visible })
}
