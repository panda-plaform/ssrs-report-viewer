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

