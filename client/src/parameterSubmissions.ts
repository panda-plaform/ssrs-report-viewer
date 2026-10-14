import type { ParameterSubmission, ReportParameter } from './reportApi'

/** Builds View Report / cascade submissions; NULL-checked params omit values. */
export function toParameterSubmissions(
  parameters: ReportParameter[],
  values: Record<string, string[]>,
  nullChecked: Record<string, boolean> = {},
): ParameterSubmission[] {
  return parameters.map((parameter) => {
    if (nullChecked[parameter.name]) {
      return { name: parameter.name, values: [] }
    }

    return {
      name: parameter.name,
      values: (values[parameter.name] ?? []).filter((value) => value.trim().length > 0),
    }
  })
}
