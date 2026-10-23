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
  /** Viewer Session Document Map Visibility (chrome; not an SSRS Execution setting). */
  documentMapVisible: boolean
  canGoBack: boolean
  reportPath: string
  parameters: ParameterSubmission[]
}

export type FindResponse = {
  html: string
  found: boolean
  pageInfo: PageInfo
}
