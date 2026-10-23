export type CatalogItem = {
  name: string
  path: string
}

export type CatalogResponse = {
  path: string
  folders: CatalogItem[]
  reports: CatalogItem[]
}

export class CatalogRequestError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'CatalogRequestError'
    this.status = status
  }
}

export class CatalogTimeoutError extends Error {
  constructor() {
    super('Catalog request timed out')
    this.name = 'CatalogTimeoutError'
  }
}

const CATALOG_LOAD_TIMEOUT_MS = 15_000

export function isCatalogAvailabilityLoss(error: unknown): boolean {
  if (error instanceof CatalogTimeoutError) {
    return true
  }
  return error instanceof CatalogRequestError && error.status >= 500
}

export async function fetchCatalog(path: string): Promise<CatalogResponse> {
  const query = new URLSearchParams({ path })
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), CATALOG_LOAD_TIMEOUT_MS)

  try {
    const response = await fetch(`/api/catalog?${query}`, { signal: controller.signal })
    if (!response.ok) {
      let detail = `HTTP ${response.status}`
      try {
        const problem = (await response.json()) as { detail?: string; title?: string }
        detail = problem.detail ?? problem.title ?? detail
      } catch {
        // keep status-based detail
      }
      throw new CatalogRequestError(response.status, detail)
    }

    return (await response.json()) as CatalogResponse
  } catch (error) {
    if (error instanceof CatalogRequestError) {
      throw error
    }
    if (
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      throw new CatalogTimeoutError()
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
