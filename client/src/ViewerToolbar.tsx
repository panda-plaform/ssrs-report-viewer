import { useEffect, useId, useRef, useState } from 'react'
import type { HtmlReplacedOptions } from './ReportSurface'
import {
  DEFAULT_PRINT_SETTINGS,
  PRINT_ORIENTATIONS,
  PRINT_PAGE_SIZES,
  type PrintOrientation,
  type PrintPageSize,
  type PrintPdfSettings,
} from './printPdfSettings'
import {
  downloadExport,
  fetchExportPdf,
  findInReport,
  findNextInReport,
  goBack,
  printPdfBlob,
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
  IconChevronDown,
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

/** Percent zooms matching the native SSRS toolbar order (Page Width / Whole Page are out of scope — see ADR 0004). */
const ZOOM_OPTIONS = [500, 200, 150, 100, 75, 50, 25, 10] as const

/** Native SSRS Export menu labels and order. */
const EXPORT_FORMATS: { format: ExportFormat; label: string }[] = [
  { format: 'WORDOPENXML', label: 'Word' },
  { format: 'EXCELOPENXML', label: 'Excel' },
  { format: 'PPTX', label: 'PowerPoint' },
  { format: 'PDF', label: 'PDF' },
  { format: 'ACCESSIBLEPDF', label: 'Accessible PDF' },
  { format: 'TIFF', label: 'TIFF file' },
  { format: 'MHTML', label: 'MHTML (web archive)' },
  { format: 'CSV', label: 'CSV (comma delimited)' },
  { format: 'XML', label: 'XML file with report data' },
]

const PAGE_SIZE_LABELS: Record<PrintPageSize, string> = {
  A4: 'A4 (210 × 297 mm)',
  A3: 'A3 (297 × 420 mm)',
  Letter: 'Letter (8.5 × 11 in)',
  Legal: 'Legal (8.5 × 14 in)',
}

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
  const [completedFindText, setCompletedFindText] = useState<string | null>(null)
  const [findStatus, setFindStatus] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [busyFormat, setBusyFormat] = useState<ExportFormat | null>(null)
  const [printOpen, setPrintOpen] = useState(false)
  const [printBusy, setPrintBusy] = useState(false)
  const [printSettings, setPrintSettings] = useState<PrintPdfSettings>(DEFAULT_PRINT_SETTINGS)
  const exportMenuId = useId()
  const printTitleId = useId()
  const exportRef = useRef<HTMLDivElement>(null)
  const backInFlightRef = useRef(false)
  const printDialogRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    function syncFullscreen() {
      onMaximizedChange(Boolean(document.fullscreenElement))
    }

    syncFullscreen()
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [onMaximizedChange])

  useEffect(() => {
    if (!printOpen) {
      return
    }

    const dialog = printDialogRef.current
    if (dialog) {
      const focusTarget =
        dialog.querySelector<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? dialog
      focusTarget.focus()
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        // Dismiss the dialog UI even while a PDF is in flight; do not start another.
        setPrintOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [printOpen])

  async function handleMaximizeClick() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      // Browser may deny Fullscreen without a user gesture or policy allow.
    }
  }

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
    if (busy || !canGoBack || backInFlightRef.current) {
      return
    }

    backInFlightRef.current = true
    onBusyChange(true)
    onError('')
    try {
      const result = await goBack(sessionId)
      onUpdated(result, { syncOpenReport: true })
    } catch (err) {
      onError(err instanceof Error ? err : 'Back failed')
    } finally {
      backInFlightRef.current = false
      onBusyChange(false)
    }
  }

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

  function handlePrint() {
    if (busy || printBusy) {
      return
    }
    setPrintOpen(true)
  }

  function dismissPrint() {
    setPrintOpen(false)
  }

  async function confirmPrint() {
    if (busy || printBusy) {
      return
    }

    setPrintBusy(true)
    onBusyChange(true)
    onError('')
    try {
      const blob = await fetchExportPdf(sessionId, printSettings)
      // Close as soon as the PDF is ready — do not wait for afterprint.
      setPrintOpen(false)
      setPrintBusy(false)
      onBusyChange(false)
      try {
        await printPdfBlob(blob)
      } catch (err) {
        onError(err instanceof Error ? err : 'Print failed')
      }
    } catch (err) {
      onError(err instanceof Error ? err : 'Print failed')
      setPrintBusy(false)
      onBusyChange(false)
    }
  }

  const atFirst = pageInfo.currentPage <= 1
  const atLast = pageInfo.currentPage >= pageInfo.pageCount
  const trimmedFind = findValue.trim()
  const canFind = trimmedFind.length > 0
  const canFindNext = canFind && completedFindText === trimmedFind

  return (
    <>
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

      <div className="viewer-toolbar-group" role="group" aria-label="Refresh and Back">
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
      </div>

      <span className="viewer-toolbar-sep" aria-hidden="true" />

      <label className="viewer-toolbar-field viewer-toolbar-zoom">
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
          className="viewer-toolbar-icon viewer-toolbar-export-trigger"
          aria-label="Export"
          title="Export"
          aria-haspopup="menu"
          aria-expanded={exportOpen}
          aria-controls={exportMenuId}
          disabled={busyFormat !== null || busy}
          onClick={() => setExportOpen((open) => !open)}
        >
          <IconExport />
          <IconChevronDown />
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

      <span className="viewer-toolbar-sep" aria-hidden="true" />

      <button
        type="button"
        className="viewer-toolbar-icon"
        aria-label="Print"
        title="Print"
        disabled={busy || printBusy}
        onClick={handlePrint}
      >
        <IconPrint />
      </button>

      <span className="viewer-toolbar-sep" aria-hidden="true" />

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

      <span className="viewer-toolbar-sep" aria-hidden="true" />

      <span className="viewer-toolbar-spacer" aria-hidden="true" />

      <span className="viewer-toolbar-sep" aria-hidden="true" />

      <div className="viewer-toolbar-group viewer-toolbar-maximize">
        <button
          type="button"
          className="viewer-toolbar-icon"
          aria-label={maximized ? 'Restore' : 'Maximize'}
          title={maximized ? 'Restore' : 'Maximize'}
          aria-pressed={maximized}
          disabled={busy}
          onClick={() => void handleMaximizeClick()}
        >
          {maximized ? <IconRestore /> : <IconMaximize />}
        </button>
      </div>
    </div>

    {printOpen && (
      <div className="print-settings-backdrop no-print">
        <div
          ref={printDialogRef}
          className="print-settings-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby={printTitleId}
          aria-busy={printBusy || undefined}
          tabIndex={-1}
        >
          <div className="print-settings-dialog-header">
            <h2 id={printTitleId}>Print</h2>
            <button
              type="button"
              className="print-settings-close"
              aria-label="Close"
              disabled={printBusy}
              onClick={dismissPrint}
            >
              ×
            </button>
          </div>
          <p className="print-settings-copy">
            We&apos;ll create a printer-friendly PDF version of your report, then open the print
            dialog.
          </p>
          <label className="print-settings-field">
            <span>Page size</span>
            <select
              aria-label="Page size"
              value={printSettings.pageSize}
              disabled={printBusy}
              onChange={(event) =>
                setPrintSettings((current) => ({
                  ...current,
                  pageSize: event.target.value as PrintPageSize,
                }))
              }
            >
              {PRINT_PAGE_SIZES.map((value) => (
                <option key={value} value={value}>
                  {PAGE_SIZE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="print-settings-field">
            <span>Page orientation</span>
            <select
              aria-label="Page orientation"
              value={printSettings.orientation}
              disabled={printBusy}
              onChange={(event) =>
                setPrintSettings((current) => ({
                  ...current,
                  orientation: event.target.value as PrintOrientation,
                }))
              }
            >
              {PRINT_ORIENTATIONS.map((orientation) => (
                <option key={orientation} value={orientation}>
                  {orientation}
                </option>
              ))}
            </select>
          </label>
          <div className="print-settings-actions">
            <button type="button" disabled={printBusy} onClick={() => void confirmPrint()}>
              {printBusy ? 'Printing…' : 'Print'}
            </button>
            <button type="button" disabled={printBusy} onClick={dismissPrint}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
