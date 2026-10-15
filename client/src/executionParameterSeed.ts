import type { ParameterSubmission, ReportParameter } from './reportApi'

/** Remount key + Execution parameters used to reseed the parameter bar. */
export type ExecutionParameterSeed = {
  key: number
  reportPath: string
  parameters: ParameterSubmission[]
}

export type SeededParameterForm = {
  values: Record<string, string[]>
  nullChecked: Record<string, boolean>
}

/**
 * Fresh-load form seeding from Report Parameter metadata.
 * Values come only from SSRS defaultValues when present; never invent Boolean false/true.
 * Nullable parameters start with NULL checked.
 */
export function seedFormDefaults(parameters: ReportParameter[]): SeededParameterForm {
  const values: Record<string, string[]> = {}
  const nullChecked: Record<string, boolean> = {}

  for (const parameter of parameters) {
    if (parameter.defaultValues?.length) {
      values[parameter.name] = [...parameter.defaultValues]
    } else {
      values[parameter.name] = parameter.multiValue ? [] : ['']
    }

    if (parameter.nullable) {
      nullChecked[parameter.name] = true
    }
  }

  return { values, nullChecked }
}

/**
 * Reseeds the parameter bar from current Execution parameters (RenderResponse.parameters).
 * Values still start from SSRS defaultValues, then Execution overlays.
 * Unlike fresh-load, nullable nullChecked starts unchecked; only empty applied
 * Execution values mark NULL. Parameters absent from the Execution payload stay unchecked.
 */
export function seedFormFromExecution(
  parameters: ReportParameter[],
  execution: ParameterSubmission[],
): SeededParameterForm {
  const { values } = seedFormDefaults(parameters)
  const nullChecked: Record<string, boolean> = {}
  const byName = new Map(execution.map((entry) => [entry.name, entry.values]))

  for (const parameter of parameters) {
    if (parameter.nullable) {
      nullChecked[parameter.name] = false
    }

    const applied = byName.get(parameter.name)
    if (applied === undefined) {
      continue
    }

    if (parameter.nullable && applied.length === 0) {
      nullChecked[parameter.name] = true
      continue
    }

    values[parameter.name] = [...applied]
    if (parameter.nullable) {
      nullChecked[parameter.name] = false
    }
  }

  return { values, nullChecked }
}

/** After cascading refresh: drop selections that are no longer Valid Values. */
export function mergeCascadedValues(
  parameters: ReportParameter[],
  previous: Record<string, string[]>,
): Record<string, string[]> {
  const next = { ...previous }
  for (const parameter of parameters) {
    const current = next[parameter.name] ?? []
    if (parameter.validValues.length === 0) {
      continue
    }

    const allowed = new Set(parameter.validValues.map((v) => v.value))
    const filtered = current.filter((value) => allowed.has(value))
    if (filtered.length !== current.length) {
      next[parameter.name] = filtered.length > 0 ? filtered : parameter.multiValue ? [] : ['']
    }
  }
  return next
}

/** After cascading refresh: keep tracked flags; newly seen nullable → NULL checked. */
export function mergeCascadedNullChecked(
  parameters: ReportParameter[],
  previous: Record<string, boolean>,
): Record<string, boolean> {
  const next: Record<string, boolean> = {}
  for (const parameter of parameters) {
    if (parameter.nullable) {
      next[parameter.name] = previous[parameter.name] ?? true
    }
  }
  return next
}
