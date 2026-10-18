import type { ReportParameter } from './reportApi'

/**
 * Key for refreshing query-driven Valid Values when parameter values change.
 * Tracks every prompted parameter — not only SSRS Dependencies — because some
 * Reports omit Dependencies even when Valid Values need upstream Values
 * (e.g. User Name after Report Name on Execution Log).
 */
export function cascadeFingerprint(
  parameters: ReportParameter[],
  values: Record<string, string[]>,
  nullChecked: Record<string, boolean>,
): string {
  if (parameters.length === 0) {
    return ''
  }

  return parameters
    .map((parameter) => {
      if (nullChecked[parameter.name]) {
        return `${parameter.name}=__NULL__`
      }
      return `${parameter.name}=${(values[parameter.name] ?? []).join('\u001f')}`
    })
    .join('|')
}
