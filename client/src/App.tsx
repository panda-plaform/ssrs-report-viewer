import { useCallback, useEffect, useState } from 'react'
import { CatalogBrowser } from './CatalogBrowser'
import { DocumentMapSidebar } from './DocumentMapSidebar'
import { FindToolbar } from './FindToolbar'
import { ParameterForm } from './ParameterForm'
import { ReportSurface } from './ReportSurface'
import { ViewerToolbar } from './ViewerToolbar'
import {
  navigateDocumentMap,
  type FindResponse,
  type RenderResponse,
} from './reportApi'
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
      documentMap: render.documentMap,
    })
  }

  const handleHtmlReplaced = useCallback((result: RenderResponse) => {
    setSurfaceError(null)
    setRender(result)
  }, [])

  const handleSurfaceError = useCallback((message: string) => {
    setSurfaceError(message || null)
  }, [])

  const handleDocumentMapNavigate = useCallback(
    async (id: string) => {
      if (!render?.sessionId || busy) {
        return
      }

      setBusy(true)
      setSurfaceError(null)
      try {
        const next = await navigateDocumentMap(render.sessionId, id)
        setRender(next)
      } catch (err) {
        setSurfaceError(err instanceof Error ? err.message : 'Document Map navigation failed')
      } finally {
        setBusy(false)
      }
    },
    [busy, render?.sessionId],
  )

  return (
    <main className="shell">
      <h1>SSRS Report Viewer</h1>
      <p className="lede no-print">
        Browse the Catalog, enter Report Parameters, View Report, then use Find, Drilldown, Document
        Map, Bookmark Action Links, Export, and Print.
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
          {render ? (
            <div className="viewer-layout">
              <div className="no-print">
                <DocumentMapSidebar
                  nodes={render.documentMap}
                  busy={busy}
                  onNavigate={(id) => {
                    void handleDocumentMapNavigate(id)
                  }}
                />
              </div>
              <ReportSurface
                html={render.html}
                sessionId={render.sessionId}
                pageInfo={render.pageInfo}
                busy={busy}
                error={surfaceError}
                onHtmlReplaced={handleHtmlReplaced}
                onError={handleSurfaceError}
                onBusyChange={setBusy}
              />
            </div>
          ) : (
            <ReportSurface
              html={null}
              sessionId={null}
              pageInfo={null}
              busy={busy}
              error={surfaceError}
              onHtmlReplaced={handleHtmlReplaced}
              onError={handleSurfaceError}
              onBusyChange={setBusy}
            />
          )}
        </>
      )}
    </main>
  )
}

export default App
