import { postSessionAction } from '../../shared/api/sessionHttp'
import type { RenderResponse } from '../../shared/api/sessionTypes'

/** Zoom via SSRS re-render (ADR-0004). */
export function setZoom(sessionId: string, zoomPercent: number): Promise<RenderResponse> {
  return postSessionAction(sessionId, 'zoom', { zoomPercent })
}

export function setReportPage(
  sessionId: string,
  action: 'next' | 'previous' | 'goto',
  page?: number,
): Promise<RenderResponse> {
  return postSessionAction(sessionId, 'page', { action, page })
}

export function refreshReport(sessionId: string): Promise<RenderResponse> {
  return postSessionAction(sessionId, 'refresh', {})
}
