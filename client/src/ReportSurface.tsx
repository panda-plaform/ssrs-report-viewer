import { useEffect, useRef } from 'react'
import {
  drillthroughReport,
  goBack,
  navigateBookmark,
  sortReport,
  toggleDrilldown,
  type PageInfo,
  type ParameterSubmission,
  type RenderResponse,
  type SortDirection,
} from './reportApi'

type Props = {
  html: string | null
  sessionId: string | null
  pageInfo: PageInfo | null
  canGoBack: boolean
  busy: boolean
  error: string | null
  onHtmlReplaced: (result: RenderResponse) => void
  onError: (message: string) => void
  onBusyChange: (busy: boolean) => void
}

/**
 * Injects Execution HTML into the DOM and delegates Action Links (ADR-0003).
 * Drilldown / Sort / Drillthrough / Bookmark to session APIs; Back when stack non-empty;
 * External Links in a new browsing context.
 */
export function ReportSurface({
  html,
  sessionId,
  pageInfo,
  canGoBack,
  busy,
  error,
  onHtmlReplaced,
  onError,
  onBusyChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = containerRef.current
    if (!node) {
      return
    }

    node.innerHTML = html ?? ''
  }, [html])

  useEffect(() => {
    const node = containerRef.current
    if (!node || !sessionId) {
      return
    }

    async function handleClick(event: MouseEvent) {
      const root = containerRef.current
      if (!root) {
        return
      }

      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      const anchor = target.closest('a')
      if (!anchor || !root.contains(anchor)) {
        return
      }

      const action = anchor.getAttribute('data-ssrs-action')

      if (action === 'drilldown') {
        event.preventDefault()
        event.stopPropagation()

        if (busy) {
          return
        }

        const toggleId = anchor.getAttribute('data-ssrs-toggle-id')
        if (!toggleId || !sessionId) {
          return
        }

        onBusyChange(true)
        try {
          const result = await toggleDrilldown(sessionId, toggleId)
          onHtmlReplaced(result)
        } catch (err) {
          onError(err instanceof Error ? err.message : 'Drilldown toggle failed')
        } finally {
          onBusyChange(false)
        }
        return
      }

      if (action === 'sort') {
        event.preventDefault()
        event.stopPropagation()

        if (busy) {
          return
        }

        const sortItem = anchor.getAttribute('data-ssrs-sort-item')
        const directionAttr = anchor.getAttribute('data-ssrs-sort-direction') ?? 'Ascending'
        const clear = anchor.getAttribute('data-ssrs-sort-clear') === 'true'
        if (!sortItem || !sessionId) {
          return
        }

        const direction = (
          ['Ascending', 'Descending', 'None'].includes(directionAttr)
            ? directionAttr
            : 'Ascending'
        ) as SortDirection

        onBusyChange(true)
        try {
          const result = await sortReport(sessionId, sortItem, direction, clear)
          onHtmlReplaced(result)
        } catch (err) {
          onError(err instanceof Error ? err.message : 'Sort failed')
        } finally {
          onBusyChange(false)
        }
        return
      }

      if (action === 'drillthrough') {
        event.preventDefault()
        event.stopPropagation()

        if (busy) {
          return
        }

        const reportPath = anchor.getAttribute('data-ssrs-report-path')
        const paramsAttr = anchor.getAttribute('data-ssrs-parameters')
        if (!reportPath || !sessionId) {
          return
        }

        let parameters: ParameterSubmission[] = []
        if (paramsAttr) {
          try {
            parameters = JSON.parse(paramsAttr) as ParameterSubmission[]
          } catch {
            onError('Invalid Drillthrough parameters on Action Link')
            return
          }
        }

        onBusyChange(true)
        try {
          const result = await drillthroughReport(sessionId, reportPath, parameters)
          onHtmlReplaced(result)
        } catch (err) {
          onError(err instanceof Error ? err.message : 'Drillthrough failed')
        } finally {
          onBusyChange(false)
        }
        return
      }

      if (action === 'bookmark') {
        event.preventDefault()
        event.stopPropagation()

        if (busy) {
          return
        }

        const bookmarkId = anchor.getAttribute('data-ssrs-bookmark-id')
        if (!bookmarkId || !sessionId) {
          return
        }

        onBusyChange(true)
        try {
          const result = await navigateBookmark(sessionId, bookmarkId)
          onHtmlReplaced(result)
        } catch (err) {
          onError(err instanceof Error ? err.message : 'Bookmark navigation failed')
        } finally {
          onBusyChange(false)
        }
        return
      }

      if (action === 'external') {
        event.preventDefault()
        event.stopPropagation()
        const href = anchor.getAttribute('href')
        if (href) {
          window.open(href, '_blank', 'noopener,noreferrer')
        }
        return
      }

      // Never navigate the Viewer Session toward ReportServer or leftover action URLs.
      const href = anchor.getAttribute('href') ?? ''
      if (/reportserver/i.test(href) || href.includes('/api/sessions/')) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    node.addEventListener('click', handleClick)
    return () => {
      node.removeEventListener('click', handleClick)
    }
  }, [sessionId, busy, onHtmlReplaced, onError, onBusyChange])

  async function handleBack() {
    if (!sessionId || busy || !canGoBack) {
      return
    }

    onBusyChange(true)
    try {
      const result = await goBack(sessionId)
      onHtmlReplaced(result)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Back failed')
    } finally {
      onBusyChange(false)
    }
  }

  if (!html && !error) {
    return null
  }

  return (
    <section className="report-surface" aria-labelledby="report-surface-heading">
      <header className="report-surface-header no-print">
        <h2 id="report-surface-heading">Report</h2>
        {pageInfo && (
          <p className="report-page" aria-label="Report Page">
            Page {pageInfo.currentPage} of {pageInfo.pageCount}
          </p>
        )}
        {sessionId && (
          <p className="report-session" aria-label="Viewer Session id">
            Session {sessionId}
          </p>
        )}
        {canGoBack && (
          <button
            type="button"
            className="report-back"
            onClick={() => void handleBack()}
            disabled={busy}
          >
            Back
          </button>
        )}
        {busy && (
          <p className="report-busy" role="status">
            Updating…
          </p>
        )}
      </header>
      {error && (
        <p className="report-surface-error no-print" role="alert">
          {error}
        </p>
      )}
      {html && <div className="report-html" ref={containerRef} />}
    </section>
  )
}
