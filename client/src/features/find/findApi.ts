import { throwIfNotOk } from '../../http'
import type { PageInfo } from '../../reportApi'

export type FindResponse = {
  html: string
  found: boolean
  pageInfo: PageInfo
}

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
