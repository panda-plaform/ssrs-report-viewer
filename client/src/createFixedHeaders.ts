const RUNTIME_SRC = '/api/ssrs-viewer-assets/fixed-header-runtime.js?v=11'
const CSS_HREF =
  '/api/ssrs-viewer-assets/Microsoft.ReportingServices.Rendering.HtmlRenderer.RendererResources.Html5Renderer.css'

let runtimePromise: Promise<void> | null = null

function ensureCss(): void {
  if (document.querySelector(`link[data-ssrs-fixed-header-css]`)) {
    return
  }

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = CSS_HREF
  link.setAttribute('data-ssrs-fixed-header-css', '1')
  document.head.appendChild(link)
}

function loadRuntime(): Promise<void> {
  if (runtimePromise) {
    return runtimePromise
  }

  runtimePromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[data-ssrs-fixed-header-runtime]',
    ) as HTMLScriptElement | null
    if (existing) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = RUNTIME_SRC
    script.async = true
    script.setAttribute('data-ssrs-fixed-header-runtime', '1')
    script.onload = () => resolve()
    script.onerror = () =>
      reject(new Error('Failed to load CreateFixedHeaders runtime'))
    document.head.appendChild(script)
  })

  return runtimePromise
}

type FixedHeaderWindow = Window & {
  SsrsWireFixedHeaders?: (root?: ParentNode | null) => void
  CreateFixedHeaders?: () => void
}

/**
 * Loads proxied ReportViewer FixedHeader runtime and wires #oReportDiv scroll
 * (CreateFixedHeaders / sticky FixedData fallback).
 */
export async function wireFixedHeaders(root: HTMLElement | null): Promise<void> {
  if (!root) {
    return
  }

  ensureCss()
  try {
    await loadRuntime()
  } catch {
    // Soft-fail: report still usable without freeze.
    return
  }

  const w = window as FixedHeaderWindow
  if (typeof w.SsrsWireFixedHeaders === 'function') {
    w.SsrsWireFixedHeaders(root)
  } else if (typeof w.CreateFixedHeaders === 'function') {
    w.CreateFixedHeaders()
  }
}
