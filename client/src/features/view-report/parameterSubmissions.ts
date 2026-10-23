import type { ParameterSubmission, ReportParameter } from './viewReportApi'

/** Builds View Report / cascade submissions; NULL-checked params omit values. */
export function toParameterSubmissions(
  parameters: ReportParameter[],
  values: Record<string, string[]>,
  nullChecked: Record<string, boolean> = {},
): ParameterSubmission[] {
  const submissions: ParameterSubmission[] = []

  for (const parameter of parameters) {
    if (nullChecked[parameter.name]) {
      submissions.push({ name: parameter.name, values: [] })
      continue
    }

    const filled = (values[parameter.name] ?? []).filter((value) => value.trim().length > 0)
    if (filled.length > 0) {
      submissions.push({ name: parameter.name, values: filled })
      continue
    }

    // Empty non-nullable: prefer defaults; otherwise omit so LoadReport defaults stay intact.
    // Sending [] is SSRS NULL and clears non-nullable parameters (e.g. Boolean Enabled).
    if (parameter.nullable) {
      submissions.push({ name: parameter.name, values: [] })
      continue
    }

    if (parameter.defaultValues?.length) {
      submissions.push({ name: parameter.name, values: [...parameter.defaultValues] })
    }
  }

  return submissions
}
