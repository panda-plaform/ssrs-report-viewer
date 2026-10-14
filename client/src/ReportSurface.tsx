import { useEffect, useRef } from 'react'

type Props = {
  html: string | null
  sessionId: string | null
  error: string | null
  busy?: boolean
  onBookmarkNavigate?: (bookmarkId: string) => void
}

function resolveBookmarkId(anchor: HTMLAnchorElement, sessionId: string): string | null {
  const dataId = anchor.getAttribute('data-bookmark-id')
  if (dataId) {
    return dataId
  }

  const action = anchor.getAttribute('data-action')
  const href = anchor.getAttribute('href') ?? ''
  if (action === 'bookmark' || href.includes('/actions/bookmark/')) {
    const marker = `/api/sessions/${sessionId}/actions/bookmark/`
    const index = href.indexOf(marker)
    if (index >= 0) {
      return decodeURIComponent(href.slice(index + marker.length).split(/[?#]/)[0] ?? '')
    }

    const relative = href.match(/bookmark\/([^/?#]+)/i)
    if (relative?.[1]) {
      return decodeURIComponent(relative[1])
    }
  }

  return null
}

/**
 * Injects Execution HTML into the DOM (ADR-0003). HTML comes only from our API.
 * Bookmark Action Links are delegated to the session bookmark endpoint.
 */
export function ReportSurface({
  html,
  sessionId,
  error,
  busy = false,
  onBookmarkNavigate,
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
    if (!node || !sessionId || !onBookmarkNavigate) {
      return
    }

    const handleClick = (event: MouseEvent) => {
      if (busy) {
        event.preventDefault()
        return
      }

      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      const anchor = target.closest('a')
      if (!(anchor instanceof HTMLAnchorElement) || !sessionId) {
        return
      }

      const bookmarkId = resolveBookmarkId(anchor, sessionId)
      if (!bookmarkId) {
        return
      }

      event.preventDefault()
      onBookmarkNavigate(bookmarkId)
    }

    node.addEventListener('click', handleClick)
    return () => {
      node.removeEventListener('click', handleClick)
    }
  }, [sessionId, onBookmarkNavigate, busy, html])

  if (error) {
    return (
      <section className="report-surface" aria-labelledby="report-surface-heading">
        <h2 id="report-surface-heading">Report</h2>
        <p className="report-surface-error" role="alert">
          {error}
        </p>
      </section>
    )
  }

  if (!html) {
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
      </header>
      <div className="report-html" ref={containerRef} />
    </section>
  )
}
