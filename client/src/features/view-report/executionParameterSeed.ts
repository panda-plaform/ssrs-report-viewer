import type { ParameterSubmission, ReportParameter } from './viewReportApi'

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

/** Non-blank SSRS defaults; multi-value defaults wait until Valid Values are present. */
export function meaningfulDefaultValues(parameter: ReportParameter): string[] {
  const raw = (parameter.defaultValues ?? []).filter((value) => value.trim().length > 0)
  if (raw.length === 0) {
    return []
  }

  if (parameter.validValues.length === 0) {
    // Native leaves multi-value faces blank until options load; scalars (DateTime) still apply.
    return parameter.multiValue ? [] : raw
  }

  const allowed = new Set(parameter.validValues.map((option) => option.value))
  return raw.filter((value) => allowed.has(value))
}

/**
 * Fresh-load form seeding from Report Parameter metadata.
 * Values come only from SSRS defaultValues when present; never invent Boolean false/true.
 * Nullable NULL matches native SSRS: checked when there are no meaningful defaultValues
 * (blank `[""]` from SSRS counts as no default, e.g. End Date).
 */
export function seedFormDefaults(parameters: ReportParameter[]): SeededParameterForm {
  const values: Record<string, string[]> = {}
  const nullChecked: Record<string, boolean> = {}

  for (const parameter of parameters) {
    const defaults = meaningfulDefaultValues(parameter)
    const hasDefaults = defaults.length > 0
    if (hasDefaults) {
      values[parameter.name] = [...defaults]
    } else {
      values[parameter.name] = parameter.multiValue ? [] : ['']
    }

    if (parameter.nullable) {
      // Blank SSRS defaults (e.g. EndDate `[""]`) mean NULL, not an empty string value.
      const hasMeaningfulSsrsDefaults = (parameter.defaultValues ?? []).some(
        (value) => value.trim().length > 0,
      )
      nullChecked[parameter.name] = !hasMeaningfulSsrsDefaults
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

/** After cascading refresh: drop selections that are no longer Valid Values; re-apply defaults. */
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
    let filtered = current.filter((value) => allowed.has(value))
    if (filtered.length === 0) {
      filtered = meaningfulDefaultValues(parameter)
    }
    const fallback = parameter.multiValue ? [] : ['']
    const resolved = filtered.length > 0 ? filtered : fallback
    if (
      resolved.length !== current.length ||
      resolved.some((value, index) => value !== current[index])
    ) {
      next[parameter.name] = resolved
    }
  }
  return next
}

/** After cascading refresh: keep tracked flags; newly seen nullable follows SSRS defaults. */
export function mergeCascadedNullChecked(
  parameters: ReportParameter[],
  previous: Record<string, boolean>,
): Record<string, boolean> {
  const next: Record<string, boolean> = {}
  for (const parameter of parameters) {
    if (parameter.nullable) {
      const hasMeaningfulSsrsDefaults = (parameter.defaultValues ?? []).some(
        (value) => value.trim().length > 0,
      )
      next[parameter.name] = previous[parameter.name] ?? !hasMeaningfulSsrsDefaults
    }
  }
  return next
}
