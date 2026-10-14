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

function defaultValues(parameters: ReportParameter[]): Record<string, string[]> {
  const values: Record<string, string[]> = {}
  for (const parameter of parameters) {
    if (parameter.defaultValues?.length) {
      values[parameter.name] = [...parameter.defaultValues]
    } else if (parameter.dataType === 'Boolean') {
      values[parameter.name] = ['false']
    } else {
      values[parameter.name] = parameter.multiValue ? [] : ['']
    }
  }
  return values
}

function defaultNullChecked(parameters: ReportParameter[]): Record<string, boolean> {
  const flags: Record<string, boolean> = {}
  for (const parameter of parameters) {
    if (parameter.nullable) {
      flags[parameter.name] = false
    }
  }
  return flags
}

/**
 * Reseeds the parameter bar from current Execution parameters (RenderResponse.parameters).
 * Empty values on a nullable parameter mean NULL was applied to the Execution.
 */
export function seedFormFromExecution(
  parameters: ReportParameter[],
  execution: ParameterSubmission[],
): SeededParameterForm {
  const values = defaultValues(parameters)
  const nullChecked = defaultNullChecked(parameters)
  const byName = new Map(execution.map((entry) => [entry.name, entry.values]))

  for (const parameter of parameters) {
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
