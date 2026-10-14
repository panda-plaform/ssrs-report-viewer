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

export type RenderResponse = {
  sessionId: string
  html: string
  pageInfo: PageInfo
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
