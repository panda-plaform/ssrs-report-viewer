import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchParameters,
  viewReport,
  type ParameterSubmission,
  type ReportParameter,
  type RenderResponse,
} from './reportApi'

type LoadState = 'idle' | 'loading' | 'ok' | 'error'

type Props = {
  reportPath: string
  onViewed: (result: RenderResponse) => void
  onClearSurface: () => void
  onBackToCatalog?: () => void
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

function toSubmissions(
  parameters: ReportParameter[],
  values: Record<string, string[]>,
): ParameterSubmission[] {
  return parameters.map((parameter) => ({
    name: parameter.name,
    values: (values[parameter.name] ?? []).filter((value) => value.trim().length > 0),
  }))
}

function dependencyFingerprint(
  parameters: ReportParameter[],
  values: Record<string, string[]>,
): string {
  const dependencyNames = new Set(parameters.flatMap((p) => p.dependencies ?? []))
  if (dependencyNames.size === 0) {
    return ''
  }

  return parameters
    .filter((p) => dependencyNames.has(p.name))
    .map((p) => `${p.name}=${(values[p.name] ?? []).join('\u001f')}`)
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
  onViewed,
  onClearSurface,
  onBackToCatalog,
}: Props) {
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [parameters, setParameters] = useState<ReportParameter[]>([])
  const [values, setValues] = useState<Record<string, string[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const skipCascadeRef = useRef(true)
  const valuesRef = useRef(values)
  valuesRef.current = values

  useEffect(() => {
    let cancelled = false
    skipCascadeRef.current = true

    async function load() {
      setLoadState('loading')
      setError(null)

      try {
        const response = await fetchParameters(reportPath)
        if (!cancelled) {
          setParameters(response.parameters)
          setValues(initialValues(response.parameters))
          setLoadState('ok')
        }
      } catch (err) {
        if (!cancelled) {
          setParameters([])
          setValues({})
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

  const cascadeKey = useMemo(
    () => dependencyFingerprint(parameters, values),
    [parameters, values],
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
        const submissions = toSubmissions(parameters, valuesRef.current)
        const response = await fetchParameters(reportPath, submissions)
        if (cancelled) {
          return
        }

        setParameters(response.parameters)
        setValues((current) => mergeCascadedValues(response.parameters, current))
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

  async function handleViewReport() {
    setSubmitting(true)
    setError(null)

    const submissions = toSubmissions(parameters, values)

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
          {onBackToCatalog && (
            <button type="button" className="back-to-catalog" onClick={onBackToCatalog}>
              Back to Catalog
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
  onSingleChange: (value: string) => void
  onMultiToggle: (option: string, checked: boolean) => void
}

function ParameterField({ parameter, values, onSingleChange, onMultiToggle }: FieldProps) {
  const label = parameter.prompt || parameter.name
  const dataType = parameter.dataType.toLowerCase()

  return (
    <div className="parameter-field">
      <label className="parameter-label" htmlFor={`param-${parameter.name}`}>
        {label}
        {parameter.required ? ' *' : ''}
      </label>

      {parameter.multiValue && parameter.validValues.length > 0 ? (
        <fieldset className="parameter-multivalue">
          <legend className="visually-hidden">{label}</legend>
          {parameter.validValues.map((option) => (
            <label key={option.value} className="parameter-check">
              <input
                type="checkbox"
                checked={values.includes(option.value)}
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
          onChange={(event) => onSingleChange(event.target.value)}
        />
      ) : parameter.validValues.length > 0 ? (
        <select
          id={`param-${parameter.name}`}
          value={values[0] ?? ''}
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
          onChange={(event) => onSingleChange(event.target.value)}
        />
      )}
    </div>
  )
}
