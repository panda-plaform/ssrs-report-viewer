import { useCallback, useEffect, useState } from 'react'
import { CatalogBrowser } from './CatalogBrowser'
import { ParameterForm } from './ParameterForm'
import { ReportSurface } from './ReportSurface'
import { ViewerToolbar } from './ViewerToolbar'
import type { RenderResponse } from './reportApi'
import './App.css'

type HealthResponse = {
  status: string
}

type ApiStatus = 'loading' | 'ok' | 'error'

function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('loading')
  const [detail, setDetail] = useState('Checking API…')
  const [selectedReportPath, setSelectedReportPath] = useState<string | null>(null)
  const [render, setRender] = useState<RenderResponse | null>(null)
  const [surfaceError, setSurfaceError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function checkHealth() {
      try {
        const response = await fetch('/api/health')
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const body = (await response.json()) as HealthResponse
        if (!cancelled) {
          setApiStatus('ok')
          setDetail(`API ${body.status}`)
        }
      } catch (error) {
        if (!cancelled) {
          setApiStatus('error')
          setDetail(
            error instanceof Error
              ? error.message
              : 'Unable to reach API. Is the API running on http://localhost:5201?',
          )
        }
      }
    }

    void checkHealth()
    return () => {
      cancelled = true
    }
  }, [])

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

  const handleHtmlReplaced = useCallback((result: RenderResponse) => {
    setSurfaceError(null)
    setRender(result)
  }, [])

  const handleSurfaceError = useCallback((message: string) => {
    setSurfaceError(message)
  }, [])

  return (
    <main className="shell">
      <h1>SSRS Report Viewer</h1>
      <p className="lede">
        Browse the Catalog, enter Report Parameters, View Report, then use Zoom, Report Page,
        Refresh, Drilldown, and External Links on the Viewer Session.
      </p>
      <p className={`status status-${apiStatus}`} role="status">
        {detail}
      </p>
      {apiStatus === 'ok' && (
        <>
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
              zoomPercent={render.zoomPercent ?? 100}
              busy={busy}
              onUpdated={handleHtmlReplaced}
              onError={handleSurfaceError}
              onBusyChange={setBusy}
            />
          )}
          <ReportSurface
            html={render?.html ?? null}
            sessionId={render?.sessionId ?? null}
            busy={busy}
            error={surfaceError}
            onHtmlReplaced={handleHtmlReplaced}
            onError={handleSurfaceError}
            onBusyChange={setBusy}
          />
        </>
      )}
    </main>
  )
}

export default App
