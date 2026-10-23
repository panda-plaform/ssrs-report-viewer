import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { isApiUnreachableError } from '../../shared/api/sessionHttp'
import {
  mergeCascadedNullChecked,
  mergeCascadedValues,
  seedFormDefaults,
  seedFormFromExecution,
  type ExecutionParameterSeed,
} from './executionParameterSeed'
import { readDocumentMapVisibilityPreference } from '../document-map/documentMapVisibilityPreference'
import {
  fetchParameters,
  viewReport,
  type ReportParameter,
  type RenderResponse,
} from './viewReportApi'
import { toParameterSubmissions } from './parameterSubmissions'
import { toDateInputValue } from './datetimeLocal'
import {
  SELECT_ALL_LABEL,
  applySelectAll,
  selectAllCheckboxState,
  selectedLabelsSummary,
} from './selectAllMultiValue'
import { cascadeFingerprint } from './cascadeFingerprint'

type LoadState = 'idle' | 'loading' | 'ok' | 'error'

type Props = {
  reportPath: string
  executionSeed?: ExecutionParameterSeed | null
  busy?: boolean
  onBusyChange?: (busy: boolean) => void
  onViewed: (result: RenderResponse) => void
  onClearSurface: () => void
  onReturnToCatalog?: () => void
  onError?: (error: unknown) => void
}

export function ParameterForm({
  reportPath,
  executionSeed = null,
  busy = false,
  onBusyChange,
  onViewed,
  onClearSurface,
  onReturnToCatalog,
  onError,
}: Props) {
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [parameters, setParameters] = useState<ReportParameter[]>([])
  const [values, setValues] = useState<Record<string, string[]>>({})
  const [nullChecked, setNullChecked] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const formBusy = busy || submitting
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
          if (isApiUnreachableError(err)) {
            onError?.(err)
            return
          }
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
  }, [reportPath, onError])

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
    () => cascadeFingerprint(parameters, values, nullChecked),
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
          if (isApiUnreachableError(err)) {
            onError?.(err)
            return
          }
          setError(err instanceof Error ? err.message : 'Failed to refresh cascading parameters')
        }
      }
    }

    void refreshCascading()
    return () => {
      cancelled = true
    }
  }, [cascadeKey, loadState, parameters, reportPath, onError])

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
    if (formBusy) {
      return
    }

    setSubmitting(true)
    onBusyChange?.(true)
    setError(null)

    const submissions = toParameterSubmissions(parameters, values, nullChecked)
    const documentMapVisible = readDocumentMapVisibilityPreference(reportPath)

    try {
      const result = await viewReport(reportPath, submissions, documentMapVisible)
      onViewed(result)
    } catch (err) {
      if (isApiUnreachableError(err)) {
        onError?.(err)
      } else {
        onClearSurface()
        setError(err instanceof Error ? err.message : 'View Report failed')
      }
    } finally {
      setSubmitting(false)
      onBusyChange?.(false)
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
            <div className="parameters-strip">
              <p className="parameters-status">This Report has no parameters.</p>
              <div className="parameters-actions">
                <button type="button" disabled={formBusy} onClick={() => void handleViewReport()}>
                  {submitting ? 'Viewing…' : 'View Report'}
                </button>
              </div>
            </div>
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
                  disabled={formBusy}
                  onNullChange={(checked) => setParameterNull(parameter.name, checked)}
                  onSingleChange={(value) => setSingleValue(parameter.name, value)}
                  onMultiChange={(next) => setMultiValues(parameter.name, next)}
                />
              ))}
              <div className="parameters-actions">
                <button type="submit" disabled={formBusy}>
                  {submitting ? 'Viewing…' : 'View Report'}
                </button>
              </div>
            </form>
          )}

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
  disabled?: boolean
  onNullChange: (checked: boolean) => void
  onSingleChange: (value: string) => void
  onMultiChange: (values: string[]) => void
}

function ParameterField({
  parameter,
  values,
  isNull,
  disabled = false,
  onNullChange,
  onSingleChange,
  onMultiChange,
}: FieldProps) {
  const label = parameter.prompt || parameter.name
  const dataType = parameter.dataType.toLowerCase()
  const valueDisabled = disabled || isNull
  const requiredClass = parameter.required ? 'parameter-control--required' : undefined

  let control: ReactNode
  if (parameter.multiValue) {
    control = (
      <MultiValueDropdown
        id={`param-${parameter.name}`}
        label={label}
        validValues={parameter.validValues}
        values={values}
        disabled={valueDisabled}
        required={parameter.required}
        onChange={onMultiChange}
      />
    )
  } else if (dataType === 'boolean') {
    control = (
      <select
        id={`param-${parameter.name}`}
        className={requiredClass}
        value={values[0] ?? ''}
        disabled={valueDisabled}
        onChange={(event) => onSingleChange(event.target.value)}
      >
        <option value="">Select…</option>
        <option value="true">True</option>
        <option value="false">False</option>
      </select>
    )
  } else if (dataType === 'datetime') {
    control = (
      <input
        id={`param-${parameter.name}`}
        className={['parameter-datetime', requiredClass].filter(Boolean).join(' ')}
        type="date"
        value={toDateInputValue(values[0] ?? '')}
        disabled={valueDisabled}
        onChange={(event) => onSingleChange(event.target.value)}
      />
    )
  } else if (parameter.validValues.length > 0) {
    control = (
      <select
        id={`param-${parameter.name}`}
        className={requiredClass}
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
    )
  } else {
    control = (
      <input
        id={`param-${parameter.name}`}
        type="text"
        className={requiredClass}
        value={values[0] ?? ''}
        disabled={valueDisabled}
        onChange={(event) => onSingleChange(event.target.value)}
      />
    )
  }

  return (
    <div className="parameter-field">
      <label className="parameter-label" htmlFor={`param-${parameter.name}`}>
        {label}
        {parameter.required ? ' *' : ''}
      </label>

      <div className="parameter-control">{control}</div>

      <div className="parameter-null-row">
        {parameter.nullable ? (
          <label className="parameter-null">
            <input
              type="checkbox"
              checked={isNull}
              disabled={disabled}
              onChange={(event) => onNullChange(event.target.checked)}
            />
            NULL
          </label>
        ) : null}
      </div>
    </div>
  )
}

type MultiValueDropdownProps = {
  id: string
  label: string
  validValues: ReportParameter['validValues']
  values: string[]
  disabled: boolean
  required?: boolean
  onChange: (values: string[]) => void
}

function MultiValueDropdown({
  id,
  label,
  validValues,
  values,
  disabled,
  required = false,
  onChange,
}: MultiValueDropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const selectAllState = selectAllCheckboxState(validValues, values)
  const summary = selectedLabelsSummary(validValues, values)

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectAllState.indeterminate
    }
  }, [selectAllState.indeterminate])

  useEffect(() => {
    if (!open) {
      return
    }

    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (disabled) {
      setOpen(false)
    }
  }, [disabled])

  function toggleValue(option: string, checked: boolean) {
    const next = checked
      ? [...new Set([...values, option])]
      : values.filter((item) => item !== option)
    onChange(next)
  }

  return (
    <div className="parameter-multivalue-dropdown" ref={rootRef}>
      <button
        type="button"
        id={id}
        className={['parameter-multivalue-trigger', required ? 'parameter-control--required' : undefined]
          .filter(Boolean)
          .join(' ')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="parameter-multivalue-summary">{summary}</span>
        <span className="parameter-multivalue-caret" aria-hidden="true" />
      </button>

      {open && !disabled && (
        <div className="parameter-multivalue-menu" role="listbox" aria-multiselectable="true">
          <label className="parameter-multivalue-option">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={selectAllState.checked}
              onChange={(event) => onChange(applySelectAll(validValues, event.target.checked))}
            />
            {SELECT_ALL_LABEL}
          </label>
          {validValues.map((option) => (
            <label key={option.value} className="parameter-multivalue-option">
              <input
                type="checkbox"
                checked={values.includes(option.value)}
                onChange={(event) => toggleValue(option.value, event.target.checked)}
              />
              {option.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
