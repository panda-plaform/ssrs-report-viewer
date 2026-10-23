import { useEffect, useState } from 'react'
import { isApiUnreachableError } from '../../shared/api/sessionHttp'
import {
  fetchCatalog,
  isCatalogAvailabilityLoss,
  type CatalogItem,
} from './catalogApi'

type LoadState = 'loading' | 'ok' | 'error' | 'unavailable'

const CATALOG_UNAVAILABLE_COPY =
  'Catalog unavailable. The API is up, but the Catalog could not be loaded. Retry.'

type Props = {
  selectedReportPath: string | null
  onSelectReport: (path: string) => void
  onError?: (error: unknown) => void
}

function parentPath(path: string): string | null {
  if (path === '/' || path === '') {
    return null
  }

  const trimmed = path.replace(/\/+$/, '')
  const slash = trimmed.lastIndexOf('/')
  if (slash <= 0) {
    return '/'
  }

  return trimmed.slice(0, slash)
}

export function CatalogBrowser({ selectedReportPath, onSelectReport, onError }: Props) {
  const [path, setPath] = useState('/')
  const [folders, setFolders] = useState<CatalogItem[]>([])
  const [reports, setReports] = useState<CatalogItem[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoadState('loading')
      setError(null)

      try {
        const catalog = await fetchCatalog(path)
        if (!cancelled) {
          setFolders(catalog.folders)
          setReports(catalog.reports)
          setLoadState('ok')
        }
      } catch (err) {
        if (!cancelled) {
          if (isApiUnreachableError(err)) {
            onError?.(err)
            return
          }
          setFolders([])
          setReports([])
          if (isCatalogAvailabilityLoss(err)) {
            setLoadState('unavailable')
            setError(null)
          } else {
            setLoadState('error')
            setError(err instanceof Error ? err.message : 'Failed to load Catalog')
          }
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [path, reloadKey, onError])

  const up = parentPath(path)

  return (
    <section className="catalog" aria-labelledby="catalog-heading">
      <header className="catalog-header">
        <h2 id="catalog-heading">Catalog</h2>
        <p className="catalog-path" aria-label="Current folder path">
          {path}
        </p>
      </header>

      <div className="catalog-toolbar">
        <button type="button" disabled={up === null} onClick={() => up && setPath(up)}>
          Up
        </button>
      </div>

      {loadState === 'loading' && (
        <p className="catalog-status" role="status">
          Loading Catalog…
        </p>
      )}

      {loadState === 'unavailable' && (
        <p className="catalog-status catalog-error" role="alert">
          {CATALOG_UNAVAILABLE_COPY}{' '}
          <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
            Retry
          </button>
        </p>
      )}

      {loadState === 'error' && (
        <p className="catalog-status catalog-error" role="alert">
          {error}
        </p>
      )}

      {loadState === 'ok' && (
        <ul className="catalog-list">
          {folders.map((folder) => (
            <li key={folder.path}>
              <button type="button" className="catalog-item folder" onClick={() => setPath(folder.path)}>
                <span className="catalog-item-kind">Folder</span>
                <span className="catalog-item-name">{folder.name}</span>
              </button>
            </li>
          ))}
          {reports.map((report) => (
            <li key={report.path}>
              <button
                type="button"
                className={
                  selectedReportPath === report.path
                    ? 'catalog-item report selected'
                    : 'catalog-item report'
                }
                onClick={() => onSelectReport(report.path)}
              >
                <span className="catalog-item-kind">Report</span>
                <span className="catalog-item-name">{report.name}</span>
              </button>
            </li>
          ))}
          {folders.length === 0 && reports.length === 0 && (
            <li className="catalog-empty">This folder is empty.</li>
          )}
        </ul>
      )}

      <p className="catalog-selection" role="status">
        {selectedReportPath
          ? `Selected Report: ${selectedReportPath}`
          : 'Select a Report to enter parameters and View Report.'}
      </p>
    </section>
  )
}
