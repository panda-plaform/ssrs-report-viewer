import { useState } from 'react'
import { downloadExport, type ExportFormat } from './reportApi'

type Props = {
  sessionId: string
  onError: (message: string) => void
}

const EXPORT_FORMATS: { format: ExportFormat; label: string }[] = [
  { format: 'PDF', label: 'PDF' },
  { format: 'EXCELOPENXML', label: 'Excel' },
  { format: 'CSV', label: 'CSV' },
]

/**
 * Report Viewer chrome for Export (current Execution) and Print (HTML surface).
 */
export function ViewerToolbar({ sessionId, onError }: Props) {
  const [busyFormat, setBusyFormat] = useState<ExportFormat | null>(null)

  async function handleExport(format: ExportFormat) {
    setBusyFormat(format)
    onError('')
    try {
      await downloadExport(sessionId, format)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setBusyFormat(null)
    }
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div className="viewer-toolbar no-print" role="toolbar" aria-label="Report Viewer">
      <div className="viewer-toolbar-group">
        <span className="viewer-toolbar-label">Export</span>
        {EXPORT_FORMATS.map(({ format, label }) => (
          <button
            key={format}
            type="button"
            disabled={busyFormat !== null}
            onClick={() => void handleExport(format)}
          >
            {busyFormat === format ? `Exporting ${label}…` : label}
          </button>
        ))}
      </div>
      <div className="viewer-toolbar-group">
        <button type="button" onClick={handlePrint}>
          Print
        </button>
      </div>
    </div>
  )
}
