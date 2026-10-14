export type ParameterValidValue = {
  label: string
  value: string
}

export type ReportParameter = {
  name: string
  dataType: string
  nullable: boolean
  multiValue: boolean
  required: boolean
  prompt: string | null
  defaultValues: string[]
  validValues: ParameterValidValue[]
  dependencies: string[]
}

export type ParametersResponse = {
  path: string
  parameters: ReportParameter[]
}

export type ParameterSubmission = {
  name: string
  values: string[]
}

export type PageInfo = {
  currentPage: number
  pageCount: number
}

export type SortDirection = 'Ascending' | 'Descending' | 'None'
export type DocumentMapNode = {
  id: string
  label: string
  children: DocumentMapNode[]
}

export type RenderResponse = {
  sessionId: string
  html: string
  pageInfo: PageInfo
  zoomPercent: number
  documentMap: DocumentMapNode[] | null
  canGoBack: boolean
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

export async function fetchParameters(path: string): Promise<ParametersResponse> {
  const query = new URLSearchParams({ path })
  const response = await fetch(`/api/reports/parameters?${query}`)
  if (!response.ok) {
    throw new Error(await readProblemDetail(response))
  }
  return (await response.json()) as ParametersResponse
}

export async function viewReport(
  reportPath: string,
  parameters: ParameterSubmission[],
): Promise<RenderResponse> {
  const response = await fetch('/api/reports/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportPath, parameters }),
  })
  if (!response.ok) {
    throw new Error(await readProblemDetail(response))
  }
  return (await response.json()) as RenderResponse
}

async function postSessionAction(
  sessionId: string,
  action: string,
  body: unknown,
): Promise<RenderResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  if (!response.ok) {
    throw new Error(await readProblemDetail(response))
  }
  return (await response.json()) as RenderResponse
}

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

export async function toggleDrilldown(
  sessionId: string,
  toggleId: string,
): Promise<RenderResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toggleId }),
  })
  if (!response.ok) {
    throw new Error(await readProblemDetail(response))
  }
  return (await response.json()) as RenderResponse
}

export async function drillthroughReport(
  sessionId: string,
  reportPath: string,
  parameters: ParameterSubmission[],
): Promise<RenderResponse> {
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/drillthrough`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportPath, parameters }),
    },
  )
  if (!response.ok) {
    throw new Error(await readProblemDetail(response))
  }
  return (await response.json()) as RenderResponse
}

export async function goBack(sessionId: string): Promise<RenderResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/back`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await readProblemDetail(response))
  }
  return (await response.json()) as RenderResponse
}


export async function navigateDocumentMap(
  sessionId: string,
  id: string,
): Promise<RenderResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/document-map`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!response.ok) {
    throw new Error(await readProblemDetail(response))
  }
  return (await response.json()) as RenderResponse
}

export async function navigateBookmark(
  sessionId: string,
  id: string,
): Promise<RenderResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/bookmark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!response.ok) {
    throw new Error(await readProblemDetail(response))
  }
  return (await response.json()) as RenderResponse
}

export type ExportFormat = 'PDF' | 'EXCELOPENXML' | 'CSV'

function fileNameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) {
    return fallback
  }

  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1])
    } catch {
      // fall through
    }
  }

  const plain = /filename="?([^";]+)"?/i.exec(header)
  return plain?.[1] ?? fallback
}

/** Downloads Export of the current Execution for the Viewer Session. */
export async function downloadExport(sessionId: string, format: ExportFormat): Promise<void> {
  const query = new URLSearchParams({ format })
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/export?${query}`)
  if (!response.ok) {
    throw new Error(await readProblemDetail(response))
  }

  const blob = await response.blob()
  const fallback =
    format === 'PDF' ? 'report.pdf' : format === 'EXCELOPENXML' ? 'report.xlsx' : 'report.csv'
  const fileName = fileNameFromContentDisposition(
    response.headers.get('Content-Disposition'),
    fallback,
  )

  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

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
  if (!response.ok) {
    throw new Error(await readProblemDetail(response))
  }
  return (await response.json()) as FindResponse
}

export function findInReport(sessionId: string, findValue: string): Promise<FindResponse> {
  return postFind(sessionId, 'find', findValue)
}

export function findNextInReport(sessionId: string, findValue: string): Promise<FindResponse> {
  return postFind(sessionId, 'find/next', findValue)
}

export async function sortReport(
  sessionId: string,
  sortItem: string,
  direction: SortDirection,
  clear = false,
): Promise<RenderResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/sort`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sortItem, direction, clear }),
  })
  if (!response.ok) {
    throw new Error(await readProblemDetail(response))
  }
  return (await response.json()) as RenderResponse
}

