import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { API_UNAVAILABLE_COPY } from './shared/api/sessionHttp'

const CATALOG_UNAVAILABLE_COPY =
  'Catalog unavailable. The API is up, but the Catalog could not be loaded. Retry.'

function jsonResponse(body: unknown, init?: { status?: number; ok?: boolean }) {
  const status = init?.status ?? 200
  const ok = init?.ok ?? (status >= 200 && status < 300)
  return {
    ok,
    status,
    json: async () => body,
  }
}

function stubFetchByUrl(handlers: {
  health?: () => PromiseLike<ReturnType<typeof jsonResponse>> | ReturnType<typeof jsonResponse>
  catalog?: (
    url: string,
    init?: RequestInit,
  ) => PromiseLike<ReturnType<typeof jsonResponse>> | ReturnType<typeof jsonResponse>
}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/api/health')) {
      return handlers.health?.() ?? jsonResponse({ status: 'Healthy' })
    }
    if (url.includes('/api/catalog')) {
      return (
        handlers.catalog?.(url, init) ??
        jsonResponse({ path: '/', folders: [], reports: [] })
      )
    }
    throw new Error(`Unexpected fetch URL: ${url}`)
  })
}

function hangUntilAborted(_url: string, init?: RequestInit) {
  return new Promise<ReturnType<typeof jsonResponse>>((_resolve, reject) => {
    const signal = init?.signal
    if (!signal) {
      return
    }
    if (signal.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'))
      return
    }
    signal.addEventListener('abort', () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    })
  })
}

describe('Catalog Availability', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows Catalog unavailable with Retry when Catalog returns HTTP 5xx while API stays available', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetchByUrl({
        catalog: () => jsonResponse({ title: 'Error', detail: 'SSRS fault' }, { status: 500, ok: false }),
      }),
    )

    render(<App />)

    expect(await screen.findByText('API available')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(CATALOG_UNAVAILABLE_COPY)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText(/SSRS fault|HTTP 500/i)).not.toBeInTheDocument()
  })

  it('flips API Availability unavailable when Catalog fetch rejects with a network TypeError', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetchByUrl({
        catalog: () => Promise.reject(new TypeError('Failed to fetch')),
      }),
    )

    render(<App />)

    const unavailable = await screen.findByText(API_UNAVAILABLE_COPY)
    expect(unavailable).toHaveAttribute('role', 'status')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText(CATALOG_UNAVAILABLE_COPY)).not.toBeInTheDocument()
    expect(screen.queryByText(/Failed to fetch/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Catalog' })).not.toBeInTheDocument()
  })

  it('Retry re-fetches the current Catalog folder only', async () => {
    let catalogCalls = 0
    const fetchMock = stubFetchByUrl({
      catalog: () => {
        catalogCalls += 1
        if (catalogCalls === 1) {
          return jsonResponse({ title: 'Error' }, { status: 503, ok: false })
        }
        return jsonResponse({
          path: '/',
          folders: [{ name: 'Sales', path: '/Sales' }],
          reports: [],
        })
      },
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent(CATALOG_UNAVAILABLE_COPY)
    expect(catalogCalls).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('button', { name: /Folder.*Sales/i })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(catalogCalls).toBe(2)
    expect(fetchMock.mock.calls.every((call) => String(call[0]).includes('/api/catalog') || String(call[0]).includes('/api/health'))).toBe(
      true,
    )
    const catalogUrls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/api/catalog'))
    expect(catalogUrls).toHaveLength(2)
    expect(catalogUrls.every((url) => url.includes('path=%2F') || url.includes('path=/'))).toBe(true)
  })

  it('treats Catalog 404 path-not-found as a path error, not Catalog unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetchByUrl({
        catalog: () =>
          jsonResponse(
            { title: 'Not Found', detail: 'Catalog path not found.' },
            { status: 404, ok: false },
          ),
      }),
    )

    render(<App />)

    expect(await screen.findByText('API available')).toBeInTheDocument()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Catalog path not found.')
    expect(alert).not.toHaveTextContent(CATALOG_UNAVAILABLE_COPY)
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

  it('turns Loading Catalog into Catalog unavailable after 15 seconds', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      stubFetchByUrl({
        catalog: hangUntilAborted,
      }),
    )

    render(<App />)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('API available')).toBeInTheDocument()
    expect(screen.getByText('Loading Catalog…')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })

    expect(screen.getByRole('alert')).toHaveTextContent(CATALOG_UNAVAILABLE_COPY)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByText('API available')).toBeInTheDocument()
    expect(screen.queryByText('Loading Catalog…')).not.toBeInTheDocument()
  })
})
