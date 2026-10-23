import { useEffect, useRef } from 'react'
import { wireFixedHeaders } from '../../createFixedHeaders'
import { drillthroughReport } from '../drillthrough/drillthroughApi'
import type { PageInfo, ParameterSubmission, RenderResponse } from '../../shared/api/sessionTypes'
import { navigateBookmark, sortReport, toggleDrilldown, type SortDirection } from './actionLinksApi'

export type HtmlReplacedOptions = {
  /** Drillthrough / in-app Back: sync `?path=` (replaceState) and reseed parameters. */
  syncOpenReport?: boolean
  /**
   * When syncing open report: collapse the parameter form (default true).
   * False when Drillthrough carried no Action Link parameters (catalog open needing prompts).
   */
  collapseParameters?: boolean
}

type Props = {
  html: string | null
  sessionId: string | null
  pageInfo: PageInfo | null
  busy: boolean
  error: string | null
  onHtmlReplaced: (result: RenderResponse, options?: HtmlReplacedOptions) => void
  onError: (error: unknown) => void
  onBusyChange: (busy: boolean) => void
}

/**
 * Injects Execution HTML into the DOM and delegates Action Links (ADR-0003).
 * Drilldown / Sort / Bookmark / Drillthrough to session APIs; External Links leave the Viewer Session.
 * Back lives on the Viewer Toolbar (native chrome).
 */
export function ReportSurface({
  html,
  sessionId,
  pageInfo,
  busy,
  error,
  onHtmlReplaced,
  onError,
  onBusyChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const inFlightRef = useRef(false)

  useEffect(() => {
    const node = containerRef.current
    if (!node) {
      return
    }

    node.innerHTML = html ?? ''
    void wireFixedHeaders(node)
  }, [html])

  useEffect(() => {
    const node = containerRef.current
    if (!node || !sessionId) {
      return
    }

    const activeSessionId = sessionId

    async function runSessionAction(
      work: () => Promise<RenderResponse>,
      failureLabel: string,
      options?: HtmlReplacedOptions,
    ): Promise<void> {
      if (busy || inFlightRef.current) {
        return
      }

      inFlightRef.current = true
      onBusyChange(true)
      try {
        const result = await work()
        onHtmlReplaced(result, options)
      } catch (err) {
        onError(err instanceof Error ? err : failureLabel)
      } finally {
        inFlightRef.current = false
        onBusyChange(false)
      }
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
        const toggleId = anchor.getAttribute('data-ssrs-toggle-id')
        if (!toggleId) {
          return
        }

        await runSessionAction(
          () => toggleDrilldown(activeSessionId, toggleId),
          'Drilldown toggle failed',
        )
        return
      }

      if (action === 'drillthrough') {
        event.preventDefault()
        event.stopPropagation()
        const reportPath = anchor.getAttribute('data-ssrs-report-path')
        const paramsAttr = anchor.getAttribute('data-ssrs-parameters')
        if (!reportPath) {
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

        await runSessionAction(
          () => drillthroughReport(activeSessionId, reportPath, parameters),
          'Drillthrough failed',
          {
            syncOpenReport: true,
            // Empty Action Link params → show the form (e.g. ItemPath open of Execution Log).
            collapseParameters: parameters.length > 0,
          },
        )
        return
      }

      if (action === 'sort') {
        event.preventDefault()
        event.stopPropagation()
        const sortItem = anchor.getAttribute('data-ssrs-sort-item')
        const directionAttr = anchor.getAttribute('data-ssrs-sort-direction') ?? 'Ascending'
        const clear = anchor.getAttribute('data-ssrs-sort-clear') === 'true'
        if (!sortItem) {
          return
        }

        const direction = (
          ['Ascending', 'Descending', 'None'].includes(directionAttr)
            ? directionAttr
            : 'Ascending'
        ) as SortDirection

        await runSessionAction(
          () => sortReport(activeSessionId, sortItem, direction, clear),
          'Sort failed',
        )
        return
      }

      if (action === 'bookmark') {
        event.preventDefault()
        event.stopPropagation()
        const bookmarkId = anchor.getAttribute('data-ssrs-bookmark-id')
        if (!bookmarkId) {
          return
        }

        await runSessionAction(
          () => navigateBookmark(activeSessionId, bookmarkId),
          'Bookmark navigation failed',
        )
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

  if (!html && !error) {
    return null
  }

  return (
    <section className="report-surface" aria-labelledby="report-surface-heading">
      <h2 id="report-surface-heading" className="visually-hidden">
        Report
        {pageInfo ? ` — Page ${pageInfo.currentPage} of ${pageInfo.pageCount}` : ''}
      </h2>
      {busy && (
        <p className="report-busy no-print" role="status">
          Updating…
        </p>
      )}
      {error && (
        <p className="report-surface-error no-print" role="alert">
          {error}
        </p>
      )}
      {html && <div className="report-html" ref={containerRef} />}
    </section>
  )
}
