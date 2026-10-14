import { useEffect, useRef } from 'react'

type Props = {
  html: string | null
  sessionId: string | null
  error: string | null
}

/**
 * Injects Execution HTML into the DOM (ADR-0003). HTML comes only from our API.
 */
export function ReportSurface({ html, sessionId, error }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = containerRef.current
    if (!node) {
      return
    }

    node.innerHTML = html ?? ''
  }, [html])

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
