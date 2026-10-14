import { useEffect, useMemo, useRef, useState } from 'react'
import {
  seedFormFromExecution,
  type ExecutionParameterSeed,
} from './executionParameterSeed'
import {
  fetchParameters,
  viewReport,
  type ReportParameter,
  type RenderResponse,
} from './reportApi'
import { toParameterSubmissions } from './parameterSubmissions'

type LoadState = 'idle' | 'loading' | 'ok' | 'error'

type Props = {
  reportPath: string
  executionSeed?: ExecutionParameterSeed | null
  onViewed: (result: RenderResponse) => void
  onClearSurface: () => void
  onReturnToCatalog?: () => void
}

function initialValues(parameters: ReportParameter[]): Record<string, string[]> {
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

function initialNullChecked(parameters: ReportParameter[]): Record<string, boolean> {
  const flags: Record<string, boolean> = {}
  for (const parameter of parameters) {
    if (parameter.nullable) {
      flags[parameter.name] = false
    }
  }
  return flags
}

function dependencyFingerprint(
  parameters: ReportParameter[],
  values: Record<string, string[]>,
  nullChecked: Record<string, boolean>,
): string {
  const dependencyNames = new Set(parameters.flatMap((p) => p.dependencies ?? []))
  if (dependencyNames.size === 0) {
    return ''
  }

  return parameters
    .filter((p) => dependencyNames.has(p.name))
    .map((p) => {
      if (nullChecked[p.name]) {
        return `${p.name}=__NULL__`
      }
      return `${p.name}=${(values[p.name] ?? []).join('\u001f')}`
    })
    .join('|')
}

function mergeCascadedValues(
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

export function ParameterForm({
  reportPath,
  executionSeed = null,
  onViewed,
  onClearSurface,
  onReturnToCatalog,
}: Props) {
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [parameters, setParameters] = useState<ReportParameter[]>([])
  const [values, setValues] = useState<Record<string, string[]>>({})
  const [nullChecked, setNullChecked] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const skipCascadeRef = useRef(true)
  const valuesRef = useRef(values)
  const nullCheckedRef = useRef(nullChecked)
  const executionSeedRef = useRef(executionSeed)
  const appliedSeedKeyRef = useRef<number | null>(null)

  useEffect(() => {
    valuesRef.current = values
    nullCheckedRef.current = nullChecked
  }, [values, nullChecked])

  useEffect(() => {
    executionSeedRef.current = executionSeed
  }, [executionSeed])

  useEffect(() => {
    let cancelled = false
    skipCascadeRef.current = true
    appliedSeedKeyRef.current = null

    async function load() {
      setLoadState('loading')
      setError(null)

      try {
        const response = await fetchParameters(reportPath)
        if (!cancelled) {
          const seed = executionSeedRef.current
          const useSeed = seed !== null && seed.reportPath === reportPath
          const seeded = useSeed
            ? seedFormFromExecution(response.parameters, seed.parameters)
            : {
                values: initialValues(response.parameters),
                nullChecked: initialNullChecked(response.parameters),
              }
          setParameters(response.parameters)
          setValues(seeded.values)
          setNullChecked(seeded.nullChecked)
          appliedSeedKeyRef.current = useSeed ? seed.key : null
          setLoadState('ok')
        }
      } catch (err) {
        if (!cancelled) {
          setParameters([])
          setValues({})
          setNullChecked({})
          setLoadState('error')
          setError(err instanceof Error ? err.message : 'Failed to load Report Parameters')
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [reportPath])

  useEffect(() => {
    if (loadState !== 'ok' || !executionSeed || executionSeed.reportPath !== reportPath) {
      return
    }

    if (appliedSeedKeyRef.current === executionSeed.key) {
      return
    }

    skipCascadeRef.current = true
    const seeded = seedFormFromExecution(parameters, executionSeed.parameters)
    setValues(seeded.values)
    setNullChecked(seeded.nullChecked)
    appliedSeedKeyRef.current = executionSeed.key
  }, [executionSeed, loadState, parameters, reportPath])

  const cascadeKey = useMemo(
    () => dependencyFingerprint(parameters, values, nullChecked),
    [parameters, values, nullChecked],
  )

  useEffect(() => {
    if (loadState !== 'ok' || !cascadeKey) {
      return
    }

    if (skipCascadeRef.current) {
      skipCascadeRef.current = false
      return
    }

    let cancelled = false

    async function refreshCascading() {
      try {
        const submissions = toParameterSubmissions(
          parameters,
          valuesRef.current,
          nullCheckedRef.current,
        )
        const response = await fetchParameters(reportPath, submissions)
        if (cancelled) {
          return
        }

        setParameters(response.parameters)
        setValues((current) => mergeCascadedValues(response.parameters, current))
        setNullChecked((current) => {
          const next = { ...current }
          for (const parameter of response.parameters) {
            if (parameter.nullable) {
              next[parameter.name] ??= false
            } else {
              delete next[parameter.name]
            }
          }
          return next
        })
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to refresh cascading parameters')
        }
      }
    }

    void refreshCascading()
    return () => {
      cancelled = true
    }
  }, [cascadeKey, loadState, parameters, reportPath])

  function setSingleValue(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: [value] }))
  }

  function toggleMultiValue(name: string, option: string, checked: boolean) {
    setValues((current) => {
      const existing = current[name] ?? []
      const next = checked
        ? [...new Set([...existing, option])]
        : existing.filter((item) => item !== option)
      return { ...current, [name]: next }
    })
  }

  function setParameterNull(name: string, isNull: boolean) {
    setNullChecked((current) => ({ ...current, [name]: isNull }))
  }

  async function handleViewReport() {
    setSubmitting(true)
    setError(null)

    const submissions = toParameterSubmissions(parameters, values, nullChecked)

    try {
      const result = await viewReport(reportPath, submissions)
      onViewed(result)
    } catch (err) {
      onClearSurface()
      setError(err instanceof Error ? err.message : 'View Report failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="parameters parameters-bar" aria-labelledby="parameters-heading">
      <header className="parameters-header">
        <h2 id="parameters-heading">Report Parameters</h2>
      </header>

      {loadState === 'loading' && (
        <p className="parameters-status" role="status">
          Loading parameters…
        </p>
      )}

      {loadState === 'error' && (
        <div className="parameters-load-error" role="alert">
          <p className="parameters-status parameters-error">{error}</p>
          {onReturnToCatalog && (
            <button type="button" className="return-to-catalog" onClick={onReturnToCatalog}>
              Return to Catalog
            </button>
          )}
        </div>
      )}

      {loadState === 'ok' && (
        <>
          {parameters.length === 0 ? (
            <p className="parameters-status">This Report has no parameters.</p>
          ) : (
            <form
              className="parameters-form"
              onSubmit={(event) => {
                event.preventDefault()
                void handleViewReport()
              }}
            >
              {parameters.map((parameter) => (
                <ParameterField
                  key={parameter.name}
                  parameter={parameter}
                  values={values[parameter.name] ?? []}
                  isNull={Boolean(nullChecked[parameter.name])}
                  onNullChange={(checked) => setParameterNull(parameter.name, checked)}
                  onSingleChange={(value) => setSingleValue(parameter.name, value)}
                  onMultiToggle={(option, checked) =>
                    toggleMultiValue(parameter.name, option, checked)
                  }
                />
              ))}
            </form>
          )}

          <div className="parameters-actions">
            <button type="button" disabled={submitting} onClick={() => void handleViewReport()}>
              {submitting ? 'Viewing…' : 'View Report'}
            </button>
          </div>

          {error && (
            <p className="parameters-status parameters-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  )
}

type FieldProps = {
  parameter: ReportParameter
  values: string[]
  isNull: boolean
  onNullChange: (checked: boolean) => void
  onSingleChange: (value: string) => void
  onMultiToggle: (option: string, checked: boolean) => void
}

function ParameterField({
  parameter,
  values,
  isNull,
  onNullChange,
  onSingleChange,
  onMultiToggle,
}: FieldProps) {
  const label = parameter.prompt || parameter.name
  const dataType = parameter.dataType.toLowerCase()
  const valueDisabled = isNull

  return (
    <div className="parameter-field">
      <label className="parameter-label" htmlFor={`param-${parameter.name}`}>
        {label}
        {parameter.required ? ' *' : ''}
      </label>

      {parameter.multiValue && parameter.validValues.length > 0 ? (
        <fieldset className="parameter-multivalue" disabled={valueDisabled}>
          <legend className="visually-hidden">{label}</legend>
          {parameter.validValues.map((option) => (
            <label key={option.value} className="parameter-check">
              <input
                type="checkbox"
                checked={values.includes(option.value)}
                disabled={valueDisabled}
                onChange={(event) => onMultiToggle(option.value, event.target.checked)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      ) : dataType === 'boolean' ? (
        <select
          id={`param-${parameter.name}`}
          value={values[0] ?? 'false'}
          disabled={valueDisabled}
          onChange={(event) => onSingleChange(event.target.value)}
        >
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      ) : dataType === 'datetime' ? (
        <input
          id={`param-${parameter.name}`}
          type="date"
          value={values[0] ?? ''}
          disabled={valueDisabled}
          onChange={(event) => onSingleChange(event.target.value)}
        />
      ) : parameter.validValues.length > 0 ? (
        <select
          id={`param-${parameter.name}`}
          value={values[0] ?? ''}
          disabled={valueDisabled}
          onChange={(event) => onSingleChange(event.target.value)}
        >
          <option value="">Select…</option>
          {parameter.validValues.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={`param-${parameter.name}`}
          type="text"
          value={values[0] ?? ''}
          disabled={valueDisabled}
          onChange={(event) => onSingleChange(event.target.value)}
        />
      )}

      {parameter.nullable && (
        <label className="parameter-null">
          <input
            type="checkbox"
            checked={isNull}
            onChange={(event) => onNullChange(event.target.checked)}
          />
          NULL
        </label>
      )}
    </div>
  )
}
