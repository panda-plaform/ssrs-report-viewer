import { useState } from 'react'
import { IconFind, IconFindNext } from '../../toolbarIcons'
import { findInReport, findNextInReport, type FindResponse } from './findApi'

type Props = {
  sessionId: string
  busy: boolean
  onFindResult: (result: FindResponse) => void
  onError: (error: unknown) => void
  onBusyChange: (busy: boolean) => void
}

/**
 * Toolbar Find / Find next controls owned by the Find vertical slice.
 */
export function FindControls({
  sessionId,
  busy,
  onFindResult,
  onError,
  onBusyChange,
}: Props) {
  const [findValue, setFindValue] = useState('')
  const [completedFindText, setCompletedFindText] = useState<string | null>(null)
  const [findStatus, setFindStatus] = useState<string | null>(null)

  async function runFind(next: boolean) {
    const value = findValue.trim()
    if (!value) {
      return
    }
    if (next && completedFindText !== value) {
      return
    }

    onBusyChange(true)
    setFindStatus(null)
    try {
      const result = next
        ? await findNextInReport(sessionId, value)
        : await findInReport(sessionId, value)
      if (!next) {
        setCompletedFindText(value)
      }
      onFindResult(result)
      setFindStatus(
        result.found
          ? `Found on Report Page ${result.pageInfo.currentPage} of ${result.pageInfo.pageCount}.`
          : 'No matches in the current Execution.',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Find failed'
      onError(error instanceof Error ? error : message)
      setFindStatus(message)
    } finally {
      onBusyChange(false)
    }
  }

  const trimmedFind = findValue.trim()
  const canFind = trimmedFind.length > 0
  const canFindNext = canFind && completedFindText === trimmedFind

  return (
    <>
      <div className="viewer-toolbar-find" role="group" aria-label="Find">
        <label className="viewer-toolbar-find-field">
          <span className="visually-hidden">Find</span>
          <input
            type="search"
            name="findValue"
            value={findValue}
            disabled={busy}
            aria-label="Find"
            onChange={(event) => setFindValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void runFind(false)
              }
            }}
          />
        </label>
        <button
          type="button"
          className="viewer-toolbar-icon viewer-toolbar-find-action"
          disabled={busy || !canFind}
          aria-label="Find"
          title="Find"
          onClick={() => void runFind(false)}
        >
          <IconFind />
        </button>
        <span className="viewer-toolbar-find-pipe" aria-hidden="true" />
        <button
          type="button"
          className="viewer-toolbar-icon viewer-toolbar-find-action"
          disabled={busy || !canFindNext}
          aria-label="Find next"
          title="Find next"
          onClick={() => void runFind(true)}
        >
          <IconFindNext />
        </button>
      </div>
      {findStatus && (
        <span className="viewer-toolbar-find-status" role="status">
          {findStatus}
        </span>
      )}
    </>
  )
}
