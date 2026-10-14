import { describe, expect, it } from 'vitest'
import { seedFormFromExecution } from './executionParameterSeed'
import type { ReportParameter } from './reportApi'

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

describe('seedFormFromExecution', () => {
  it('applies Execution parameter values over Report Parameter defaults', () => {
    const parameters = [
      param({ name: 'Region', defaultValues: ['East'] }),
      param({ name: 'Year', defaultValues: ['2023'] }),
    ]

    const seeded = seedFormFromExecution(parameters, [
      { name: 'Region', values: ['West'] },
      { name: 'Year', values: ['2024'] },
    ])

    expect(seeded.values).toEqual({
      Region: ['West'],
      Year: ['2024'],
    })
    expect(seeded.nullChecked).toEqual({})
  })

  it('marks nullable Execution parameters with empty values as NULL', () => {
    const parameters = [
      param({ name: 'Region', nullable: true, defaultValues: ['East'] }),
      param({ name: 'Year', defaultValues: ['2023'] }),
    ]

    const seeded = seedFormFromExecution(parameters, [
      { name: 'Region', values: [] },
      { name: 'Year', values: ['2024'] },
    ])

    expect(seeded.values.Region).toEqual(['East'])
    expect(seeded.nullChecked).toEqual({ Region: true })
    expect(seeded.values.Year).toEqual(['2024'])
  })

  it('keeps defaults for parameters missing from the Execution payload', () => {
    const parameters = [
      param({ name: 'Region', defaultValues: ['East'] }),
      param({ name: 'Year', dataType: 'Boolean' }),
    ]

    const seeded = seedFormFromExecution(parameters, [{ name: 'Region', values: ['West'] }])

    expect(seeded.values).toEqual({
      Region: ['West'],
      Year: ['false'],
    })
  })

  it('seeds multi-value Execution parameters', () => {
    const parameters = [param({ name: 'Tags', multiValue: true, defaultValues: [] })]

    const seeded = seedFormFromExecution(parameters, [
      { name: 'Tags', values: ['a', 'b'] },
    ])

    expect(seeded.values).toEqual({ Tags: ['a', 'b'] })
  })
})
