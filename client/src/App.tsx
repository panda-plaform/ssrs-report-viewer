import { useCallback, useState } from 'react'
import { CatalogBrowser } from './CatalogBrowser'
import { ParameterForm } from './ParameterForm'
import { ReportSurface } from './ReportSurface'
import { ViewerToolbar } from './ViewerToolbar'
import type { RenderResponse } from './reportApi'
import './App.css'

function App() {
  const [selectedReportPath, setSelectedReportPath] = useState<string | null>(null)
  const [render, setRender] = useState<RenderResponse | null>(null)
  const [surfaceError, setSurfaceError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const clearSurface = useCallback(() => {
    setRender(null)
    setSurfaceError(null)
    setBusy(false)
  }, [])

  function handleSelectReport(path: string) {
    setSelectedReportPath(path)
    clearSurface()
  }

  function handleViewed(result: RenderResponse) {
    setSurfaceError(null)
    setRender(result)
  }

  return (
    <main className="shell">
      <h1>SSRS Report Viewer</h1>
      <p className="lede">
        Browse the Catalog, enter Report Parameters, View Report, then use Zoom, Report Page, and
        Refresh on the Viewer Session.
      </p>
      <CatalogBrowser
        selectedReportPath={selectedReportPath}
        onSelectReport={handleSelectReport}
      />
      {selectedReportPath && (
        <ParameterForm
          reportPath={selectedReportPath}
          onViewed={handleViewed}
          onClearSurface={clearSurface}
        />
      )}
      {render && (
        <ViewerToolbar
          sessionId={render.sessionId}
          pageInfo={render.pageInfo}
          zoomPercent={render.zoomPercent}
          busy={busy}
          onUpdated={setRender}
          onError={(message) => setSurfaceError(message || null)}
          onBusyChange={setBusy}
        />
      )}
      <ReportSurface
        html={render?.html ?? null}
        sessionId={render?.sessionId ?? null}
        error={surfaceError}
      />
    </main>
  )
}

export default App
