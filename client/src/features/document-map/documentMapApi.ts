import type { RenderResponse } from '../../reportApi'
import { throwIfNotOk } from '../../viewerSessionHttp'

/**
 * Jump the Viewer Session Execution to a Document Map node.
 * POST /api/sessions/{sessionId}/document-map
 */
export async function navigateDocumentMap(
  sessionId: string,
  id: string,
): Promise<RenderResponse> {
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/document-map`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    },
  )
  await throwIfNotOk(response)
  return (await response.json()) as RenderResponse
}
