import { describe, expect, it } from 'vitest'
import type { ReportParameter } from './reportApi'
import { toParameterSubmissions } from './parameterSubmissions'

function param(overrides: Partial<ReportParameter> & Pick<ReportParameter, 'name'>): ReportParameter {
  return {
    dataType: 'String',
    nullable: false,
    multiValue: false,
    required: false,
    prompt: null,
    defaultValues: [],
    validValues: [],
    dependencies: [],
    ...overrides,
  }
}

describe('toParameterSubmissions', () => {
  it('omits values for NULL-checked nullable Report Parameters', () => {
    const parameters = [
      param({ name: 'Region', nullable: true }),
      param({ name: 'Year', nullable: false }),
    ]
    const values = {
      Region: ['West'],
      Year: ['2024'],
    }
    const nullChecked = { Region: true }

    expect(toParameterSubmissions(parameters, values, nullChecked)).toEqual([
      { name: 'Region', values: [] },
      { name: 'Year', values: ['2024'] },
    ])
  })

  it('includes values when NULL is not checked', () => {
    const parameters = [param({ name: 'Region', nullable: true })]
    const values = { Region: ['West'] }

    expect(toParameterSubmissions(parameters, values, { Region: false })).toEqual([
      { name: 'Region', values: ['West'] },
    ])
  })

  it('filters blank entries when submitting non-null values', () => {
    const parameters = [param({ name: 'Tags', multiValue: true })]
    const values = { Tags: ['a', '  ', 'b'] }

    expect(toParameterSubmissions(parameters, values, {})).toEqual([
      { name: 'Tags', values: ['a', 'b'] },
    ])
  })

  it('submits selected multi-value Valid Values without Select All chrome labels', () => {
    const parameters = [
      param({
        name: 'Tags',
        multiValue: true,
        validValues: [
          { label: 'Alpha', value: 'a' },
          { label: 'Beta', value: 'b' },
          { label: 'Gamma', value: 'c' },
        ],
      }),
    ]
    const values = { Tags: ['a', 'c'] }

    const submissions = toParameterSubmissions(parameters, values, {})

    expect(submissions).toEqual([{ name: 'Tags', values: ['a', 'c'] }])
    expect(submissions[0]?.values).not.toContain('(Select All)')
  })

  it('submits empty values for NULL-checked multi-value parameters', () => {
    const parameters = [
      param({
        name: 'Tags',
        multiValue: true,
        nullable: true,
        validValues: [
          { label: 'Alpha', value: 'a' },
          { label: 'Beta', value: 'b' },
        ],
      }),
    ]
    const values = { Tags: ['a', 'b'] }

    expect(toParameterSubmissions(parameters, values, { Tags: true })).toEqual([
      { name: 'Tags', values: [] },
    ])
  })

  it('uses defaults for blank non-nullable parameters instead of submitting NULL', () => {
    const parameters = [
      param({ name: 'Enabled', dataType: 'Boolean', defaultValues: ['true'] }),
    ]
    const values = { Enabled: [''] }

    expect(toParameterSubmissions(parameters, values, {})).toEqual([
      { name: 'Enabled', values: ['true'] },
    ])
  })

  it('omits blank non-nullable parameters that have no defaults', () => {
    const parameters = [param({ name: 'Enabled', dataType: 'Boolean' })]
    const values = { Enabled: [''] }

    expect(toParameterSubmissions(parameters, values, {})).toEqual([])
  })

  it('submits empty values for nullable NULL-checked parameters even when defaults exist', () => {
    const parameters = [
      param({ name: 'Region', nullable: true, defaultValues: ['East'] }),
    ]

    expect(toParameterSubmissions(parameters, { Region: ['East'] }, { Region: true })).toEqual([
      { name: 'Region', values: [] },
    ])
  })
})
