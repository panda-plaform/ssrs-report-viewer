import { useEffect, useMemo, useRef, useState } from 'react'
import {
  mergeCascadedNullChecked,
  mergeCascadedValues,
  seedFormDefaults,
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
            : seedFormDefaults(response.parameters)
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
        setNullChecked((current) => mergeCascadedNullChecked(response.parameters, current))
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

  function setMultiValues(name: string, next: string[]) {
    setValues((current) => ({ ...current, [name]: next }))
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
                  onMultiChange={(next) => setMultiValues(parameter.name, next)}
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
  onMultiChange: (values: string[]) => void
}

function ParameterField({
  parameter,
  values,
  isNull,
  onNullChange,
  onSingleChange,
  onMultiChange,
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
        <select
          id={`param-${parameter.name}`}
          className="parameter-multivalue"
          multiple
          value={values}
          disabled={valueDisabled}
          onChange={(event) => {
            const selected = Array.from(event.target.selectedOptions, (option) => option.value)
            onMultiChange(selected)
          }}
        >
          {parameter.validValues.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : dataType === 'boolean' ? (
        <select
          id={`param-${parameter.name}`}
          value={values[0] ?? ''}
          disabled={valueDisabled}
          onChange={(event) => onSingleChange(event.target.value)}
        >
          <option value="">Select…</option>
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
