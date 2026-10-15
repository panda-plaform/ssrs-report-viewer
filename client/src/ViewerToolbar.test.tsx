import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  downloadExport,
  findInReport,
  findNextInReport,
  goBack,
  setReportPage,
} from './reportApi'
import { ViewerToolbar } from './ViewerToolbar'

vi.mock('./reportApi', () => ({
  setZoom: vi.fn(),
  setReportPage: vi.fn(),
  refreshReport: vi.fn(),
  downloadExport: vi.fn(),
  findInReport: vi.fn(),
  findNextInReport: vi.fn(),
  goBack: vi.fn(),
}))

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
    vi.mocked(setReportPage).mockReset().mockResolvedValue(pageResult)
    vi.mocked(downloadExport).mockReset().mockResolvedValue(undefined)
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

  it('calls goBack when Back is enabled', async () => {
    const user = userEvent.setup()
    const { onUpdated } = renderToolbar({ canGoBack: true })

    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(goBack).toHaveBeenCalledWith('session-1')
    expect(onUpdated).toHaveBeenCalled()
  })

  it('calls downloadExport from the Export menu for PDF, Excel, and CSV', async () => {
    const user = userEvent.setup()
    renderToolbar()

    await user.click(screen.getByRole('button', { name: 'Export' }))
    await user.click(screen.getByRole('menuitem', { name: 'PDF' }))
    expect(downloadExport).toHaveBeenCalledWith('session-1', 'PDF')

    await user.click(screen.getByRole('button', { name: 'Export' }))
    await user.click(screen.getByRole('menuitem', { name: 'Excel' }))
    expect(downloadExport).toHaveBeenCalledWith('session-1', 'EXCELOPENXML')

    await user.click(screen.getByRole('button', { name: 'Export' }))
    await user.click(screen.getByRole('menuitem', { name: 'CSV' }))
    expect(downloadExport).toHaveBeenCalledWith('session-1', 'CSV')
  })

  it('calls findInReport and findNextInReport from the toolbar Find icon controls', async () => {
    const user = userEvent.setup()
    const { onFindResult } = renderToolbar()

    const findField = screen.getByRole('searchbox', { name: 'Find' })
    await user.type(findField, 'revenue')
    await user.click(screen.getByRole('button', { name: 'Find' }))

    expect(findInReport).toHaveBeenCalledWith('session-1', 'revenue')
    expect(onFindResult).toHaveBeenCalledWith(
      expect.objectContaining({ found: true, pageInfo: { currentPage: 3, pageCount: 5 } }),
    )

    await user.click(screen.getByRole('button', { name: 'Find next' }))
    expect(findNextInReport).toHaveBeenCalledWith('session-1', 'revenue')
  })

  it('toggles Maximize via onMaximizedChange', async () => {
    const user = userEvent.setup()
    const { onMaximizedChange } = renderToolbar({ maximized: false })

    await user.click(screen.getByRole('button', { name: 'Maximize' }))
    expect(onMaximizedChange).toHaveBeenCalledWith(true)
  })

  it('shows Restore when maximized', () => {
    renderToolbar({ maximized: true })
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Maximize' })).not.toBeInTheDocument()
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
