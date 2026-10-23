import { useCallback, useEffect, useState } from 'react'
import { CatalogBrowser } from './features/catalog/CatalogBrowser'
import { ReportSurface, type HtmlReplacedOptions } from './features/action-links'
import { DocumentMapSidebar } from './features/document-map/DocumentMapSidebar'
import { navigateDocumentMap } from './features/document-map/documentMapApi'
import type { FindResponse } from './features/find/findApi'
import { ParameterForm } from './features/view-report/ParameterForm'
import type { ExecutionParameterSeed } from './features/view-report/executionParameterSeed'
import { ViewerToolbar } from './features/zoom-page/ViewerToolbar'
import {
  API_UNAVAILABLE_COPY,
  isApiUnreachableError,
  isViewerSessionExpiredError,
} from './shared/api/sessionHttp'
import type { RenderResponse } from './shared/api/sessionTypes'
import {
  buildReportPathSearch,
  openReportPathDiffers,
  readReportPathFromSearch,
  viewerModeFromReportPath,
} from './reportPathUrl'
import './App.css'

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
  const [parametersExpanded, setParametersExpanded] = useState(true)
  const [maximized, setMaximized] = useState(false)
  const [documentMapCurrentId, setDocumentMapCurrentId] = useState<string | null>(null)

  const checkHealth = useCallback(async (options?: { isCancelled?: () => boolean }) => {
    const isCancelled = options?.isCancelled ?? (() => false)
    setApiStatus('loading')
    setDetail('Checking API…')
    try {
      const response = await fetch('/api/health')
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      await response.json()
      if (isCancelled()) {
        return
      }
      setApiStatus('ok')
      setDetail('API available')
    } catch {
      if (isCancelled()) {
        return
      }
      setApiStatus('error')
      setDetail(API_UNAVAILABLE_COPY)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void checkHealth({ isCancelled: () => cancelled })
    return () => {
      cancelled = true
    }
  }, [checkHealth])

  const clearSurface = useCallback(() => {
    setRender(null)
    setSurfaceError(null)
    setBusy(false)
    setExecutionSeed(null)
    setParametersExpanded(true)
    setMaximized(false)
    setDocumentMapCurrentId(null)
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined)
    }
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
    setDocumentMapCurrentId(null)
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
      documentMapVisible: render.documentMapVisible,
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
      // Collapse when Action Link carried params (rc:Parameters=Collapsed); expand when catalog
      // ItemPath opens need Report Parameter prompts.
      setParametersExpanded(options.collapseParameters === false)
    },
    [],
  )

  const handleSurfaceError = useCallback((error: unknown) => {
    if (isViewerSessionExpiredError(error)) {
      setRender(null)
      setBusy(false)
      setParametersExpanded(true)
      setMaximized(false)
      setDocumentMapCurrentId(null)
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined)
      }
      setSurfaceError(error.message)
      return
    }

    if (isApiUnreachableError(error)) {
      setApiStatus('error')
      setDetail(API_UNAVAILABLE_COPY)
      setSurfaceError(null)
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
        setDocumentMapCurrentId(id)
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
  const apiAvailable = apiStatus === 'ok'
  const keepReportChrome = Boolean(render)
  const showMainUi = apiAvailable || keepReportChrome
  const hasSession = Boolean(render?.sessionId)
  const showReportViewBar = !maximized
  const showParameterForm = (!hasSession || parametersExpanded) && !maximized
  const documentMapNodes = render?.documentMap
  const documentMapPresent =
    Array.isArray(documentMapNodes) && documentMapNodes.length > 0
  const documentMapVisible = render?.documentMapVisible ?? true
  const showDocumentMapPane = !maximized && documentMapPresent && documentMapVisible
  const hideStatusInReportMode = reportMode && apiAvailable
  const apiActionsLocked = !apiAvailable

  const shellClass = [
    reportMode ? 'shell shell-report' : 'shell',
    maximized ? 'shell-maximized' : '',
    hasSession ? 'shell-has-session' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const layoutClass = [
    'viewer-layout',
    showDocumentMapPane ? 'viewer-layout-with-map' : 'viewer-layout-report-only',
  ].join(' ')

  return (
    <main className={shellClass}>
      <h1 className={reportMode ? 'visually-hidden no-print' : undefined}>SSRS Report Viewer</h1>
      <p className={reportMode ? 'lede visually-hidden no-print' : 'lede no-print'}>
        Browse the Catalog, enter Report Parameters, View Report, then use Zoom, Report Page, Refresh,
        Find, Drilldown, Sort, Drillthrough, Back, Document Map, Bookmark Action Links, Export, and
        Print.
      </p>
      <p
        className={
          hideStatusInReportMode
            ? `status status-${apiStatus} visually-hidden no-print`
            : `status status-${apiStatus} no-print`
        }
        role="status"
      >
        {detail}
      </p>
      {apiStatus === 'error' && (
        <button type="button" className="no-print" onClick={() => void checkHealth()}>
          Retry
        </button>
      )}
      {showMainUi && (
        <>
          {apiAvailable && mode === 'catalog' && (
            <div className="no-print">
              <CatalogBrowser
                selectedReportPath={selectedReportPath}
                onSelectReport={handleSelectReport}
                onError={handleSurfaceError}
              />
            </div>
          )}
          {reportMode && selectedReportPath && (
            <div className="no-print report-view">
              {showReportViewBar && (
                <div className="report-view-bar">
                  <button type="button" className="return-to-catalog" onClick={handleReturnToCatalog}>
                    Return to Catalog
                  </button>
                  <p className="report-view-path" aria-label="Open Report path">
                    {selectedReportPath}
                  </p>
                  {hasSession &&
                    (parametersExpanded ? (
                      <button
                        type="button"
                        className="hide-parameters"
                        onClick={() => setParametersExpanded(false)}
                      >
                        Hide parameters
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="show-parameters"
                        onClick={() => setParametersExpanded(true)}
                      >
                        Show parameters
                      </button>
                    ))}
                </div>
              )}
              {showParameterForm && (
                <ParameterForm
                  reportPath={selectedReportPath}
                  executionSeed={executionSeed}
                  busy={busy || apiActionsLocked}
                  onBusyChange={setBusy}
                  onViewed={handleViewed}
                  onClearSurface={clearSurface}
                  onReturnToCatalog={handleReturnToCatalog}
                  onError={handleSurfaceError}
                />
              )}
            </div>
          )}
          {render ? (
            <div
              className={layoutClass}
              data-document-map-pane={showDocumentMapPane ? 'true' : 'false'}
            >
              {render.sessionId && (
                <ViewerToolbar
                  sessionId={render.sessionId}
                  reportPath={render.reportPath}
                  pageInfo={render.pageInfo}
                  zoomPercent={render.zoomPercent}
                  busy={busy || apiActionsLocked}
                  canGoBack={render.canGoBack}
                  maximized={maximized}
                  documentMapPresent={documentMapPresent}
                  documentMapVisible={documentMapVisible}
                  onMaximizedChange={setMaximized}
                  onUpdated={handleHtmlReplaced}
                  onFindResult={handleFindResult}
                  onError={handleSurfaceError}
                  onBusyChange={setBusy}
                />
              )}
              {showDocumentMapPane && (
                <div className="no-print viewer-layout-map">
                  <DocumentMapSidebar
                    nodes={documentMapNodes}
                    busy={busy || apiActionsLocked}
                    currentNodeId={documentMapCurrentId}
                    onNavigate={(id) => {
                      void handleDocumentMapNavigate(id)
                    }}
                  />
                </div>
              )}
              <ReportSurface
                html={render.html}
                sessionId={apiAvailable ? render.sessionId : null}
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
