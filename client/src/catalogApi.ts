export type CatalogItem = {
  name: string
  path: string
}

export type CatalogResponse = {
  path: string
  folders: CatalogItem[]
  reports: CatalogItem[]
}

export async function fetchCatalog(path: string): Promise<CatalogResponse> {
  const query = new URLSearchParams({ path })
  const response = await fetch(`/api/catalog?${query}`)
  if (!response.ok) {
    let detail = `HTTP ${response.status}`
    try {
      const problem = (await response.json()) as { detail?: string; title?: string }
      detail = problem.detail ?? problem.title ?? detail
    } catch {
      // keep status-based detail
    }
    throw new Error(detail)
  }

  return (await response.json()) as CatalogResponse
}
