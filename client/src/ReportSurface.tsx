import { useEffect, useRef } from 'react'
import { navigateBookmark, toggleDrilldown, type RenderResponse } from './reportApi'

type Props = {
  html: string | null
  sessionId: string | null
  busy: boolean
  error: string | null
  onHtmlReplaced: (result: RenderResponse) => void
  onError: (message: string) => void
  onBusyChange: (busy: boolean) => void
}

/**
 * Injects Execution HTML into the DOM and delegates Action Links (ADR-0003).
 * Drilldown → session toggle; Bookmark → session bookmark; External Links → new browsing context.
 */
export function ReportSurface({
  html,
  sessionId,
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

  if (!html && !error) {
    return null
  }

  return (
    <section className="report-surface" aria-labelledby="report-surface-heading">
      <header className="report-surface-header">
        <h2 id="report-surface-heading">Report</h2>
        {sessionId && (
          <p className="report-session" aria-label="Viewer Session id">
            Session {sessionId}
          </p>
        )}
        {busy && (
          <p className="report-busy" role="status">
            Updating…
          </p>
        )}
      </header>
      {error && (
        <p className="report-surface-error" role="alert">
          {error}
        </p>
      )}
      {html && <div className="report-html" ref={containerRef} />}
    </section>
  )
}
