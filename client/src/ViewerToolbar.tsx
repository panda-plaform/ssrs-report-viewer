import { useEffect, useState } from 'react'
import {
  refreshReport,
  setReportPage,
  setZoom,
  type PageInfo,
  type RenderResponse,
} from './reportApi'

const ZOOM_OPTIONS = [50, 75, 100, 125, 150, 200] as const

type Props = {
  sessionId: string
  pageInfo: PageInfo
  zoomPercent: number
  busy: boolean
  onUpdated: (result: RenderResponse) => void
  onError: (message: string) => void
  onBusyChange: (busy: boolean) => void
}

export function ViewerToolbar({
  sessionId,
  pageInfo,
  zoomPercent,
  busy,
  onUpdated,
  onError,
  onBusyChange,
}: Props) {
  const [gotoValue, setGotoValue] = useState(String(pageInfo.currentPage))

  useEffect(() => {
    setGotoValue(String(pageInfo.currentPage))
  }, [pageInfo.currentPage])

  async function run(action: () => Promise<RenderResponse>) {
    if (busy) {
      return
    }

    onBusyChange(true)
    onError('')
    try {
      const result = await action()
      setGotoValue(String(result.pageInfo.currentPage))
      onUpdated(result)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Viewer Session action failed')
    } finally {
      onBusyChange(false)
    }
  }

  return (
    <div className="viewer-toolbar" role="toolbar" aria-label="Report Viewer toolbar">
      <label className="viewer-toolbar-field">
        Zoom
        <select
          value={zoomPercent}
          disabled={busy}
          onChange={(event) => {
            const next = Number(event.target.value)
            void run(() => setZoom(sessionId, next))
          }}
        >
          {ZOOM_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}%
            </option>
          ))}
          {!ZOOM_OPTIONS.includes(zoomPercent as (typeof ZOOM_OPTIONS)[number]) && (
            <option value={zoomPercent}>{zoomPercent}%</option>
          )}
        </select>
      </label>

      <div className="viewer-toolbar-group" aria-label="Report Page">
        <button
          type="button"
          disabled={busy || pageInfo.currentPage <= 1}
          onClick={() => void run(() => setReportPage(sessionId, 'previous'))}
        >
          Previous
        </button>
        <span className="viewer-toolbar-page">
          Page {pageInfo.currentPage} of {pageInfo.pageCount}
        </span>
        <button
          type="button"
          disabled={busy || pageInfo.currentPage >= pageInfo.pageCount}
          onClick={() => void run(() => setReportPage(sessionId, 'next'))}
        >
          Next
        </button>
        <label className="viewer-toolbar-field">
          Go to
          <input
            type="number"
            min={1}
            max={pageInfo.pageCount}
            value={gotoValue}
            disabled={busy}
            onChange={(event) => setGotoValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                const page = Number(gotoValue)
                if (Number.isFinite(page)) {
                  void run(() => setReportPage(sessionId, 'goto', page))
                }
              }
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const page = Number(gotoValue)
            if (Number.isFinite(page)) {
              void run(() => setReportPage(sessionId, 'goto', page))
            }
          }}
        >
          Go
        </button>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void run(() => refreshReport(sessionId))}
      >
        Refresh
      </button>
    </div>
  )
}
