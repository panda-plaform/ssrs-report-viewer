import { useCallback, useEffect, useState } from 'react'
import { CatalogBrowser } from './CatalogBrowser'
import { FindToolbar } from './FindToolbar'
import { ParameterForm } from './ParameterForm'
import { ReportSurface } from './ReportSurface'
import { ViewerToolbar } from './ViewerToolbar'
import type { FindResponse, RenderResponse } from './reportApi'
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

  function handleFindResult(result: FindResponse) {
    if (!render) {
      return
    }

    setSurfaceError(null)
    setRender({
      sessionId: render.sessionId,
      html: result.html,
      pageInfo: result.pageInfo,
    })
  }

  const handleHtmlReplaced = useCallback((result: RenderResponse) => {
    setSurfaceError(null)
    setRender(result)
  }, [])

  const handleSurfaceError = useCallback((message: string) => {
    setSurfaceError(message || null)
  }, [])

  return (
    <main className="shell">
      <h1>SSRS Report Viewer</h1>
      <p className="lede no-print">
        Browse the Catalog, enter Report Parameters, View Report, then use Find, Drilldown, Sort,
        External Links, Export, and Print. Export downloads the current Execution; Print uses the
        browser on the HTML surface (PDF Export for high fidelity).
      </p>
      <p className={`status status-${apiStatus} no-print`} role="status">
        {detail}
      </p>
      {apiStatus === 'ok' && (
        <>
          <div className="no-print">
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
          </div>
          {render?.sessionId && (
            <div className="no-print">
              <ViewerToolbar sessionId={render.sessionId} onError={handleSurfaceError} />
              <FindToolbar
                sessionId={render.sessionId}
                busy={busy}
                onResult={handleFindResult}
                onError={setSurfaceError}
                onBusyChange={setBusy}
              />
            </div>
          )}
          <ReportSurface
            html={render?.html ?? null}
            sessionId={render?.sessionId ?? null}
            pageInfo={render?.pageInfo ?? null}
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
