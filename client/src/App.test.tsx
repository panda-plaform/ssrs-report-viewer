import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { findInReport } from './features/find/findApi'
import { drillthroughReport, goBack } from './features/drillthrough/drillthroughApi'
import {
  navigateDocumentMap,
  setDocumentMapVisibility,
} from './features/document-map/documentMapApi'
import {
  readDocumentMapVisibilityPreference,
  writeDocumentMapVisibilityPreference,
} from './features/document-map/documentMapVisibilityPreference'
import { fetchParameters, viewReport } from './features/view-report/viewReportApi'
import { API_UNAVAILABLE_COPY, ViewerSessionExpiredError } from './shared/api/sessionHttp'

vi.mock('./features/view-report/viewReportApi', async () => {
  const actual =
    await vi.importActual<typeof import('./features/view-report/viewReportApi')>(
      './features/view-report/viewReportApi',
    )
  return {
    ...actual,
    fetchParameters: vi.fn(),
    viewReport: vi.fn(),
  }
})

vi.mock('./features/find/findApi', () => ({
  findInReport: vi.fn(),
  findNextInReport: vi.fn(),
}))

vi.mock('./features/drillthrough/drillthroughApi', () => ({
  goBack: vi.fn(),
  drillthroughReport: vi.fn(),
}))

vi.mock('./features/document-map/documentMapApi', () => ({
  navigateDocumentMap: vi.fn(),
  setDocumentMapVisibility: vi.fn(),
}))

vi.mock('./features/export-print/exportApi', async () => {
  const actual =
    await vi.importActual<typeof import('./features/export-print/exportApi')>(
      './features/export-print/exportApi',
    )
  return {
    ...actual,
    downloadExport: vi.fn(),
  }
})

vi.mock('./features/zoom-page/zoomPageApi', () => ({
  setZoom: vi.fn(),
  setReportPage: vi.fn(),
  refreshReport: vi.fn(),
}))

vi.mock('./features/catalog/CatalogBrowser', () => ({
  CatalogBrowser: () => <div>Catalog browser</div>,
}))

const renderResult = {
  sessionId: 'session-1',
  html: '<div class="report-body">Report HTML</div>',
  pageInfo: { currentPage: 1, pageCount: 3 },
  zoomPercent: 100,
  documentMap: [{ id: 'n1', label: 'Section A', children: [] }],
  documentMapVisible: true,
  canGoBack: false,
  reportPath: '/Reports/Demo',
  parameters: [{ name: 'StartDate', values: ['2024-01-15'] }],
}

async function openReportChrome() {
  const user = userEvent.setup()
  render(<App />)

  await screen.findByRole('button', { name: 'View Report' })
  await user.click(screen.getByRole('button', { name: 'View Report' }))

  await screen.findByRole('toolbar', { name: 'Report Viewer toolbar' })
  return user
}

describe('API Availability first paint', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('shows Checking API while health is in flight', async () => {
    let resolveHealth!: (value: { ok: boolean; json: () => Promise<{ status: string }> }) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveHealth = resolve
          }),
      ),
    )

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent('Checking API…')
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(screen.queryByText('Catalog browser')).not.toBeInTheDocument()

    resolveHealth({
      ok: true,
      json: async () => ({ status: 'Healthy' }),
    })

    expect(await screen.findByRole('status')).toHaveTextContent('API available')
  })

  it('shows API available when health succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'Healthy' }),
      }),
    )

    render(<App />)

    expect(await screen.findByRole('status')).toHaveTextContent('API available')
    expect(screen.queryByText(/API Healthy/i)).not.toBeInTheDocument()
  })

  it('shows API unavailable with Retry and keeps Catalog gated on initial health failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')))

    render(<App />)

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(API_UNAVAILABLE_COPY)
    const retry = screen.getByRole('button', { name: 'Retry' })
    expect(status).toContainElement(retry)
    expect(retry).toHaveClass('primary-action')
    expect(screen.queryByText('Catalog browser')).not.toBeInTheDocument()
    expect(screen.queryByText(/Failed to fetch/i)).not.toBeInTheDocument()
  })

  it('Retry re-checks /api/health and unlocks the Catalog gate on success', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'Healthy' }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText('Catalog browser')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('status')).toHaveTextContent('API available')
    expect(screen.getByText('Catalog browser')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/health')
    expect(fetchMock.mock.calls.every((call) => call[0] === '/api/health')).toBe(true)
  })
})

describe('API Availability mid-session', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/?path=%2FReports%2FDemo')

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'Healthy' }),
      }),
    )

    vi.mocked(fetchParameters).mockReset().mockResolvedValue({
      path: '/Reports/Demo',
      parameters: [
        {
          name: 'StartDate',
          dataType: 'DateTime',
          nullable: true,
          multiValue: false,
          required: false,
          prompt: 'Start Date',
          defaultValues: ['2024-01-15'],
          validValues: [],
          dependencies: [],
        },
      ],
    })

    vi.mocked(viewReport).mockReset().mockResolvedValue(renderResult)
    vi.mocked(navigateDocumentMap).mockReset()
    vi.mocked(setDocumentMapVisibility).mockReset().mockResolvedValue({
      ...renderResult,
      documentMapVisible: false,
    })
  })

  it('shows API unavailable with Retry, keeps report HTML, and leaves status visible in report mode', async () => {
    const user = await openReportChrome()

    expect(document.querySelector('.report-html')).toHaveTextContent('Report HTML')

    vi.mocked(navigateDocumentMap).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await user.click(screen.getByRole('button', { name: 'Section A' }))

    const unavailable = await screen.findByRole('status')
    expect(unavailable).toHaveTextContent(API_UNAVAILABLE_COPY)
    expect(unavailable).not.toHaveClass('visually-hidden')
    const retry = screen.getByRole('button', { name: 'Retry' })
    expect(unavailable).toContainElement(retry)
    expect(retry).toHaveClass('primary-action')
    expect(document.querySelector('.report-html')).toHaveTextContent('Report HTML')
    expect(screen.getByRole('toolbar', { name: 'Report Viewer toolbar' })).toBeInTheDocument()
    expect(screen.queryByText(/Failed to fetch/i)).not.toBeInTheDocument()
  })

  it('disables toolbar and Document Map API actions while API Availability is lost', async () => {
    const user = await openReportChrome()

    vi.mocked(navigateDocumentMap).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await user.click(screen.getByRole('button', { name: 'Section A' }))

    await screen.findByText(API_UNAVAILABLE_COPY)

    const toolbar = screen.getByRole('toolbar', { name: 'Report Viewer toolbar' })
    expect(within(toolbar).getByRole('button', { name: 'Refresh' })).toBeDisabled()
    expect(within(toolbar).getByRole('button', { name: 'Find' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Section A' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'View Report' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Return to Catalog' })).toBeEnabled()
  })

  it('Retry re-checks /api/health only, re-enables actions, and keeps the Viewer Session without replaying', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'Healthy' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = await openReportChrome()

    vi.mocked(navigateDocumentMap).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await user.click(screen.getByRole('button', { name: 'Section A' }))
    await screen.findByRole('button', { name: 'Retry' })

    const healthCallsBeforeRetry = fetchMock.mock.calls.filter((call) => call[0] === '/api/health')
      .length
    navigateDocumentMap.mockClear()

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('API available')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(document.querySelector('.report-html')).toHaveTextContent('Report HTML')
    expect(screen.getByRole('toolbar', { name: 'Report Viewer toolbar' })).toBeInTheDocument()

    const toolbar = screen.getByRole('toolbar', { name: 'Report Viewer toolbar' })
    expect(within(toolbar).getByRole('button', { name: 'Refresh' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Section A' })).toBeEnabled()
    expect(navigateDocumentMap).not.toHaveBeenCalled()

    const healthCallsAfterRetry = fetchMock.mock.calls.filter((call) => call[0] === '/api/health')
    expect(healthCallsAfterRetry.length).toBe(healthCallsBeforeRetry + 1)
    expect(fetchMock.mock.calls.slice(healthCallsBeforeRetry).every((call) => call[0] === '/api/health')).toBe(
      true,
    )
  })

  it('keeps Viewer Session expired (410) handling distinct from API Availability loss', async () => {
    const user = await openReportChrome()

    vi.mocked(navigateDocumentMap).mockRejectedValueOnce(
      new ViewerSessionExpiredError('Viewer Session expired'),
    )
    await user.click(screen.getByRole('button', { name: 'Section A' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Viewer Session expired')
    expect(screen.queryByText(API_UNAVAILABLE_COPY)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(screen.queryByRole('toolbar', { name: 'Report Viewer toolbar' })).not.toBeInTheDocument()
    expect(document.querySelector('.report-html')).not.toBeInTheDocument()
    expect(screen.getByText('API available')).toHaveClass('visually-hidden')
  })

  it('flips API Availability unavailable when View Report rejects with a network TypeError', async () => {
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('button', { name: 'View Report' })
    vi.mocked(viewReport).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await user.click(screen.getByRole('button', { name: 'View Report' }))

    const unavailable = await screen.findByText(API_UNAVAILABLE_COPY)
    expect(unavailable).toHaveAttribute('role', 'status')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText(/Failed to fetch/i)).not.toBeInTheDocument()
  })

  it('flips API Availability unavailable when Report Parameter load rejects with a network TypeError', async () => {
    vi.mocked(fetchParameters).mockReset().mockRejectedValue(new TypeError('Failed to fetch'))

    render(<App />)

    const unavailable = await screen.findByText(API_UNAVAILABLE_COPY)
    expect(unavailable).toHaveAttribute('role', 'status')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText(/Failed to fetch/i)).not.toBeInTheDocument()
  })
})

describe('Report Viewer chrome composition', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/?path=%2FReports%2FDemo')

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'Healthy' }),
      }),
    )

    vi.mocked(fetchParameters).mockReset().mockResolvedValue({
      path: '/Reports/Demo',
      parameters: [
        {
          name: 'StartDate',
          dataType: 'DateTime',
          nullable: true,
          multiValue: false,
          required: false,
          prompt: 'Start Date',
          defaultValues: ['2024-01-15'],
          validValues: [],
          dependencies: [],
        },
        {
          name: 'Region',
          dataType: 'String',
          nullable: false,
          multiValue: false,
          required: true,
          prompt: 'Region',
          defaultValues: ['North'],
          validValues: [
            { label: 'North', value: 'North' },
            { label: 'South', value: 'South' },
          ],
          dependencies: [],
        },
      ],
    })

    vi.mocked(viewReport).mockReset().mockResolvedValue(renderResult)
    vi.mocked(goBack).mockReset()
    vi.mocked(drillthroughReport).mockReset()
    vi.mocked(navigateDocumentMap).mockReset()
    vi.mocked(setDocumentMapVisibility).mockReset().mockResolvedValue({
      ...renderResult,
      documentMapVisible: false,
    })
  })

  it('shows the Report Parameter strip before View Report', async () => {
    render(<App />)

    const parameters = await screen.findByRole('region', { name: 'Report Parameters' })
    expect(await within(parameters).findByRole('button', { name: 'View Report' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Return to Catalog' })).toBeInTheDocument()
  })

  it('keeps parameters visible after View Report and allows Hide / Show', async () => {
    const user = await openReportChrome()

    const parameters = screen.getByRole('region', { name: 'Report Parameters' })
    const toolbar = screen.getByRole('toolbar', { name: 'Report Viewer toolbar' })
    const layout = document.querySelector('.viewer-layout')
    expect(screen.getByRole('button', { name: 'Return to Catalog' })).toBeInTheDocument()
    expect(screen.getByLabelText('Open Report path')).toHaveTextContent('/Reports/Demo')
    expect(screen.getByRole('button', { name: 'Hide parameters' })).toBeInTheDocument()
    expect(parameters.closest('.report-view')).not.toBeNull()
    expect(layout).toContainElement(toolbar)
    expect(parameters.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Hide parameters' }))
    expect(screen.queryByRole('region', { name: 'Report Parameters' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Return to Catalog' })).toBeInTheDocument()
    expect(screen.getByLabelText('Open Report path')).toHaveTextContent('/Reports/Demo')
    expect(screen.getByRole('button', { name: 'Show parameters' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hide parameters' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show parameters' }))
    expect(screen.getByRole('region', { name: 'Report Parameters' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide parameters' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show parameters' })).not.toBeInTheDocument()
  })

  it('keeps Document Map available when the Execution provides nodes', async () => {
    await openReportChrome()

    const layout = document.querySelector('.viewer-layout')
    expect(layout).toHaveClass('viewer-layout-with-map')
    expect(layout).toHaveAttribute('data-document-map-pane', 'true')
    expect(screen.getByRole('navigation', { name: 'Document Map' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Section A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide Document Map' })).toBeInTheDocument()
  })

  it('uses a single-column report-only layout when Document Map is empty', async () => {
    vi.mocked(viewReport).mockResolvedValueOnce({
      ...renderResult,
      documentMap: null,
    })

    await openReportChrome()

    const layout = document.querySelector('.viewer-layout')
    expect(layout).toHaveClass('viewer-layout-report-only')
    expect(layout).toHaveAttribute('data-document-map-pane', 'false')
    expect(screen.queryByRole('navigation', { name: 'Document Map' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hide Document Map' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show Document Map' })).not.toBeInTheDocument()
  })

  it('hides the Document Map pane when Viewer Session Document Map Visibility is false', async () => {
    vi.mocked(viewReport).mockResolvedValueOnce({
      ...renderResult,
      documentMapVisible: false,
    })

    await openReportChrome()

    const layout = document.querySelector('.viewer-layout')
    expect(layout).toHaveClass('viewer-layout-report-only')
    expect(layout).toHaveAttribute('data-document-map-pane', 'false')
    expect(screen.queryByRole('navigation', { name: 'Document Map' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show Document Map' })).toBeInTheDocument()
  })

  it('hides and restores the Document Map pane via the toolbar visibility control', async () => {
    const user = await openReportChrome()

    expect(screen.getByRole('navigation', { name: 'Document Map' })).toBeInTheDocument()

    vi.mocked(setDocumentMapVisibility).mockResolvedValueOnce({
      ...renderResult,
      documentMapVisible: false,
    })
    await user.click(screen.getByRole('button', { name: 'Hide Document Map' }))

    await waitFor(() => {
      expect(setDocumentMapVisibility).toHaveBeenCalledWith('session-1', false)
    })
    expect(screen.queryByRole('navigation', { name: 'Document Map' })).not.toBeInTheDocument()
    expect(document.querySelector('.viewer-layout')).toHaveAttribute('data-document-map-pane', 'false')
    expect(screen.getByRole('button', { name: 'Show Document Map' })).toBeInTheDocument()

    vi.mocked(setDocumentMapVisibility).mockResolvedValueOnce({
      ...renderResult,
      documentMapVisible: true,
    })
    await user.click(screen.getByRole('button', { name: 'Show Document Map' }))

    await waitFor(() => {
      expect(setDocumentMapVisibility).toHaveBeenCalledWith('session-1', true)
    })
    expect(screen.getByRole('navigation', { name: 'Document Map' })).toBeInTheDocument()
    expect(document.querySelector('.viewer-layout')).toHaveAttribute('data-document-map-pane', 'true')
    expect(screen.getByRole('button', { name: 'Hide Document Map' })).toBeInTheDocument()
  })

  it('expands and collapses Document Map branches without navigating', async () => {
    vi.mocked(viewReport).mockResolvedValueOnce({
      ...renderResult,
      documentMap: [
        {
          id: 'root',
          label: 'Revenue',
          children: [
            { id: 'north', label: 'North Region', children: [] },
            { id: 'south', label: 'South Region', children: [] },
          ],
        },
      ],
    })
    const user = await openReportChrome()

    expect(screen.getByRole('button', { name: 'North Region' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Collapse Revenue' }))
    expect(screen.queryByRole('button', { name: 'North Region' })).not.toBeInTheDocument()
    expect(navigateDocumentMap).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Expand Revenue' }))
    expect(screen.getByRole('button', { name: 'North Region' })).toBeInTheDocument()
    expect(navigateDocumentMap).not.toHaveBeenCalled()
  })

  it('marks the Document Map node current after a successful navigate', async () => {
    const user = await openReportChrome()

    vi.mocked(navigateDocumentMap).mockResolvedValueOnce({
      ...renderResult,
      html: '<div class="report-body">Section A</div>',
    })

    await user.click(screen.getByRole('button', { name: 'Section A' }))

    await waitFor(() => {
      expect(navigateDocumentMap).toHaveBeenCalledWith('session-1', 'n1')
    })
    expect(screen.getByRole('button', { name: 'Section A' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(screen.getByRole('navigation', { name: 'Document Map' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide Document Map' })).toBeInTheDocument()
  })

  it('keeps Document Map Visibility when navigate fails', async () => {
    const user = await openReportChrome()

    expect(screen.getByRole('navigation', { name: 'Document Map' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide Document Map' })).toBeInTheDocument()

    // Mirrors ProblemDetails detail from ReportNotReady → 409 (sessionHttp throwIfNotOk).
    const reportNotReadyDetail =
      'The selected report is not ready for viewing. The report is still being rendered or a report snapshot is not available.'
    vi.mocked(navigateDocumentMap).mockRejectedValueOnce(new Error(reportNotReadyDetail))

    await user.click(screen.getByRole('button', { name: 'Section A' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(reportNotReadyDetail)
    })
    expect(screen.getByRole('navigation', { name: 'Document Map' })).toBeInTheDocument()
    expect(document.querySelector('.viewer-layout')).toHaveAttribute('data-document-map-pane', 'true')
    expect(screen.getByRole('button', { name: 'Hide Document Map' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Section A' })).not.toHaveAttribute('aria-current')
  })

  it('tones down shell marketing chrome so toolbar and report lead after View Report', async () => {
    await openReportChrome()

    const shell = screen.getByRole('main')
    expect(shell).toHaveClass('shell-report')

    const title = within(shell).getByRole('heading', { name: 'SSRS Report Viewer', level: 1 })
    expect(title).toHaveClass('visually-hidden')

    const lede = shell.querySelector('.lede')
    expect(lede).toHaveClass('visually-hidden')

    const status = within(shell).getByText(/API available/i)
    expect(status).toHaveClass('visually-hidden')

    expect(screen.getByRole('toolbar', { name: 'Report Viewer toolbar' })).toBeInTheDocument()
  })

  it('shares App busy between the parameter strip and Viewer Toolbar when parameters are shown', async () => {
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('button', { name: 'View Report' })

    let resolveView: ((value: typeof renderResult) => void) | undefined
    vi.mocked(viewReport).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveView = resolve
        }),
    )

    await user.click(screen.getByRole('button', { name: 'View Report' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Viewing…' })).toBeDisabled()
    })

    resolveView?.(renderResult)

    const toolbar = await screen.findByRole('toolbar', { name: 'Report Viewer toolbar' })

    let resolveFind:
      | ((value: {
          html: string
          found: boolean
          pageInfo: { currentPage: number; pageCount: number }
        }) => void)
      | undefined
    vi.mocked(findInReport).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFind = resolve
        }),
    )

    const findField = within(toolbar).getByRole('searchbox', { name: 'Find' })
    await user.type(findField, 'x')
    await user.click(within(toolbar).getByRole('button', { name: 'Find' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'View Report' })).toBeDisabled()
      expect(within(toolbar).getByRole('button', { name: 'Refresh' })).toBeDisabled()
    })

    resolveFind?.({
      html: '<div>found</div>',
      found: true,
      pageInfo: { currentPage: 1, pageCount: 3 },
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'View Report' })).toBeEnabled()
    })
  })

  it('keeps Find status inline in the toolbar without a full-width second band', async () => {
    const user = await openReportChrome()
    vi.mocked(findInReport).mockResolvedValueOnce({
      html: '<div>found</div>',
      found: false,
      pageInfo: { currentPage: 1, pageCount: 3 },
    })

    const toolbar = screen.getByRole('toolbar', { name: 'Report Viewer toolbar' })
    await user.type(within(toolbar).getByRole('searchbox', { name: 'Find' }), 'missing')
    await user.click(within(toolbar).getByRole('button', { name: 'Find' }))

    const findStatus = await within(toolbar).findByRole('status')
    expect(findStatus).toHaveClass('viewer-toolbar-find-status')
    expect(getComputedStyle(findStatus).flexBasis).not.toBe('100%')
    expect(findStatus.tagName.toLowerCase()).toBe('span')
  })

  it('enters fullscreen on Maximize and keeps Document Map while hiding parameters until Restore', async () => {
    const user = await openReportChrome()

    expect(screen.getByRole('region', { name: 'Report Parameters' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Document Map' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Maximize' }))

    expect(document.fullscreenElement).toBe(document.documentElement)
    expect(screen.getByRole('main')).toHaveClass('shell-maximized')
    expect(screen.queryByRole('region', { name: 'Report Parameters' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Return to Catalog' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hide parameters' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show parameters' })).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Document Map' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide Document Map' })).toBeInTheDocument()
    expect(document.querySelector('.viewer-layout')).toHaveAttribute('data-document-map-pane', 'true')

    await user.click(screen.getByRole('button', { name: 'Restore' }))

    expect(document.fullscreenElement).toBeNull()
    expect(screen.getByRole('main')).not.toHaveClass('shell-maximized')
    expect(screen.getByRole('button', { name: 'Return to Catalog' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Report Parameters' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Document Map' })).toBeInTheDocument()
  })

  it('leaves Document Map Visibility unchanged when restoring after maximize with Visibility already off', async () => {
    vi.mocked(viewReport).mockResolvedValueOnce({
      ...renderResult,
      documentMapVisible: false,
    })
    const user = await openReportChrome()

    expect(screen.queryByRole('navigation', { name: 'Document Map' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show Document Map' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Maximize' }))
    expect(screen.queryByRole('navigation', { name: 'Document Map' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show Document Map' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Restore' }))

    expect(screen.queryByRole('navigation', { name: 'Document Map' })).not.toBeInTheDocument()
    expect(document.querySelector('.viewer-layout')).toHaveAttribute('data-document-map-pane', 'false')
    expect(screen.getByRole('button', { name: 'Show Document Map' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Report Parameters' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Return to Catalog' })).toBeInTheDocument()
  })

  it('toggles Document Map Visibility and Preference while maximized', async () => {
    localStorage.clear()
    const user = await openReportChrome()

    await user.click(screen.getByRole('button', { name: 'Maximize' }))
    expect(screen.getByRole('navigation', { name: 'Document Map' })).toBeInTheDocument()

    vi.mocked(setDocumentMapVisibility).mockResolvedValueOnce({
      ...renderResult,
      documentMapVisible: false,
    })
    await user.click(screen.getByRole('button', { name: 'Hide Document Map' }))

    await waitFor(() => {
      expect(setDocumentMapVisibility).toHaveBeenCalledWith('session-1', false)
    })
    expect(screen.queryByRole('navigation', { name: 'Document Map' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show Document Map' })).toBeInTheDocument()
    expect(readDocumentMapVisibilityPreference('/Reports/Demo')).toBe(false)

    vi.mocked(setDocumentMapVisibility).mockResolvedValueOnce({
      ...renderResult,
      documentMapVisible: true,
    })
    await user.click(screen.getByRole('button', { name: 'Show Document Map' }))

    await waitFor(() => {
      expect(setDocumentMapVisibility).toHaveBeenCalledWith('session-1', true)
    })
    expect(screen.getByRole('navigation', { name: 'Document Map' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide Document Map' })).toBeInTheDocument()
    expect(readDocumentMapVisibilityPreference('/Reports/Demo')).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Restore' }))
    expect(screen.getByRole('navigation', { name: 'Document Map' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Report Parameters' })).toBeInTheDocument()
  })

  it('omits Document Map pane and toolbar control while maximized when Execution has no Document Map', async () => {
    vi.mocked(viewReport).mockResolvedValueOnce({
      ...renderResult,
      documentMap: null,
    })
    const user = await openReportChrome()

    await user.click(screen.getByRole('button', { name: 'Maximize' }))

    expect(screen.getByRole('main')).toHaveClass('shell-maximized')
    expect(screen.queryByRole('navigation', { name: 'Document Map' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hide Document Map' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show Document Map' })).not.toBeInTheDocument()
    expect(document.querySelector('.viewer-layout')).toHaveAttribute('data-document-map-pane', 'false')
  })

  it('shows NULL under nullable controls and a DateTime calendar field in the strip', async () => {
    render(<App />)

    const parameters = await screen.findByRole('region', { name: 'Report Parameters' })
    const startDateField = await within(parameters).findByLabelText(/Start Date/i)
    expect(startDateField).toHaveAttribute('type', 'date')

    const nullCheckbox = within(parameters).getByRole('checkbox', { name: 'NULL' })
    const field = startDateField.closest('.parameter-field')
    expect(field).not.toBeNull()
    expect(field!.querySelector('.parameter-control')).toContainElement(startDateField)
    expect(field!.querySelector('.parameter-null-row')).toContainElement(nullCheckbox)
    expect(
      startDateField.compareDocumentPosition(nullCheckbox) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('marks report chrome as no-print so print CSS can hide it', async () => {
    await openReportChrome()

    const parameters = screen.getByRole('region', { name: 'Report Parameters' })
    const toolbar = screen.getByRole('toolbar', { name: 'Report Viewer toolbar' })
    const returnButton = screen.getByRole('button', { name: 'Return to Catalog' })

    expect(parameters.closest('.no-print')).not.toBeNull()
    expect(toolbar.closest('.no-print')).not.toBeNull()
    expect(returnButton.closest('.no-print')).not.toBeNull()
  })

  it('syncs ?path=, selected Report path, and parameter form after Back with replaceState', async () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
    const pushStateSpy = vi.spyOn(window.history, 'pushState')

    vi.mocked(viewReport).mockResolvedValueOnce({
      ...renderResult,
      canGoBack: true,
      reportPath: '/Sales/Child',
      parameters: [{ name: 'Region', values: ['North'] }],
      html: '<div class="report-body">Child HTML</div>',
    })
    window.history.replaceState({}, '', '/?path=%2FSales%2FChild')

    vi.mocked(fetchParameters).mockImplementation(async (path: string) => {
      if (path === '/Sales/Parent') {
        return {
          path: '/Sales/Parent',
          parameters: [
            {
              name: 'Region',
              dataType: 'String',
              nullable: false,
              multiValue: false,
              required: true,
              prompt: 'Region',
              defaultValues: ['East'],
              validValues: [
                { label: 'East', value: 'East' },
                { label: 'West', value: 'West' },
              ],
              dependencies: [],
            },
          ],
        }
      }

      return {
        path: '/Sales/Child',
        parameters: [
          {
            name: 'Region',
            dataType: 'String',
            nullable: false,
            multiValue: false,
            required: true,
            prompt: 'Region',
            defaultValues: ['North'],
            validValues: [
              { label: 'North', value: 'North' },
              { label: 'South', value: 'South' },
            ],
            dependencies: [],
          },
        ],
      }
    })

    vi.mocked(goBack).mockResolvedValueOnce({
      ...renderResult,
      canGoBack: false,
      reportPath: '/Sales/Parent',
      parameters: [{ name: 'Region', values: ['West'] }],
      html: '<div class="report-body">Parent HTML</div>',
    })

    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('button', { name: 'View Report' })
    await user.click(screen.getByRole('button', { name: 'View Report' }))
    await screen.findByRole('toolbar', { name: 'Report Viewer toolbar' })

    expect(screen.getByLabelText('Open Report path')).toHaveTextContent('/Sales/Child')

    replaceStateSpy.mockClear()
    pushStateSpy.mockClear()

    await user.click(screen.getByRole('button', { name: 'Back' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Open Report path')).toHaveTextContent('/Sales/Parent')
    })
    expect(window.location.search).toBe('?path=%2FSales%2FParent')
    expect(replaceStateSpy).toHaveBeenCalled()
    expect(pushStateSpy).not.toHaveBeenCalled()

    expect(screen.queryByRole('region', { name: 'Report Parameters' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show parameters' }))

    const parameters = await screen.findByRole('region', { name: 'Report Parameters' })
    await waitFor(() => {
      expect(within(parameters).getByLabelText(/Region/i)).toHaveValue('West')
    })
  })

  it('syncs ?path=, selected Report path, and parameter form after Drillthrough with replaceState', async () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
    const pushStateSpy = vi.spyOn(window.history, 'pushState')

    window.history.replaceState({}, '', '/?path=%2FSales%2FParent')

    vi.mocked(fetchParameters).mockImplementation(async (path: string) => {
      if (path === '/Sales/Child') {
        return {
          path: '/Sales/Child',
          parameters: [
            {
              name: 'Region',
              dataType: 'String',
              nullable: false,
              multiValue: false,
              required: true,
              prompt: 'Region',
              defaultValues: ['North'],
              validValues: [
                { label: 'North', value: 'North' },
                { label: 'South', value: 'South' },
              ],
              dependencies: [],
            },
          ],
        }
      }

      return {
        path: '/Sales/Parent',
        parameters: [
          {
            name: 'Region',
            dataType: 'String',
            nullable: false,
            multiValue: false,
            required: true,
            prompt: 'Region',
            defaultValues: ['East'],
            validValues: [
              { label: 'East', value: 'East' },
              { label: 'West', value: 'West' },
            ],
            dependencies: [],
          },
        ],
      }
    })

    vi.mocked(viewReport).mockResolvedValueOnce({
      ...renderResult,
      canGoBack: false,
      reportPath: '/Sales/Parent',
      parameters: [{ name: 'Region', values: ['West'] }],
      html: `<div class="report-body">
        Parent HTML
        <a href="#" data-ssrs-action="drillthrough" data-ssrs-report-path="/Sales/Child" data-ssrs-parameters='[{"name":"Region","values":["North"]}]'>Open child</a>
      </div>`,
    })

    vi.mocked(drillthroughReport).mockResolvedValueOnce({
      ...renderResult,
      canGoBack: true,
      reportPath: '/Sales/Child',
      parameters: [{ name: 'Region', values: ['North'] }],
      html: '<div class="report-body">Child HTML</div>',
    })

    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('button', { name: 'View Report' })
    await user.click(screen.getByRole('button', { name: 'View Report' }))
    await screen.findByRole('toolbar', { name: 'Report Viewer toolbar' })

    expect(screen.getByLabelText('Open Report path')).toHaveTextContent('/Sales/Parent')

    replaceStateSpy.mockClear()
    pushStateSpy.mockClear()

    await user.click(screen.getByRole('link', { name: 'Open child' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Open Report path')).toHaveTextContent('/Sales/Child')
    })
    expect(window.location.search).toBe('?path=%2FSales%2FChild')
    expect(replaceStateSpy).toHaveBeenCalled()
    expect(pushStateSpy).not.toHaveBeenCalled()
    expect(drillthroughReport).toHaveBeenCalledWith('session-1', '/Sales/Child', [
      { name: 'Region', values: ['North'] },
    ])

    expect(screen.queryByRole('region', { name: 'Report Parameters' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show parameters' }))

    const parameters = await screen.findByRole('region', { name: 'Report Parameters' })
    await waitFor(() => {
      expect(within(parameters).getByLabelText(/Region/i)).toHaveValue('North')
    })
  })
})

describe('Document Map Visibility Preference round-trip', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState({}, '', '/?path=%2FReports%2FDemo')

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'Healthy' }),
      }),
    )

    vi.mocked(fetchParameters).mockReset().mockResolvedValue({
      path: '/Reports/Demo',
      parameters: [
        {
          name: 'Region',
          dataType: 'String',
          nullable: false,
          multiValue: false,
          required: true,
          prompt: 'Region',
          defaultValues: ['North'],
          validValues: [
            { label: 'North', value: 'North' },
            { label: 'South', value: 'South' },
          ],
          dependencies: [],
        },
      ],
    })

    vi.mocked(viewReport).mockReset().mockImplementation(async (_path, _params, documentMapVisible) => ({
      ...renderResult,
      documentMapVisible: documentMapVisible ?? true,
    }))

    vi.mocked(setDocumentMapVisibility).mockReset().mockImplementation(async (_sessionId, visible) => ({
      ...renderResult,
      documentMapVisible: visible,
    }))
  })

  it('View Report omits a visibility seed when no preference exists (defaults visible)', async () => {
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('button', { name: 'View Report' })
    await user.click(screen.getByRole('button', { name: 'View Report' }))

    await screen.findByRole('toolbar', { name: 'Report Viewer toolbar' })
    expect(viewReport).toHaveBeenCalledWith('/Reports/Demo', expect.any(Array), undefined)
    expect(screen.getByRole('navigation', { name: 'Document Map' })).toBeInTheDocument()
  })

  it('View Report seeds Viewer Session from a stored hidden preference', async () => {
    writeDocumentMapVisibilityPreference('/Reports/Demo', false)

    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('button', { name: 'View Report' })
    await user.click(screen.getByRole('button', { name: 'View Report' }))

    await waitFor(() => {
      expect(viewReport).toHaveBeenCalledWith('/Reports/Demo', expect.any(Array), false)
    })
    expect(screen.queryByRole('navigation', { name: 'Document Map' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show Document Map' })).toBeInTheDocument()
  })

  it('successful toolbar toggle writes the preference for the Report path', async () => {
    const user = await openReportChrome()

    await user.click(screen.getByRole('button', { name: 'Hide Document Map' }))

    await waitFor(() => {
      expect(setDocumentMapVisibility).toHaveBeenCalledWith('session-1', false)
    })
    expect(screen.queryByRole('navigation', { name: 'Document Map' })).not.toBeInTheDocument()

    // Simulate session loss / reload: remount App and View Report again.
    cleanup()
    vi.mocked(viewReport).mockClear()
    vi.mocked(viewReport).mockImplementation(async (_path, _params, documentMapVisible) => ({
      ...renderResult,
      sessionId: 'session-2',
      documentMapVisible: documentMapVisible ?? true,
    }))

    const userAfterReload = userEvent.setup()
    render(<App />)

    await screen.findByRole('button', { name: 'View Report' })
    await userAfterReload.click(screen.getByRole('button', { name: 'View Report' }))

    await waitFor(() => {
      expect(viewReport).toHaveBeenCalledWith('/Reports/Demo', expect.any(Array), false)
    })
    expect(screen.queryByRole('navigation', { name: 'Document Map' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show Document Map' })).toBeInTheDocument()
  })

  it('does not apply another Report path preference when Viewing Report', async () => {
    writeDocumentMapVisibilityPreference('/Reports/Other', false)

    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('button', { name: 'View Report' })
    await user.click(screen.getByRole('button', { name: 'View Report' }))

    await screen.findByRole('toolbar', { name: 'Report Viewer toolbar' })
    expect(viewReport).toHaveBeenCalledWith('/Reports/Demo', expect.any(Array), undefined)
    expect(screen.getByRole('navigation', { name: 'Document Map' })).toBeInTheDocument()
  })
})

