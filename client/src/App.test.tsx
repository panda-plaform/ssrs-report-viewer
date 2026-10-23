import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { findInReport } from './features/find/findApi'
import { drillthroughReport, goBack } from './features/drillthrough/drillthroughApi'
import { setDocumentMapVisibility } from './features/document-map/documentMapApi'
import { writeDocumentMapVisibilityPreference } from './features/document-map/documentMapVisibilityPreference'
import { fetchParameters, viewReport } from './features/view-report/viewReportApi'

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
    expect(layout).toHaveAttribute('data-has-document-map', 'true')
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
    expect(layout).toHaveAttribute('data-has-document-map', 'false')
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
    expect(layout).toHaveAttribute('data-has-document-map', 'false')
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
    expect(document.querySelector('.viewer-layout')).toHaveAttribute('data-has-document-map', 'false')
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
    expect(document.querySelector('.viewer-layout')).toHaveAttribute('data-has-document-map', 'true')
    expect(screen.getByRole('button', { name: 'Hide Document Map' })).toBeInTheDocument()
  })

  it('tones down shell marketing chrome so toolbar and report lead after View Report', async () => {
    await openReportChrome()

    const shell = screen.getByRole('main')
    expect(shell).toHaveClass('shell-report')

    const title = within(shell).getByRole('heading', { name: 'SSRS Report Viewer', level: 1 })
    expect(title).toHaveClass('visually-hidden')

    const lede = shell.querySelector('.lede')
    expect(lede).toHaveClass('visually-hidden')

    const status = within(shell).getByText(/API Healthy/i)
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

  it('enters fullscreen on Maximize and hides parameters / Document Map until Restore', async () => {
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
    expect(screen.queryByRole('navigation', { name: 'Document Map' })).not.toBeInTheDocument()
    expect(document.querySelector('.viewer-layout')).toHaveAttribute('data-has-document-map', 'false')

    await user.click(screen.getByRole('button', { name: 'Restore' }))

    expect(document.fullscreenElement).toBeNull()
    expect(screen.getByRole('main')).not.toHaveClass('shell-maximized')
    expect(screen.getByRole('button', { name: 'Return to Catalog' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Report Parameters' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Document Map' })).toBeInTheDocument()
  })

  it('restores session Document Map Visibility after leaving maximize when the pane was hidden', async () => {
    vi.mocked(viewReport).mockResolvedValueOnce({
      ...renderResult,
      documentMapVisible: false,
    })
    const user = await openReportChrome()

    expect(screen.queryByRole('navigation', { name: 'Document Map' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show Document Map' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Maximize' }))
    expect(screen.queryByRole('navigation', { name: 'Document Map' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Restore' }))

    expect(screen.queryByRole('navigation', { name: 'Document Map' })).not.toBeInTheDocument()
    expect(document.querySelector('.viewer-layout')).toHaveAttribute('data-has-document-map', 'false')
    expect(screen.getByRole('button', { name: 'Show Document Map' })).toBeInTheDocument()
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
    expect(viewReport).toHaveBeenCalledWith('/Reports/Demo', expect.any(Array))
    expect(viewReport.mock.calls[0]?.length).toBe(2)
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
    expect(viewReport).toHaveBeenCalledWith('/Reports/Demo', expect.any(Array))
    expect(viewReport.mock.calls[0]?.length).toBe(2)
    expect(screen.getByRole('navigation', { name: 'Document Map' })).toBeInTheDocument()
  })
})

