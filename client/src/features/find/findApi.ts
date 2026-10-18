import { throwIfNotOk } from '../../shared/api/sessionHttp'
import type { FindResponse, PageInfo } from '../../shared/api/sessionTypes'

export type { FindResponse } from '../../shared/api/sessionTypes'

async function postFind(
  sessionId: string,
  path: 'find' | 'find/next',
  findValue: string,
): Promise<FindResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ findValue }),
  })
  await throwIfNotOk(response)
  return (await response.json()) as FindResponse
}

export function findInReport(sessionId: string, findValue: string): Promise<FindResponse> {
  return postFind(sessionId, 'find', findValue)
}

export function findNextInReport(sessionId: string, findValue: string): Promise<FindResponse> {
  return postFind(sessionId, 'find/next', findValue)
}

// Keep PageInfo visible to find module consumers that previously imported it via find types.
export type { PageInfo }
