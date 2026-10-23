import type { RenderResponse } from './sessionTypes'

/** Thrown when a Viewer Session op returns HTTP 410 Gone (idle TTL / expired). */
export class ViewerSessionExpiredError extends Error {
  readonly statusCode = 410 as const

  constructor(message: string) {
    super(message)
    this.name = 'ViewerSessionExpiredError'
  }
}

export function isViewerSessionExpiredError(error: unknown): error is ViewerSessionExpiredError {
  return error instanceof ViewerSessionExpiredError
}

async function readProblemDetail(response: Response): Promise<string> {
  let detail = `HTTP ${response.status}`
  try {
    const problem = (await response.json()) as { detail?: string; title?: string }
    detail = problem.detail ?? problem.title ?? detail
  } catch {
    // keep status-based detail
  }
  return detail
}

export async function throwIfNotOk(response: Response): Promise<void> {
  if (response.ok) {
    return
  }

  const detail = await readProblemDetail(response)
  if (response.status === 410) {
    throw new ViewerSessionExpiredError(detail)
  }

  throw new Error(detail)
}

export async function postSessionAction(
  sessionId: string,
  action: string,
  body?: unknown,
): Promise<RenderResponse> {
  const init: RequestInit = { method: 'POST' }
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/${action}`, init)
  await throwIfNotOk(response)
  return (await response.json()) as RenderResponse
}
