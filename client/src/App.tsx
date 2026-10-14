import { useEffect, useState } from 'react'
import { CatalogBrowser } from './CatalogBrowser'
import './App.css'

type HealthResponse = {
  status: string
}

type ApiStatus = 'loading' | 'ok' | 'error'

function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('loading')
  const [detail, setDetail] = useState('Checking API…')

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

  return (
    <main className="shell">
      <h1>SSRS Report Viewer</h1>
      <p className="lede">Browse the Catalog for Folders and Reports. Viewing a Report is a later ticket.</p>
      <p className={`status status-${apiStatus}`} role="status">
        {detail}
      </p>
      {apiStatus === 'ok' && <CatalogBrowser />}
    </main>
  )
}

export default App
