import { throwIfNotOk } from '../../shared/api/sessionHttp'
import type {
  ParameterSubmission,
  ParametersResponse,
  RenderResponse,
} from '../../shared/api/sessionTypes'

export type {
  DocumentMapNode,
  PageInfo,
  ParameterSubmission,
  ParameterValidValue,
  ParametersResponse,
  RenderResponse,
  ReportParameter,
} from '../../shared/api/sessionTypes'

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
  documentMapVisible?: boolean,
): Promise<RenderResponse> {
  const body: {
    reportPath: string
    parameters: ParameterSubmission[]
    documentMapVisible?: boolean
  } = { reportPath, parameters }
  if (documentMapVisible !== undefined) {
    body.documentMapVisible = documentMapVisible
  }

  const response = await fetch('/api/reports/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  await throwIfNotOk(response)
  return (await response.json()) as RenderResponse
}
