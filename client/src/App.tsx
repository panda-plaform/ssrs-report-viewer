import { useCallback, useEffect, useState } from 'react'
import { CatalogBrowser } from './CatalogBrowser'
import { DocumentMapSidebar } from './DocumentMapSidebar'
import { ParameterForm } from './ParameterForm'
import { ReportSurface } from './ReportSurface'
import { ViewerToolbar } from './ViewerToolbar'
import type { ExecutionParameterSeed } from './executionParameterSeed'
import {
  isViewerSessionExpiredError,
  navigateDocumentMap,
  type FindResponse,
  type RenderResponse,
} from './reportApi'
import type { HtmlReplacedOptions } from './ReportSurface'
import {
  buildReportPathSearch,
  openReportPathDiffers,
  readReportPathFromSearch,
  viewerModeFromReportPath,
} from './reportPathUrl'
import './App.css'

type HealthResponse = {
  status: string
}

type ApiStatus = 'loading' | 'ok' | 'error'

function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('loading')
  const [detail, setDetail] = useState('Checking API…')
  const [selectedReportPath, setSelectedReportPath] = useState<string | null>(() =>
    readReportPathFromSearch(window.location.search),
  )
  const [render, setRender] = useState<RenderResponse | null>(null)
  const [surfaceError, setSurfaceError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [executionSeed, setExecutionSeed] = useState<ExecutionParameterSeed | null>(null)

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
    setExecutionSeed(null)
  }, [])

  const syncFromLocation = useCallback(() => {
    const path = readReportPathFromSearch(window.location.search)
    setSelectedReportPath(path)
    clearSurface()
  }, [clearSurface])

  useEffect(() => {
    function onPopState() {
      syncFromLocation()
    }

    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  }, [syncFromLocation])

  function handleSelectReport(path: string) {
    window.history.pushState({ reportPath: path }, '', buildReportPathSearch(path))
    setSelectedReportPath(path)
    clearSurface()
  }

  function handleReturnToCatalog() {
    // Pop Catalog→Report so browser Back does not re-open the Report.
    // popstate → syncFromLocation clears the report view.
    window.history.back()
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
      zoomPercent: render.zoomPercent,
      documentMap: render.documentMap,
      canGoBack: render.canGoBack,
      reportPath: render.reportPath,
      parameters: render.parameters,
    })
  }

  const handleHtmlReplaced = useCallback(
    (result: RenderResponse, options?: HtmlReplacedOptions) => {
      setSurfaceError(null)
      setRender(result)

      if (!options?.syncOpenReport) {
        return
      }

      if (openReportPathDiffers(window.location.search, result.reportPath)) {
        window.history.replaceState(
          { reportPath: result.reportPath },
          '',
          buildReportPathSearch(result.reportPath),
        )
      }

      setSelectedReportPath(result.reportPath)
      setExecutionSeed((previous) => ({
        key: (previous?.key ?? 0) + 1,
        reportPath: result.reportPath,
        parameters: result.parameters,
      }))
    },
    [],
  )

  const handleSurfaceError = useCallback((error: unknown) => {
    if (isViewerSessionExpiredError(error)) {
      setRender(null)
      setBusy(false)
      setSurfaceError(error.message)
      return
    }

    if (typeof error === 'string') {
      setSurfaceError(error || null)
      return
    }

    setSurfaceError(error instanceof Error ? error.message : null)
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
        handleSurfaceError(err)
      } finally {
        setBusy(false)
      }
    },
    [busy, handleSurfaceError, render?.sessionId],
  )

  const mode = viewerModeFromReportPath(selectedReportPath)
  const reportMode = mode === 'report'

  return (
    <main className={reportMode ? 'shell shell-report' : 'shell'}>
      <h1 className={reportMode ? 'shell-title-quiet no-print' : undefined}>SSRS Report Viewer</h1>
      <p className={reportMode ? 'lede no-print shell-lede-quiet' : 'lede no-print'}>
        Browse the Catalog, enter Report Parameters, View Report, then use Zoom, Report Page, Refresh,
        Find, Drilldown, Sort, Drillthrough, Back, Document Map, Bookmark Action Links, Export, and
        Print.
      </p>
      <p
        className={
          reportMode
            ? `status status-${apiStatus} no-print shell-status-quiet`
            : `status status-${apiStatus} no-print`
        }
        role="status"
      >
        {detail}
      </p>
      {apiStatus === 'ok' && (
        <>
          {mode === 'catalog' && (
            <div className="no-print">
              <CatalogBrowser
                selectedReportPath={selectedReportPath}
                onSelectReport={handleSelectReport}
              />
            </div>
          )}
          {reportMode && selectedReportPath && (
            <div className="no-print report-view">
              <div className="report-view-bar">
                <button type="button" className="return-to-catalog" onClick={handleReturnToCatalog}>
                  Return to Catalog
                </button>
                <p className="report-view-path" aria-label="Open Report path">
                  {selectedReportPath}
                </p>
              </div>
              <ParameterForm
                reportPath={selectedReportPath}
                executionSeed={executionSeed}
                onViewed={handleViewed}
                onClearSurface={clearSurface}
                onReturnToCatalog={handleReturnToCatalog}
              />
              {render?.sessionId && (
                <ViewerToolbar
                  sessionId={render.sessionId}
                  pageInfo={render.pageInfo}
                  zoomPercent={render.zoomPercent}
                  busy={busy}
                  canGoBack={render.canGoBack}
                  onUpdated={handleHtmlReplaced}
                  onFindResult={handleFindResult}
                  onError={handleSurfaceError}
                  onBusyChange={setBusy}
                />
              )}
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
          ) : reportMode ? (
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
          ) : null}
        </>
      )}
    </main>
  )
}

export default App
