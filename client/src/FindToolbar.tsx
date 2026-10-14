import { useState } from 'react'
import { findInReport, findNextInReport, type FindResponse } from './reportApi'

type Props = {
  sessionId: string
  busy: boolean
  onResult: (result: FindResponse) => void
  onError: (error: unknown) => void
  onBusyChange: (busy: boolean) => void
}

/**
 * Server-side Find / next match (SSRS FindString), not browser Ctrl+F.
 */
export function FindToolbar({ sessionId, busy, onResult, onError, onBusyChange }: Props) {
  const [findValue, setFindValue] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  async function runFind(next: boolean) {
    const value = findValue.trim()
    if (!value) {
      setStatus('Enter text to Find.')
      return
    }

    onBusyChange(true)
    setStatus(null)
    try {
      const result = next
        ? await findNextInReport(sessionId, value)
        : await findInReport(sessionId, value)
      onResult(result)
      setStatus(
        result.found
          ? `Found on Report Page ${result.pageInfo.currentPage} of ${result.pageInfo.pageCount}.`
          : 'No matches in the current Execution.',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Find failed'
      onError(error instanceof Error ? error : message)
      setStatus(message)
    } finally {
      onBusyChange(false)
    }
  }

  return (
    <section className="find-toolbar" aria-labelledby="find-toolbar-heading">
      <h2 id="find-toolbar-heading" className="visually-hidden">
        Find
      </h2>
      <div className="find-toolbar-controls">
        <label className="find-label">
          <span className="visually-hidden">Find text</span>
          <input
            type="search"
            name="findValue"
            value={findValue}
            onChange={(event) => setFindValue(event.target.value)}
            placeholder="Find in report"
            disabled={busy}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void runFind(false)
              }
            }}
          />
        </label>
        <button type="button" disabled={busy} onClick={() => void runFind(false)}>
          Find
        </button>
        <button type="button" disabled={busy} onClick={() => void runFind(true)}>
          Next
        </button>
      </div>
      {status && (
        <p className="find-status" role="status">
          {status}
        </p>
      )}
    </section>
  )
}
