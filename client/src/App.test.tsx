import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { fetchParameters, viewReport } from './reportApi'

vi.mock('./reportApi', async () => {
  const actual = await vi.importActual<typeof import('./reportApi')>('./reportApi')
  return {
    ...actual,
    fetchParameters: vi.fn(),
    viewReport: vi.fn(),
    setZoom: vi.fn(),
    setReportPage: vi.fn(),
    refreshReport: vi.fn(),
    downloadExport: vi.fn(),
    findInReport: vi.fn(),
    findNextInReport: vi.fn(),
    goBack: vi.fn(),
    navigateDocumentMap: vi.fn(),
  }
})

vi.mock('./CatalogBrowser', () => ({
  CatalogBrowser: () => <div>Catalog browser</div>,
}))

const renderResult = {
  sessionId: 'session-1',
  html: '<div class="report-body">Report HTML</div>',
  pageInfo: { currentPage: 1, pageCount: 3 },
  zoomPercent: 100,
  documentMap: [{ id: 'n1', label: 'Section A', children: [] }],
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
  })

  it('places the Report Parameter strip above the unified toolbar in report mode', async () => {
    await openReportChrome()

    const shell = screen.getByRole('main')
    expect(shell).toHaveClass('shell-report')

    const parameters = screen.getByRole('region', { name: 'Report Parameters' })
    const toolbar = screen.getByRole('toolbar', { name: 'Report Viewer toolbar' })

    const position = parameters.compareDocumentPosition(toolbar)
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps Return to Catalog and Document Map available when a Report is open', async () => {
    await openReportChrome()

    expect(screen.getByRole('button', { name: 'Return to Catalog' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Document Map' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Section A' })).toBeInTheDocument()
  })

  it('tones down shell marketing chrome so parameter strip and toolbar lead the viewport', async () => {
    await openReportChrome()

    const shell = screen.getByRole('main')
    expect(shell).toHaveClass('shell-report')

    const title = within(shell).getByRole('heading', { name: 'SSRS Report Viewer', level: 1 })
    expect(title).toHaveClass('shell-title-quiet')

    const lede = shell.querySelector('.lede')
    expect(lede).toHaveClass('shell-lede-quiet')

    const status = screen.getByRole('status', { name: '' })
    // API health status remains in the tree for assistive tech / diagnostics.
    expect(status).toHaveClass('shell-status-quiet')
  })

  it('shows NULL beside nullable controls and a DateTime calendar field in the strip', async () => {
    render(<App />)

    const parameters = await screen.findByRole('region', { name: 'Report Parameters' })
    const startDateField = within(parameters).getByLabelText(/Start Date/i)
    expect(startDateField).toHaveAttribute('type', 'date')

    const nullCheckbox = within(parameters).getByRole('checkbox', { name: 'NULL' })
    const field = startDateField.closest('.parameter-field')
    expect(field).not.toBeNull()
    expect(field!.compareDocumentPosition(nullCheckbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(field!.querySelector('.parameter-control-row')).toContainElement(nullCheckbox)
  })

  it('keeps View Report with the parameter strip', async () => {
    render(<App />)

    const parameters = await screen.findByRole('region', { name: 'Report Parameters' })
    expect(within(parameters).getByRole('button', { name: 'View Report' })).toBeInTheDocument()
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
})
