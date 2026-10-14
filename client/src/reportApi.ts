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

export type DocumentMapNode = {
  id: string
  label: string
  children: DocumentMapNode[]
}

export type RenderResponse = {
  sessionId: string
  html: string
  pageInfo: PageInfo
  documentMap: DocumentMapNode[] | null
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

export async function navigateDocumentMap(
  sessionId: string,
  id: string,
): Promise<RenderResponse> {
  const response = await fetch(`/api/sessions/${sessionId}/document-map`, {
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
  const response = await fetch(`/api/sessions/${sessionId}/bookmark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!response.ok) {
    throw new Error(await readProblemDetail(response))
  }
  return (await response.json()) as RenderResponse
}
