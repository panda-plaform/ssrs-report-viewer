import { useEffect, useId, useRef, useState } from 'react'
import type { HtmlReplacedOptions } from './ReportSurface'
import {
  downloadExport,
  findInReport,
  findNextInReport,
  goBack,
  refreshReport,
  setReportPage,
  setZoom,
  type ExportFormat,
  type FindResponse,
  type PageInfo,
  type RenderResponse,
} from './reportApi'
import {
  IconBack,
  IconExport,
  IconFind,
  IconFindNext,
  IconFirst,
  IconLast,
  IconMaximize,
  IconNext,
  IconPrevious,
  IconPrint,
  IconRefresh,
  IconRestore,
} from './toolbarIcons'

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
  canGoBack: boolean
  maximized: boolean
  onMaximizedChange: (maximized: boolean) => void
  onUpdated: (result: RenderResponse, options?: HtmlReplacedOptions) => void
  onFindResult: (result: FindResponse) => void
  onError: (error: unknown) => void
  onBusyChange: (busy: boolean) => void
}

/**
 * Unified native-style Report Viewer toolbar: Report Page, Refresh, Back, Zoom,
 * Export menu, Print, Find, and Maximize.
 */
export function ViewerToolbar({
  sessionId,
  pageInfo,
  zoomPercent,
  busy,
  canGoBack,
  maximized,
  onMaximizedChange,
  onUpdated,
  onFindResult,
  onError,
  onBusyChange,
}: Props) {
  const [pageValue, setPageValue] = useState(String(pageInfo.currentPage))
  const [findValue, setFindValue] = useState('')
  const [findStatus, setFindStatus] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [busyFormat, setBusyFormat] = useState<ExportFormat | null>(null)
  const exportMenuId = useId()
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPageValue(String(pageInfo.currentPage))
  }, [pageInfo.currentPage])

  useEffect(() => {
    if (!exportOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setExportOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [exportOpen])

  async function run(action: () => Promise<RenderResponse>) {
    if (busy) {
      return
    }

    onBusyChange(true)
    onError('')
    try {
      const result = await action()
      setPageValue(String(result.pageInfo.currentPage))
      onUpdated(result)
    } catch (err) {
      onError(err instanceof Error ? err : 'Viewer Session action failed')
    } finally {
      onBusyChange(false)
    }
  }

  function gotoPage(page: number) {
    if (!Number.isFinite(page)) {
      return
    }
    void run(() => setReportPage(sessionId, 'goto', page))
  }

  async function handleExport(format: ExportFormat) {
    if (busy) {
      return
    }

    setExportOpen(false)
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

  async function handleBack() {
    if (busy || !canGoBack) {
      return
    }

    onBusyChange(true)
    onError('')
    try {
      const result = await goBack(sessionId)
      onUpdated(result, { syncOpenReport: true })
    } catch (err) {
      onError(err instanceof Error ? err : 'Back failed')
    } finally {
      onBusyChange(false)
    }
  }

  async function runFind(next: boolean) {
    const value = findValue.trim()
    if (!value) {
      setFindStatus('Enter text to Find.')
      return
    }

    onBusyChange(true)
    setFindStatus(null)
    try {
      const result = next
        ? await findNextInReport(sessionId, value)
        : await findInReport(sessionId, value)
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

  function handlePrint() {
    window.print()
  }

  const atFirst = pageInfo.currentPage <= 1
  const atLast = pageInfo.currentPage >= pageInfo.pageCount

  return (
    <div className="viewer-toolbar no-print" role="toolbar" aria-label="Report Viewer toolbar">
      <div className="viewer-toolbar-group viewer-toolbar-page" role="group" aria-label="Report Page">
        <button
          type="button"
          className="viewer-toolbar-icon"
          aria-label="First"
          title="First"
          disabled={busy || atFirst}
          onClick={() => gotoPage(1)}
        >
          <IconFirst />
        </button>
        <button
          type="button"
          className="viewer-toolbar-icon"
          aria-label="Previous"
          title="Previous"
          disabled={busy || atFirst}
          onClick={() => void run(() => setReportPage(sessionId, 'previous'))}
        >
          <IconPrevious />
        </button>
        <span className="viewer-toolbar-page-compact">
          <label className="viewer-toolbar-page-field">
            <span className="visually-hidden">Report Page</span>
            <input
              type="number"
              min={1}
              max={pageInfo.pageCount}
              value={pageValue}
              disabled={busy}
              aria-label="Report Page"
              onChange={(event) => setPageValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  gotoPage(Number(pageValue))
                }
              }}
            />
          </label>
          <span className="viewer-toolbar-page-count" aria-live="polite">
            of {pageInfo.pageCount}
          </span>
        </span>
        <button
          type="button"
          className="viewer-toolbar-icon"
          aria-label="Next"
          title="Next"
          disabled={busy || atLast}
          onClick={() => void run(() => setReportPage(sessionId, 'next'))}
        >
          <IconNext />
        </button>
        <button
          type="button"
          className="viewer-toolbar-icon"
          aria-label="Last"
          title="Last"
          disabled={busy || atLast}
          onClick={() => gotoPage(pageInfo.pageCount)}
        >
          <IconLast />
        </button>
      </div>

      <span className="viewer-toolbar-sep" aria-hidden="true" />

      <button
        type="button"
        className="viewer-toolbar-icon"
        aria-label="Refresh"
        title="Refresh"
        disabled={busy}
        onClick={() => void run(() => refreshReport(sessionId))}
      >
        <IconRefresh />
      </button>

      <button
        type="button"
        className="viewer-toolbar-icon"
        aria-label="Back"
        title="Back"
        disabled={busy || !canGoBack}
        onClick={() => void handleBack()}
      >
        <IconBack />
      </button>

      <span className="viewer-toolbar-sep" aria-hidden="true" />

      <label className="viewer-toolbar-field">
        <span className="visually-hidden">Zoom</span>
        <select
          value={zoomPercent}
          disabled={busy}
          aria-label="Zoom"
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

      <span className="viewer-toolbar-sep" aria-hidden="true" />

      <div className="viewer-toolbar-export" ref={exportRef}>
        <button
          type="button"
          className="viewer-toolbar-icon"
          aria-label="Export"
          title="Export"
          aria-haspopup="menu"
          aria-expanded={exportOpen}
          aria-controls={exportMenuId}
          disabled={busyFormat !== null || busy}
          onClick={() => setExportOpen((open) => !open)}
        >
          <IconExport />
        </button>
        {exportOpen && (
          <div id={exportMenuId} className="viewer-toolbar-menu" role="menu" aria-label="Export formats">
            {EXPORT_FORMATS.map(({ format, label }) => (
              <button
                key={format}
                type="button"
                role="menuitem"
                disabled={busyFormat !== null || busy}
                onClick={() => void handleExport(format)}
              >
                {busyFormat === format ? `Exporting ${label}…` : label}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        className="viewer-toolbar-icon"
        aria-label="Print"
        title="Print"
        disabled={busy}
        onClick={handlePrint}
      >
        <IconPrint />
      </button>

      <span className="viewer-toolbar-sep" aria-hidden="true" />

      <div className="viewer-toolbar-group viewer-toolbar-find" aria-label="Find">
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
          className="viewer-toolbar-icon"
          disabled={busy}
          aria-label="Find"
          title="Find"
          onClick={() => void runFind(false)}
        >
          <IconFind />
        </button>
        <button
          type="button"
          className="viewer-toolbar-icon"
          disabled={busy}
          aria-label="Find next"
          title="Find next"
          onClick={() => void runFind(true)}
        >
          <IconFindNext />
        </button>
        {findStatus && (
          <span className="viewer-toolbar-find-status" role="status">
            {findStatus}
          </span>
        )}
      </div>

      <span className="viewer-toolbar-spacer" aria-hidden="true" />

      <button
        type="button"
        className="viewer-toolbar-icon"
        aria-label={maximized ? 'Restore' : 'Maximize'}
        title={maximized ? 'Restore' : 'Maximize'}
        aria-pressed={maximized}
        disabled={busy}
        onClick={() => onMaximizedChange(!maximized)}
      >
        {maximized ? <IconRestore /> : <IconMaximize />}
      </button>
    </div>
  )
}
