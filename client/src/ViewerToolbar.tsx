import { useEffect, useState } from 'react'
import {
  downloadExport,
  refreshReport,
  setReportPage,
  setZoom,
  type ExportFormat,
  type PageInfo,
  type RenderResponse,
} from './reportApi'

const ZOOM_OPTIONS = [50, 75, 100, 125, 150, 200] as const

const EXPORT_FORMATS: { format: ExportFormat; label: string }[] = [
  { format: 'PDF', label: 'PDF' },
  { format: 'EXCELOPENXML', label: 'Excel' },
  { format: 'CSV', label: 'CSV' },
]

type Props = {
  sessionId: string
  pageInfo: PageInfo
  zoomPercent: number
  busy: boolean
  onUpdated: (result: RenderResponse) => void
  onError: (error: unknown) => void
  onBusyChange: (busy: boolean) => void
}

/**
 * Report Viewer chrome: Zoom / Report Page / Refresh plus Export and Print.
 */
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
  const [busyFormat, setBusyFormat] = useState<ExportFormat | null>(null)

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
      onError(err instanceof Error ? err : 'Viewer Session action failed')
    } finally {
      onBusyChange(false)
    }
  }

  async function handleExport(format: ExportFormat) {
    if (busy) {
      return
    }

    onBusyChange(true)
    setBusyFormat(format)
    onError('')
    try {
      await downloadExport(sessionId, format)
    } catch (err) {
      onError(err instanceof Error ? err : 'Export failed')
    } finally {
      setBusyFormat(null)
      onBusyChange(false)
    }
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div className="viewer-toolbar no-print" role="toolbar" aria-label="Report Viewer toolbar">
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

      <div className="viewer-toolbar-group">
        <span className="viewer-toolbar-label">Export</span>
        {EXPORT_FORMATS.map(({ format, label }) => (
          <button
            key={format}
            type="button"
            disabled={busyFormat !== null || busy}
            onClick={() => void handleExport(format)}
          >
            {busyFormat === format ? `Exporting ${label}…` : label}
          </button>
        ))}
      </div>

      <div className="viewer-toolbar-group">
        <button type="button" disabled={busy} onClick={handlePrint}>
          Print
        </button>
      </div>
    </div>
  )
}
