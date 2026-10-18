import type { PrintPdfSettings } from './printPdfSettings'
import { postSessionAction, throwIfNotOk } from './shared/api/sessionHttp'
import type {
  FindResponse,
  ParameterSubmission,
  ParametersResponse,
  RenderResponse,
} from './shared/api/sessionTypes'

export type {
  PrintOrientation,
  PrintPageSize,
  PrintPdfSettings,
} from './printPdfSettings'

export type {
  DocumentMapNode,
  FindResponse,
  PageInfo,
  ParameterSubmission,
  ParameterValidValue,
  ParametersResponse,
  RenderResponse,
  ReportParameter,
  SortDirection,
} from './shared/api/sessionTypes'

export {
  isViewerSessionExpiredError,
  ViewerSessionExpiredError,
} from './shared/api/sessionHttp'

export {
  navigateBookmark,
  sortReport,
  toggleDrilldown,
} from './features/action-links/actionLinksApi'

export async function fetchParameters(
  path: string,
  currentValues?: ParameterSubmission[],
): Promise<ParametersResponse> {
  const query = new URLSearchParams({ path })
  if (currentValues && currentValues.length > 0) {
    query.set('values', JSON.stringify(currentValues))
  }
  const response = await fetch(`/api/reports/parameters?${query}`)
  await throwIfNotOk(response)
  return (await response.json()) as ParametersResponse
}

export async function viewReport(
  reportPath: string,
  parameters: ParameterSubmission[],
): Promise<RenderResponse> {
  const response = await fetch('/api/reports/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportPath, parameters }),
  })
  await throwIfNotOk(response)
  return (await response.json()) as RenderResponse
}

export function setZoom(sessionId: string, zoomPercent: number): Promise<RenderResponse> {
  return postSessionAction(sessionId, 'zoom', { zoomPercent })
}

export function setReportPage(
  sessionId: string,
  action: 'next' | 'previous' | 'goto',
  page?: number,
): Promise<RenderResponse> {
  return postSessionAction(sessionId, 'page', { action, page })
}

export function refreshReport(sessionId: string): Promise<RenderResponse> {
  return postSessionAction(sessionId, 'refresh', {})
}

export function drillthroughReport(
  sessionId: string,
  reportPath: string,
  parameters: ParameterSubmission[],
): Promise<RenderResponse> {
  return postSessionAction(sessionId, 'drillthrough', { reportPath, parameters })
}

export function goBack(sessionId: string): Promise<RenderResponse> {
  return postSessionAction(sessionId, 'back')
}

export function navigateDocumentMap(sessionId: string, id: string): Promise<RenderResponse> {
  return postSessionAction(sessionId, 'document-map', { id })
}

/** Client Export format tokens (native menu order). ACCESSIBLEPDF / TIFF map server-side to DeviceInfo. */
export type ExportFormat =
  | 'WORDOPENXML'
  | 'EXCELOPENXML'
  | 'PPTX'
  | 'PDF'
  | 'ACCESSIBLEPDF'
  | 'TIFF'
  | 'MHTML'
  | 'CSV'
  | 'XML'

const EXPORT_FALLBACK_NAMES: Record<ExportFormat, string> = {
  WORDOPENXML: 'report.docx',
  EXCELOPENXML: 'report.xlsx',
  PPTX: 'report.pptx',
  PDF: 'report.pdf',
  ACCESSIBLEPDF: 'report.pdf',
  TIFF: 'report.tiff',
  MHTML: 'report.mhtml',
  CSV: 'report.csv',
  XML: 'report.xml',
}

function fileNameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) {
    return fallback
  }

  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1])
    } catch {
      // fall through
    }
  }

  const plain = /filename="?([^";]+)"?/i.exec(header)
  return plain?.[1] ?? fallback
}

async function fetchExportBlob(
  sessionId: string,
  format: ExportFormat,
  printSettings?: PrintPdfSettings,
): Promise<{ blob: Blob; fileName: string }> {
  const query = new URLSearchParams({ format })
  if (format === 'PDF' && printSettings) {
    query.set('pageSize', printSettings.pageSize)
    query.set('orientation', printSettings.orientation)
  }
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/export?${query}`)
  await throwIfNotOk(response)

  const blob = await response.blob()
  const fileName = fileNameFromContentDisposition(
    response.headers.get('Content-Disposition'),
    EXPORT_FALLBACK_NAMES[format],
  )
  return { blob, fileName }
}

/**
 * Opens a PDF blob in a hidden iframe and invokes the browser print dialog.
 * Resolves once print() is invoked (not when the user dismisses the print UI),
 * so callers can close their settings modal without waiting on afterprint.
 * PDF iframes often skip the load event — a short delayed print attempt covers that.
 */
export function printPdfBlob(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    // Non-zero size helps Chromium's PDF viewer initialize; keep it off-screen.
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0'

    let settled = false
    let cleaned = false
    let printStarted = false
    let cleanupTimer = 0

    const cleanup = () => {
      if (cleaned) {
        return
      }
      cleaned = true
      window.clearTimeout(printAttemptTimer)
      window.clearTimeout(cleanupTimer)
      URL.revokeObjectURL(url)
      iframe.remove()
    }

    const settleOk = () => {
      if (settled) {
        return
      }
      settled = true
      resolve()
    }

    const settleErr = (error: Error) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      reject(error)
    }

    const tryPrint = () => {
      if (printStarted) {
        return
      }
      printStarted = true
      window.clearTimeout(printAttemptTimer)

      const win = iframe.contentWindow
      if (!win) {
        settleErr(new Error('Print failed: could not open PDF.'))
        return
      }

      try {
        win.focus()
        win.print()
        settleOk()
        win.addEventListener('afterprint', cleanup)
        cleanupTimer = window.setTimeout(cleanup, 60_000)
      } catch (error) {
        settleErr(error instanceof Error ? error : new Error('Print failed'))
      }
    }

    iframe.addEventListener('load', tryPrint)
    // Many browsers never fire load for application/pdf in an iframe.
    const printAttemptTimer = window.setTimeout(tryPrint, 400)

    iframe.src = url
    document.body.appendChild(iframe)
  })
}

/** Downloads Export of the current Execution for the Viewer Session. */
export async function downloadExport(
  sessionId: string,
  format: ExportFormat,
  printSettings?: PrintPdfSettings,
): Promise<void> {
  const { blob, fileName } = await fetchExportBlob(sessionId, format, printSettings)

  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Fetches a printer-friendly PDF of the current Execution with page layout settings. */
export async function fetchExportPdf(
  sessionId: string,
  printSettings: PrintPdfSettings,
): Promise<Blob> {
  const { blob } = await fetchExportBlob(sessionId, 'PDF', printSettings)
  return blob
}

/**
 * Fetches a printer-friendly PDF of the current Execution with page layout settings,
 * then opens the browser print dialog on that PDF (no download).
 * Resolves when the print dialog has been invoked (not when the user finishes printing).
 */
export async function printExportPdf(
  sessionId: string,
  printSettings: PrintPdfSettings,
): Promise<void> {
  const blob = await fetchExportPdf(sessionId, printSettings)
  await printPdfBlob(blob)
}

async function postFind(
  sessionId: string,
  path: 'find' | 'find/next',
  findValue: string,
): Promise<FindResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ findValue }),
  })
  await throwIfNotOk(response)
  return (await response.json()) as FindResponse
}

export function findInReport(sessionId: string, findValue: string): Promise<FindResponse> {
  return postFind(sessionId, 'find', findValue)
}

export function findNextInReport(sessionId: string, findValue: string): Promise<FindResponse> {
  return postFind(sessionId, 'find/next', findValue)
}
