import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findInReport, findNextInReport } from '../find/findApi'
import {
  downloadExport,
  fetchExportPdf,
  printPdfBlob,
} from '../export-print/exportApi'
import { goBack } from '../../reportApi'
import { ViewerToolbar } from './ViewerToolbar'
import { refreshReport, setReportPage, setZoom } from './zoomPageApi'

vi.mock('../find/findApi', () => ({
  findInReport: vi.fn(),
  findNextInReport: vi.fn(),
}))

vi.mock('../export-print/exportApi', async () => {
  const actual = await vi.importActual<typeof import('../export-print/exportApi')>(
    '../export-print/exportApi',
  )
  return {
    ...actual,
    downloadExport: vi.fn(),
    fetchExportPdf: vi.fn(),
    printPdfBlob: vi.fn(),
  }
})

vi.mock('../../reportApi', () => ({
  goBack: vi.fn(),
}))

vi.mock('./zoomPageApi', () => ({
  setZoom: vi.fn(),
  setReportPage: vi.fn(),
  refreshReport: vi.fn(),
}))

const pdfBlob = new Blob(['%PDF'], { type: 'application/pdf' })

const pageResult = {
  sessionId: 'session-1',
  html: '<div>page</div>',
  pageInfo: { currentPage: 2, pageCount: 5 },
  zoomPercent: 100,
  documentMap: null,
  canGoBack: false,
  reportPath: '/Reports/Demo',
  parameters: [],
}

function renderToolbar(
  overrides: Partial<{
    pageInfo: { currentPage: number; pageCount: number }
    canGoBack: boolean
    busy: boolean
    maximized: boolean
  }> = {},
) {
  const onUpdated = vi.fn()
  const onFindResult = vi.fn()
  const onError = vi.fn()
  const onBusyChange = vi.fn()
  const onMaximizedChange = vi.fn()

  render(
    <ViewerToolbar
      sessionId="session-1"
      pageInfo={overrides.pageInfo ?? { currentPage: 2, pageCount: 5 }}
      zoomPercent={100}
      busy={overrides.busy ?? false}
      canGoBack={overrides.canGoBack ?? false}
      maximized={overrides.maximized ?? false}
      onMaximizedChange={onMaximizedChange}
      onUpdated={onUpdated}
      onFindResult={onFindResult}
      onError={onError}
      onBusyChange={onBusyChange}
    />,
  )

  return { onUpdated, onFindResult, onError, onBusyChange, onMaximizedChange }
}

describe('ViewerToolbar native chrome', () => {
  beforeEach(() => {
    vi.mocked(setZoom).mockReset().mockResolvedValue({ ...pageResult, zoomPercent: 25 })
    vi.mocked(setReportPage).mockReset().mockResolvedValue(pageResult)
    vi.mocked(refreshReport).mockReset().mockResolvedValue(pageResult)
    vi.mocked(downloadExport).mockReset().mockResolvedValue(undefined)
    vi.mocked(fetchExportPdf).mockReset().mockResolvedValue(pdfBlob)
    vi.mocked(printPdfBlob).mockReset().mockResolvedValue(undefined)
    vi.mocked(findInReport).mockReset().mockResolvedValue({
      html: '<div>found</div>',
      found: true,
      pageInfo: { currentPage: 3, pageCount: 5 },
    })
    vi.mocked(findNextInReport).mockReset().mockResolvedValue({
      html: '<div>next</div>',
      found: true,
      pageInfo: { currentPage: 4, pageCount: 5 },
    })
    vi.mocked(goBack).mockReset().mockResolvedValue({ ...pageResult, canGoBack: true })
  })

  it('exposes Report Page, Refresh, Back, Zoom, Export, Print, Find, and Maximize in one toolbar', () => {
    renderToolbar()

    const toolbar = screen.getByRole('toolbar', { name: 'Report Viewer toolbar' })
    expect(toolbar).toBeInTheDocument()

    const pageGroup = within(toolbar).getByRole('group', { name: 'Report Page' })
    expect(within(pageGroup).getByRole('button', { name: 'First' })).toBeInTheDocument()
    expect(within(pageGroup).getByRole('button', { name: 'Previous' })).toBeInTheDocument()
    expect(within(pageGroup).getByRole('spinbutton', { name: 'Report Page' })).toBeInTheDocument()
    const pageCount = within(pageGroup).getByText(/of\s*5/i)
    expect(pageCount).toBeInTheDocument()
    expect(pageCount).not.toHaveAttribute('aria-hidden', 'true')
    expect(within(pageGroup).getByRole('button', { name: 'Next' })).toBeInTheDocument()
    expect(within(pageGroup).getByRole('button', { name: 'Last' })).toBeInTheDocument()

    expect(within(toolbar).getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
    expect(within(toolbar).getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(within(toolbar).getByRole('combobox', { name: 'Zoom' })).toBeInTheDocument()
    expect(within(toolbar).getByRole('button', { name: 'Export' })).toBeInTheDocument()
    expect(within(toolbar).getByRole('button', { name: 'Print' })).toBeInTheDocument()
    expect(within(toolbar).getByRole('searchbox', { name: 'Find' })).toBeInTheDocument()
    expect(within(toolbar).getByRole('button', { name: 'Find' })).toBeInTheDocument()
    expect(within(toolbar).getByRole('button', { name: 'Find next' })).toBeInTheDocument()
    expect(within(toolbar).getByRole('button', { name: 'Maximize' })).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: 'PDF' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).toBe(
      within(pageGroup).getByRole('button', { name: 'Next' }),
    )
    expect(screen.queryByRole('heading', { name: 'Find' })).not.toBeInTheDocument()
  })

  it('lists native SSRS percent Zoom options in order', () => {
    renderToolbar()

    const zoom = screen.getByRole('combobox', { name: 'Zoom' })
    const labels = within(zoom)
      .getAllByRole('option')
      .map((option) => option.textContent)

    expect(labels).toEqual(['500%', '200%', '150%', '100%', '75%', '50%', '25%', '10%'])
    expect(labels).not.toContain('125%')
    expect(labels).not.toContain('Page Width')
    expect(labels).not.toContain('Whole Page')
  })

  it('calls setZoom when a Zoom percent is selected', async () => {
    const user = userEvent.setup()
    const { onUpdated } = renderToolbar()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Zoom' }), '25')

    expect(setZoom).toHaveBeenCalledWith('session-1', 25)
    expect(onUpdated).toHaveBeenCalled()
  })

  it('places Refresh before Back in the toolbar', () => {
    renderToolbar()
    const toolbar = screen.getByRole('toolbar', { name: 'Report Viewer toolbar' })
    const refresh = within(toolbar).getByRole('button', { name: 'Refresh' })
    const back = within(toolbar).getByRole('button', { name: 'Back' })
    expect(refresh.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('disables Back when canGoBack is false', () => {
    renderToolbar({ canGoBack: false })
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
  })

  it('calls goBack when Back is enabled and requests open-report sync', async () => {
    const user = userEvent.setup()
    const parentResult = {
      ...pageResult,
      canGoBack: false,
      reportPath: '/Sales/Parent',
      parameters: [{ name: 'Region', values: ['West'] }],
      html: '<div>Parent</div>',
    }
    vi.mocked(goBack).mockResolvedValueOnce(parentResult)
    const { onUpdated } = renderToolbar({ canGoBack: true })

    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(goBack).toHaveBeenCalledWith('session-1')
    expect(onUpdated).toHaveBeenCalledWith(parentResult, { syncOpenReport: true })
  })

  it('does not call goBack while busy even when canGoBack is true', async () => {
    const user = userEvent.setup()
    renderToolbar({ canGoBack: true, busy: true })

    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(goBack).not.toHaveBeenCalled()
  })

  it('does not double-submit Back while a request is in flight', async () => {
    let resolveBack: ((value: typeof pageResult) => void) | undefined
    vi.mocked(goBack).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveBack = resolve
        }),
    )

    const user = userEvent.setup()
    const { onUpdated } = renderToolbar({ canGoBack: true })

    await user.click(screen.getByRole('button', { name: 'Back' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(goBack).toHaveBeenCalledTimes(1)

    const parentResult = { ...pageResult, canGoBack: false, html: '<div>Parent</div>' }
    resolveBack?.(parentResult)
    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalledWith(parentResult, { syncOpenReport: true })
    })
  })

  it('lists native Export formats in native order', async () => {
    const user = userEvent.setup()
    renderToolbar()

    await user.click(screen.getByRole('button', { name: 'Export' }))
    const menu = screen.getByRole('menu', { name: 'Export formats' })
    const labels = within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent)

    expect(labels).toEqual([
      'Word',
      'Excel',
      'PowerPoint',
      'PDF',
      'Accessible PDF',
      'TIFF file',
      'MHTML (web archive)',
      'CSV (comma delimited)',
      'XML file with report data',
    ])
  })

  it('marks the toolbar so the Export menu can paint over the report', async () => {
    const user = userEvent.setup()
    renderToolbar()

    const toolbar = screen.getByRole('toolbar', { name: 'Report Viewer toolbar' })
    expect(toolbar).not.toHaveClass('viewer-toolbar-export-open')

    await user.click(screen.getByRole('button', { name: 'Export' }))
    expect(toolbar).toHaveClass('viewer-toolbar-export-open')
    expect(screen.getByRole('menu', { name: 'Export formats' })).toBeInTheDocument()
  })

  it('renders Export formats as contiguous menuitems with native chrome', async () => {
    const user = userEvent.setup()
    renderToolbar()

    await user.click(screen.getByRole('button', { name: 'Export' }))
    const menu = screen.getByRole('menu', { name: 'Export formats' })

    expect(within(menu).queryAllByRole('separator')).toHaveLength(0)
    expect([...menu.children].every((el) => el.getAttribute('role') === 'menuitem')).toBe(true)
  })

  it('calls downloadExport from the Export menu for each native format', async () => {
    const user = userEvent.setup()
    renderToolbar()

    const cases: [string, string][] = [
      ['Word', 'WORDOPENXML'],
      ['Excel', 'EXCELOPENXML'],
      ['PowerPoint', 'PPTX'],
      ['PDF', 'PDF'],
      ['Accessible PDF', 'ACCESSIBLEPDF'],
      ['TIFF file', 'TIFF'],
      ['MHTML (web archive)', 'MHTML'],
      ['CSV (comma delimited)', 'CSV'],
      ['XML file with report data', 'XML'],
    ]

    for (const [label, format] of cases) {
      await user.click(screen.getByRole('button', { name: 'Export' }))
      await user.click(screen.getByRole('menuitem', { name: label }))
      expect(downloadExport).toHaveBeenCalledWith('session-1', format)
    }
  })

  it('surfaces Export errors without losing the Viewer Session toolbar', async () => {
    const user = userEvent.setup()
    vi.mocked(downloadExport).mockRejectedValueOnce(new Error('Unsupported Export format'))
    const { onError } = renderToolbar()

    await user.click(screen.getByRole('button', { name: 'Export' }))
    await user.click(screen.getByRole('menuitem', { name: 'Word' }))

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Unsupported Export format' }))
    })
    expect(screen.getByRole('toolbar', { name: 'Report Viewer toolbar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled()
  })

  it('opens a Print settings dialog without fetching or downloading a PDF', async () => {
    const user = userEvent.setup()
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    renderToolbar()

    await user.click(screen.getByRole('button', { name: 'Print' }))

    const dialog = screen.getByRole('dialog', { name: 'Print' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText(/printer-friendly PDF/i)).toBeInTheDocument()
    expect(within(dialog).getByRole('combobox', { name: 'Page size' })).toHaveValue('A3')
    expect(within(dialog).getByRole('combobox', { name: 'Page orientation' })).toHaveValue(
      'Landscape',
    )
    expect(within(dialog).getByRole('button', { name: 'Print' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(printSpy).not.toHaveBeenCalled()
    expect(downloadExport).not.toHaveBeenCalled()
    expect(fetchExportPdf).not.toHaveBeenCalled()
    expect(printPdfBlob).not.toHaveBeenCalled()
    printSpy.mockRestore()
  })

  it('does not print a PDF when Print Cancel or Close is used', async () => {
    const user = userEvent.setup()
    renderToolbar()

    await user.click(screen.getByRole('button', { name: 'Print' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Print' })).not.toBeInTheDocument()
    expect(fetchExportPdf).not.toHaveBeenCalled()
    expect(printPdfBlob).not.toHaveBeenCalled()
    expect(downloadExport).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Print' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Print' })).not.toBeInTheDocument()
    expect(fetchExportPdf).not.toHaveBeenCalled()
    expect(printPdfBlob).not.toHaveBeenCalled()
    expect(downloadExport).not.toHaveBeenCalled()
  })

  it('dismisses Print settings with Escape without printing', async () => {
    const user = userEvent.setup()
    renderToolbar()

    await user.click(screen.getByRole('button', { name: 'Print' }))
    expect(screen.getByRole('dialog', { name: 'Print' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Print' })).not.toBeInTheDocument()
    expect(fetchExportPdf).not.toHaveBeenCalled()
    expect(printPdfBlob).not.toHaveBeenCalled()
    expect(downloadExport).not.toHaveBeenCalled()
  })

  it('moves focus into the Print dialog when opened', async () => {
    const user = userEvent.setup()
    renderToolbar()

    await user.click(screen.getByRole('button', { name: 'Print' }))
    const dialog = screen.getByRole('dialog', { name: 'Print' })
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('shows Printing… and disables Print dialog controls while PDF fetch is in flight', async () => {
    let resolveFetch!: (blob: Blob) => void
    vi.mocked(fetchExportPdf).mockImplementationOnce(
      () =>
        new Promise<Blob>((resolve) => {
          resolveFetch = resolve
        }),
    )
    const user = userEvent.setup()
    renderToolbar()

    await user.click(screen.getByRole('button', { name: 'Print' }))
    const dialog = screen.getByRole('dialog', { name: 'Print' })
    await user.click(within(dialog).getByRole('button', { name: 'Print' }))

    expect(within(dialog).getByRole('button', { name: 'Printing…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled()
    expect(within(dialog).getByRole('combobox', { name: 'Page size' })).toBeDisabled()
    expect(within(dialog).getByRole('combobox', { name: 'Page orientation' })).toBeDisabled()
    expect(dialog).toHaveAttribute('aria-busy', 'true')

    resolveFetch(pdfBlob)
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Print' })).not.toBeInTheDocument()
    })
    expect(printPdfBlob).toHaveBeenCalledWith(pdfBlob)
  })

  it('dismisses Print dialog with Escape while fetch is in flight without starting another PDF', async () => {
    let resolveFetch!: (blob: Blob) => void
    vi.mocked(fetchExportPdf).mockImplementationOnce(
      () =>
        new Promise<Blob>((resolve) => {
          resolveFetch = resolve
        }),
    )
    const user = userEvent.setup()
    renderToolbar()

    await user.click(screen.getByRole('button', { name: 'Print' }))
    const dialog = screen.getByRole('dialog', { name: 'Print' })
    await user.click(within(dialog).getByRole('button', { name: 'Print' }))
    expect(within(dialog).getByRole('button', { name: 'Printing…' })).toBeDisabled()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Print' })).not.toBeInTheDocument()
    expect(fetchExportPdf).toHaveBeenCalledTimes(1)

    resolveFetch(pdfBlob)
    await waitFor(() => {
      expect(printPdfBlob).toHaveBeenCalledTimes(1)
    })
    expect(fetchExportPdf).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: 'Print' })).not.toBeInTheDocument()
  })

  it('confirms Print by fetching a PDF with settings and opening the print dialog (no download)', async () => {
    const user = userEvent.setup()
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    renderToolbar()

    await user.click(screen.getByRole('button', { name: 'Print' }))
    const dialog = screen.getByRole('dialog', { name: 'Print' })
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Page size' }), 'A4')
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Page orientation' }),
      'Portrait',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Print' }))

    await waitFor(() => {
      expect(fetchExportPdf).toHaveBeenCalledWith('session-1', {
        pageSize: 'A4',
        orientation: 'Portrait',
      })
    })
    expect(printPdfBlob).toHaveBeenCalledWith(pdfBlob)
    expect(downloadExport).not.toHaveBeenCalled()
    expect(printSpy).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Print' })).not.toBeInTheDocument()
    printSpy.mockRestore()
  })

  it('surfaces Print fetch errors and keeps Export free of the Print dialog', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchExportPdf).mockRejectedValueOnce(new Error('Print PDF failed'))
    const { onError } = renderToolbar()

    await user.click(screen.getByRole('button', { name: 'Print' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Print' })).getByRole('button', { name: 'Print' }),
    )

    await waitFor(() => {
      expect(onError).toHaveBeenCalled()
    })
    expect(fetchExportPdf).toHaveBeenCalledTimes(1)
    expect(printPdfBlob).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Print' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Export' }))
    await user.click(screen.getByRole('menuitem', { name: 'PDF' }))
    expect(downloadExport).toHaveBeenLastCalledWith('session-1', 'PDF')
    expect(screen.queryByRole('dialog', { name: 'Print' })).not.toBeInTheDocument()
  })

  it('enters browser fullscreen when Maximize is clicked', async () => {
    const user = userEvent.setup()
    const { onMaximizedChange } = renderToolbar({ maximized: false })

    await user.click(screen.getByRole('button', { name: 'Maximize' }))
    expect(document.fullscreenElement).toBe(document.documentElement)
    expect(onMaximizedChange).toHaveBeenCalledWith(true)
  })

  it('exits browser fullscreen when Restore is clicked', async () => {
    const user = userEvent.setup()
    await document.documentElement.requestFullscreen()
    renderToolbar({ maximized: true })

    await user.click(screen.getByRole('button', { name: 'Restore' }))
    expect(document.fullscreenElement).toBeNull()
  })

  it('shows Restore when maximized', () => {
    renderToolbar({ maximized: true })
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Maximize' })).not.toBeInTheDocument()
  })

  it('places Maximize after the toolbar spacer on the far right', () => {
    renderToolbar()
    const toolbar = screen.getByRole('toolbar', { name: 'Report Viewer toolbar' })
    const spacer = toolbar.querySelector('.viewer-toolbar-spacer')
    const maximize = within(toolbar).getByRole('button', { name: 'Maximize' })
    expect(spacer).not.toBeNull()
    expect(spacer!.compareDocumentPosition(maximize) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('changes Report Page via First and Last using goto at boundaries', async () => {
    const user = userEvent.setup()
    renderToolbar({ pageInfo: { currentPage: 3, pageCount: 5 } })

    await user.click(screen.getByRole('button', { name: 'First' }))
    expect(setReportPage).toHaveBeenCalledWith('session-1', 'goto', 1)

    await user.click(screen.getByRole('button', { name: 'Last' }))
    expect(setReportPage).toHaveBeenCalledWith('session-1', 'goto', 5)
  })

  it('disables First/Previous on the first page and Next/Last on the last page', () => {
    const { unmount } = render(
      <ViewerToolbar
        sessionId="session-1"
        pageInfo={{ currentPage: 1, pageCount: 5 }}
        zoomPercent={100}
        busy={false}
        canGoBack={false}
        maximized={false}
        onMaximizedChange={() => {}}
        onUpdated={() => {}}
        onFindResult={() => {}}
        onError={() => {}}
        onBusyChange={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'First' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Last' })).toBeEnabled()
    unmount()

    render(
      <ViewerToolbar
        sessionId="session-1"
        pageInfo={{ currentPage: 5, pageCount: 5 }}
        zoomPercent={100}
        busy={false}
        canGoBack={false}
        maximized={false}
        onMaximizedChange={() => {}}
        onUpdated={() => {}}
        onFindResult={() => {}}
        onError={() => {}}
        onBusyChange={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'First' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Last' })).toBeDisabled()
  })

  it('does not show Viewer Session id as primary chrome', () => {
    renderToolbar()
    expect(screen.queryByLabelText('Viewer Session id')).not.toBeInTheDocument()
    expect(screen.queryByText(/Viewer Session/i)).not.toBeInTheDocument()
  })
})
