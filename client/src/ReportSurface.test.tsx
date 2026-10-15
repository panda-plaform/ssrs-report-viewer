import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { drillthroughReport, toggleDrilldown } from './reportApi'
import { ReportSurface } from './ReportSurface'

vi.mock('./reportApi', () => ({
  drillthroughReport: vi.fn(),
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
  canGoBack: true,
  reportPath: '/Sales/Child',
  parameters: [{ name: 'Region', values: ['North'] }],
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
    const { onHtmlReplaced } = renderSurface()

    await user.click(screen.getByRole('link', { name: 'Toggle' }))

    await waitFor(() => {
      expect(toggleDrilldown).toHaveBeenCalledWith('session-1', 'tog1')
    })
    expect(drillthroughReport).not.toHaveBeenCalled()
    expect(onHtmlReplaced).toHaveBeenCalledWith(
      expect.objectContaining({ reportPath: '/Sales/Parent' }),
      undefined,
    )
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
})
