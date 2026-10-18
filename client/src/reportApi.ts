import { throwIfNotOk } from './http'

export {
  isViewerSessionExpiredError,
  ViewerSessionExpiredError,
} from './http'

export {
  DEFAULT_PRINT_SETTINGS,
  downloadExport,
  fetchExportPdf,
  printExportPdf,
  printPdfBlob,
  PRINT_ORIENTATIONS,
  PRINT_PAGE_SIZES,
  type ExportFormat,
  type PrintOrientation,
  type PrintPageSize,
  type PrintPdfSettings,
} from './features/export-print/exportApi'

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
  reportPath: string
  parameters: ParameterSubmission[]
}

export async function fetchParameters(
  path: string,
  currentValues?: ParameterSubmission[],
): Promise<ParametersResponse> {
  const query = new URLSearchParams({ path })
  if (currentValues && currentValues.length > 0) {
    query.set('values', JSON.stringify(currentValues))
  }
  const response = await fetch(`/api/reports/parameters?${query}`)
  await throwIfNotOk(response)
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
  await throwIfNotOk(response)
  return (await response.json()) as RenderResponse
}

async function postSessionAction(
  sessionId: string,
  action: string,
  body?: unknown,
): Promise<RenderResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  await throwIfNotOk(response)
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
  return postSessionAction(sessionId, 'refresh')
}

export function toggleDrilldown(sessionId: string, toggleId: string): Promise<RenderResponse> {
  return postSessionAction(sessionId, 'drilldown', { toggleId })
}

export function drillthroughReport(
  sessionId: string,
  reportPath: string,
  parameters: ParameterSubmission[],
): Promise<RenderResponse> {
  return postSessionAction(sessionId, 'drillthrough', { reportPath, parameters })
}

export function goBack(sessionId: string): Promise<RenderResponse> {
  return postSessionAction(sessionId, 'back')
}

export function navigateDocumentMap(sessionId: string, id: string): Promise<RenderResponse> {
  return postSessionAction(sessionId, 'document-map', { id })
}

export function navigateBookmark(sessionId: string, id: string): Promise<RenderResponse> {
  return postSessionAction(sessionId, 'bookmark', { id })
}

export function sortReport(
  sessionId: string,
  sortItem: string,
  direction: SortDirection,
  clear = false,
): Promise<RenderResponse> {
  return postSessionAction(sessionId, 'sort', { sortItem, direction, clear })
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
  await throwIfNotOk(response)
  return (await response.json()) as FindResponse
}

export function findInReport(sessionId: string, findValue: string): Promise<FindResponse> {
  return postFind(sessionId, 'find', findValue)
}

export function findNextInReport(sessionId: string, findValue: string): Promise<FindResponse> {
  return postFind(sessionId, 'find/next', findValue)
}
