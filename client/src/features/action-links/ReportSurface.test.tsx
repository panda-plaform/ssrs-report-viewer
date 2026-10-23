import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { drillthroughReport } from '../drillthrough/drillthroughApi'
import { sortReport, toggleDrilldown } from './actionLinksApi'
import { ReportSurface } from './ReportSurface'

vi.mock('../drillthrough/drillthroughApi', () => ({
  drillthroughReport: vi.fn(),
}))

vi.mock('./actionLinksApi', () => ({
  toggleDrilldown: vi.fn(),
  sortReport: vi.fn(),
  navigateBookmark: vi.fn(),
}))

const childResult = {
  sessionId: 'session-1',
  html: '<div>Child report</div>',
  pageInfo: { currentPage: 1, pageCount: 1 },
  zoomPercent: 100,
  documentMap: null,
  documentMapVisible: true,
  canGoBack: true,
  reportPath: '/Sales/Child',
  parameters: [{ name: 'Region', values: ['North'] }],
}

const sortedResult = {
  sessionId: 'session-1',
  html: '<div>Sorted Ascending</div>',
  pageInfo: { currentPage: 1, pageCount: 1 },
  zoomPercent: 100,
  documentMap: null,
  documentMapVisible: true,
  canGoBack: false,
  reportPath: '/Sales/Revenue',
  parameters: [],
}

function renderSurface(overrides: {
  html?: string
  busy?: boolean
} = {}) {
  const onHtmlReplaced = vi.fn()
  const onError = vi.fn()
  const onBusyChange = vi.fn()

  render(
    <ReportSurface
      html={
        overrides.html ??
        `<div>
          <a href="#" data-ssrs-action="drillthrough" data-ssrs-report-path="/Sales/Child" data-ssrs-parameters='[{"name":"Region","values":["North"]}]'>Open child</a>
          <a href="#" data-ssrs-action="drilldown" data-ssrs-toggle-id="tog1">Toggle</a>
        </div>`
      }
      sessionId="session-1"
      pageInfo={{ currentPage: 1, pageCount: 1 }}
      busy={overrides.busy ?? false}
      error={null}
      onHtmlReplaced={onHtmlReplaced}
      onError={onError}
      onBusyChange={onBusyChange}
    />,
  )

  return { onHtmlReplaced, onError, onBusyChange }
}

describe('ReportSurface Action Links', () => {
  beforeEach(() => {
    vi.mocked(drillthroughReport).mockReset().mockResolvedValue(childResult)
    vi.mocked(toggleDrilldown).mockReset().mockResolvedValue({
      ...childResult,
      canGoBack: false,
      reportPath: '/Sales/Parent',
      html: '<div>Parent toggled</div>',
      parameters: [],
    })
    vi.mocked(sortReport).mockReset().mockResolvedValue(sortedResult)
  })

  it('calls Drillthrough session API and requests open-report sync', async () => {
    const user = userEvent.setup()
    const { onHtmlReplaced, onBusyChange } = renderSurface()

    await user.click(screen.getByRole('link', { name: 'Open child' }))

    await waitFor(() => {
      expect(drillthroughReport).toHaveBeenCalledWith('session-1', '/Sales/Child', [
        { name: 'Region', values: ['North'] },
      ])
    })
    expect(onHtmlReplaced).toHaveBeenCalledWith(childResult, {
      syncOpenReport: true,
      collapseParameters: true,
    })
    expect(onBusyChange).toHaveBeenCalledWith(true)
    expect(onBusyChange).toHaveBeenCalledWith(false)
  })

  it('surfaces invalid Drillthrough parameters without navigating', async () => {
    const user = userEvent.setup()
    const { onHtmlReplaced, onError } = renderSurface({
      html: `<a href="#" data-ssrs-action="drillthrough" data-ssrs-report-path="/Sales/Child" data-ssrs-parameters="{not-json">Bad link</a>`,
    })

    await user.click(screen.getByRole('link', { name: 'Bad link' }))

    expect(onError).toHaveBeenCalledWith('Invalid Drillthrough parameters on Action Link')
    expect(drillthroughReport).not.toHaveBeenCalled()
    expect(onHtmlReplaced).not.toHaveBeenCalled()
  })

  it('keeps Drilldown toggles distinct from Drillthrough', async () => {
    const user = userEvent.setup()
    const { onHtmlReplaced, onError } = renderSurface()

    await user.click(screen.getByRole('link', { name: 'Toggle' }))

    await waitFor(() => {
      expect(toggleDrilldown).toHaveBeenCalledWith('session-1', 'tog1')
    })
    expect(drillthroughReport).not.toHaveBeenCalled()
    expect(onHtmlReplaced).toHaveBeenCalledWith(
      expect.objectContaining({ reportPath: '/Sales/Parent' }),
      undefined,
    )
    expect(onError).not.toHaveBeenCalled()
  })

  it('Drilldown via toggle icon replaces Execution HTML', async () => {
    // Data Sources chrome: plus/minus img inside the Drilldown Action Link.
    const user = userEvent.setup()
    const { onHtmlReplaced } = renderSurface({
      html: `<div>
        <a href="#" data-ssrs-action="drilldown" data-ssrs-toggle-id="32iT0">
          <img class="ssrs-toggle-icon" alt="+" title="+" width="9" height="9" />
        </a>
        <span>/Data Sources/ReportServer</span>
      </div>`,
    })

    await user.click(screen.getByRole('img', { name: '+' }))

    await waitFor(() => {
      expect(toggleDrilldown).toHaveBeenCalledWith('session-1', '32iT0')
    })
    expect(onHtmlReplaced).toHaveBeenCalledWith(
      expect.objectContaining({ html: '<div>Parent toggled</div>' }),
      undefined,
    )
    expect(drillthroughReport).not.toHaveBeenCalled()
  })

  it('does not double-submit Drilldown while busy', async () => {
    const user = userEvent.setup()
    renderSurface({ busy: true })

    await user.click(screen.getByRole('link', { name: 'Toggle' }))

    expect(toggleDrilldown).not.toHaveBeenCalled()
  })

  it('does not double-submit Drilldown while a request is in flight', async () => {
    let resolveToggle: ((value: typeof childResult) => void) | undefined
    vi.mocked(toggleDrilldown).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveToggle = resolve
        }),
    )

    const user = userEvent.setup()
    const { onHtmlReplaced } = renderSurface()

    await user.click(screen.getByRole('link', { name: 'Toggle' }))
    await user.click(screen.getByRole('link', { name: 'Toggle' }))

    expect(toggleDrilldown).toHaveBeenCalledTimes(1)

    resolveToggle?.({
      ...childResult,
      canGoBack: false,
      reportPath: '/Sales/Parent',
      html: '<div>Parent toggled</div>',
      parameters: [],
    })
    await waitFor(() => {
      expect(onHtmlReplaced).toHaveBeenCalledWith(
        expect.objectContaining({ reportPath: '/Sales/Parent' }),
        undefined,
      )
    })
  })

  it('surfaces Drilldown API failures via onError', async () => {
    const user = userEvent.setup()
    vi.mocked(toggleDrilldown).mockRejectedValueOnce(new Error('session gone'))
    const { onHtmlReplaced, onError, onBusyChange } = renderSurface()

    await user.click(screen.getByRole('link', { name: 'Toggle' }))

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'session gone' }))
    })
    expect(onHtmlReplaced).not.toHaveBeenCalled()
    expect(onBusyChange).toHaveBeenCalledWith(true)
    expect(onBusyChange).toHaveBeenCalledWith(false)
  })

  it('surfaces an error when Drilldown Action Link is missing toggle id', async () => {
    const user = userEvent.setup()
    const { onHtmlReplaced, onError } = renderSurface({
      html: `<a href="#" data-ssrs-action="drilldown">Broken toggle</a>`,
    })

    await user.click(screen.getByRole('link', { name: 'Broken toggle' }))

    expect(onError).toHaveBeenCalledWith('Drilldown Action Link is missing toggle id')
    expect(toggleDrilldown).not.toHaveBeenCalled()
    expect(onHtmlReplaced).not.toHaveBeenCalled()
  })

  it('surfaces an error for unrewritten session-actions toggle hrefs', async () => {
    const user = userEvent.setup()
    const { onHtmlReplaced, onError } = renderSurface({
      html: `<a href="/api/sessions/session-1/actions/?/Example%20Reports/Data%20Sources&amp;rc:Toggle=32iT0">Unrewritten toggle</a>`,
    })

    await user.click(screen.getByRole('link', { name: 'Unrewritten toggle' }))

    expect(onError).toHaveBeenCalledWith('Unrewritten Drilldown toggle link')
    expect(toggleDrilldown).not.toHaveBeenCalled()
    expect(onHtmlReplaced).not.toHaveBeenCalled()
  })

  it('surfaces an error for unrewritten ReportServer toggle hrefs', async () => {
    const user = userEvent.setup()
    const { onHtmlReplaced, onError } = renderSurface({
      html: `<a href="http://ssrs/ReportServer?/Example%20Reports/Data%20Sources&amp;rc:Toggle=32iT0">ReportServer toggle</a>`,
    })

    await user.click(screen.getByRole('link', { name: 'ReportServer toggle' }))

    expect(onError).toHaveBeenCalledWith('Unrewritten Drilldown toggle link')
    expect(toggleDrilldown).not.toHaveBeenCalled()
    expect(onHtmlReplaced).not.toHaveBeenCalled()
  })

  it('blocks leftover non-toggle session action URLs without a Drilldown error', async () => {
    const user = userEvent.setup()
    const { onHtmlReplaced, onError } = renderSurface({
      html: `<a href="/api/sessions/session-1/actions/?/Sales/Child">Leftover action</a>`,
    })

    await user.click(screen.getByRole('link', { name: 'Leftover action' }))

    expect(onError).not.toHaveBeenCalled()
    expect(toggleDrilldown).not.toHaveBeenCalled()
    expect(onHtmlReplaced).not.toHaveBeenCalled()
  })

  it('does not double-submit Drillthrough while busy', async () => {
    const user = userEvent.setup()
    renderSurface({ busy: true })

    await user.click(screen.getByRole('link', { name: 'Open child' }))

    expect(drillthroughReport).not.toHaveBeenCalled()
  })

  it('does not double-submit Drillthrough while a request is in flight', async () => {
    let resolveDrill: ((value: typeof childResult) => void) | undefined
    vi.mocked(drillthroughReport).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDrill = resolve
        }),
    )

    const user = userEvent.setup()
    const { onHtmlReplaced } = renderSurface()

    await user.click(screen.getByRole('link', { name: 'Open child' }))
    await user.click(screen.getByRole('link', { name: 'Open child' }))

    expect(drillthroughReport).toHaveBeenCalledTimes(1)

    resolveDrill?.(childResult)
    await waitFor(() => {
      expect(onHtmlReplaced).toHaveBeenCalledWith(childResult, {
      syncOpenReport: true,
      collapseParameters: true,
    })
    })
  })

  it('calls Sort session API and replaces HTML in the Viewer Session', async () => {
    const user = userEvent.setup()
    const { onHtmlReplaced, onBusyChange } = renderSurface({
      html: `<div>
        <a href="#" data-ssrs-action="sort" data-ssrs-sort-item="Region" data-ssrs-sort-direction="Ascending" data-ssrs-sort-clear="false">Sort Region</a>
      </div>`,
    })

    await user.click(screen.getByRole('link', { name: 'Sort Region' }))

    await waitFor(() => {
      expect(sortReport).toHaveBeenCalledWith('session-1', 'Region', 'Ascending', false)
    })
    expect(onHtmlReplaced).toHaveBeenCalledWith(sortedResult, undefined)
    expect(onBusyChange).toHaveBeenCalledWith(true)
    expect(onBusyChange).toHaveBeenCalledWith(false)
    expect(drillthroughReport).not.toHaveBeenCalled()
  })

  it('passes Descending and clear Sort attributes to the session API', async () => {
    const user = userEvent.setup()
    vi.mocked(sortReport).mockResolvedValueOnce({
      ...sortedResult,
      html: '<div>Sort cleared</div>',
    })

    // Clear links mirror ActionLinkRewriter: Clear=True keeps the URL SortDirection
    // (typically Ascending) and sets data-ssrs-sort-clear="true".
    const { onHtmlReplaced } = renderSurface({
      html: `<div>
        <a href="#" data-ssrs-action="sort" data-ssrs-sort-item="Col1" data-ssrs-sort-direction="Descending" data-ssrs-sort-clear="false">Desc</a>
        <a href="#" data-ssrs-action="sort" data-ssrs-sort-item="Col1" data-ssrs-sort-direction="Ascending" data-ssrs-sort-clear="true">Clear</a>
      </div>`,
    })

    await user.click(screen.getByRole('link', { name: 'Desc' }))
    await waitFor(() => {
      expect(sortReport).toHaveBeenCalledWith('session-1', 'Col1', 'Descending', false)
    })

    await user.click(screen.getByRole('link', { name: 'Clear' }))
    await waitFor(() => {
      expect(sortReport).toHaveBeenCalledWith('session-1', 'Col1', 'Ascending', true)
    })
    expect(onHtmlReplaced).toHaveBeenCalledTimes(2)
  })

  it('does not double-submit Sort while busy', async () => {
    const user = userEvent.setup()
    renderSurface({
      busy: true,
      html: `<a href="#" data-ssrs-action="sort" data-ssrs-sort-item="Region" data-ssrs-sort-direction="Ascending" data-ssrs-sort-clear="false">Sort Region</a>`,
    })

    await user.click(screen.getByRole('link', { name: 'Sort Region' }))

    expect(sortReport).not.toHaveBeenCalled()
  })

  it('opens External Links outside the Viewer Session', async () => {
    const user = userEvent.setup()
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    renderSurface({
      html: `<a href="https://example.com/docs" data-ssrs-action="external">External docs</a>`,
    })

    await user.click(screen.getByRole('link', { name: 'External docs' }))

    expect(openSpy).toHaveBeenCalledWith(
      'https://example.com/docs',
      '_blank',
      'noopener,noreferrer',
    )
    expect(toggleDrilldown).not.toHaveBeenCalled()
    expect(sortReport).not.toHaveBeenCalled()
    expect(drillthroughReport).not.toHaveBeenCalled()

    openSpy.mockRestore()
  })
})
