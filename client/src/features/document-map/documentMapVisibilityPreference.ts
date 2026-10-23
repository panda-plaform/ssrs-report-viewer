/**
 * Document Map Visibility Preference — durable per Report path in the browser.
 * Restored when a new Viewer Session is created (View Report seed).
 */

const STORAGE_KEY_PREFIX = 'ssrs-report-viewer:document-map-visibility:'

function storageKey(reportPath: string): string {
  return `${STORAGE_KEY_PREFIX}${reportPath}`
}

/** Returns the stored preference, or undefined when none exists for the Report path. */
export function readDocumentMapVisibilityPreference(
  reportPath: string,
): boolean | undefined {
  try {
    const raw = localStorage.getItem(storageKey(reportPath))
    if (raw === 'true') {
      return true
    }
    if (raw === 'false') {
      return false
    }
    return undefined
  } catch {
    return undefined
  }
}

/** Persists Document Map Visibility Preference for the Report path. */
export function writeDocumentMapVisibilityPreference(
  reportPath: string,
  visible: boolean,
): void {
  try {
    localStorage.setItem(storageKey(reportPath), String(visible))
  } catch {
    // Quota / private mode — preference is best-effort.
  }
}
