import { describe, expect, it } from 'vitest'
import {
  mergeCascadedNullChecked,
  seedFormDefaults,
  seedFormFromExecution,
} from './executionParameterSeed'
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

describe('seedFormDefaults', () => {
  it('checks NULL for nullable parameters only when SSRS provides no defaultValues', () => {
    const parameters = [
      param({ name: 'StartDate', nullable: true, defaultValues: ['2026-10-14T22:25:13'] }),
      param({ name: 'EndDate', nullable: true }),
      param({ name: 'Year', nullable: false, defaultValues: ['2023'] }),
    ]

    const seeded = seedFormDefaults(parameters)

    expect(seeded.nullChecked).toEqual({ StartDate: false, EndDate: true })
    expect(seeded.values.StartDate).toEqual(['2026-10-14T22:25:13'])
    expect(seeded.values.EndDate).toEqual([''])
  })

  it('does not invent Boolean false when SSRS provides no defaultValues', () => {
    const parameters = [
      param({ name: 'Enabled', dataType: 'Boolean' }),
      param({ name: 'Flag', dataType: 'Boolean', defaultValues: ['true'] }),
      param({ name: 'Tags', multiValue: true }),
      param({ name: 'Region' }),
    ]

    const seeded = seedFormDefaults(parameters)

    expect(seeded.values).toEqual({
      Enabled: [''],
      Flag: ['true'],
      Tags: [],
      Region: [''],
    })
  })
})

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
      Year: [''],
    })
  })

  it('keeps nullable missing from Execution seed unchecked with defaultValues', () => {
    const parameters = [
      param({ name: 'Region', nullable: true, defaultValues: ['East'] }),
      param({ name: 'Optional', nullable: true, defaultValues: ['Maybe'] }),
      param({ name: 'Year', defaultValues: ['2023'] }),
    ]

    const seeded = seedFormFromExecution(parameters, [
      { name: 'Region', values: ['West'] },
      { name: 'Year', values: ['2024'] },
    ])

    expect(seeded.values).toEqual({
      Region: ['West'],
      Optional: ['Maybe'],
      Year: ['2024'],
    })
    expect(seeded.nullChecked).toEqual({
      Region: false,
      Optional: false,
    })
  })

  it('unchecks NULL when Execution applied concrete values to a nullable parameter', () => {
    const parameters = [param({ name: 'Region', nullable: true, defaultValues: ['East'] })]

    const seeded = seedFormFromExecution(parameters, [{ name: 'Region', values: ['West'] }])

    expect(seeded.values.Region).toEqual(['West'])
    expect(seeded.nullChecked).toEqual({ Region: false })
  })


  it('seeds multi-value Execution parameters', () => {
    const parameters = [param({ name: 'Tags', multiValue: true, defaultValues: [] })]

    const seeded = seedFormFromExecution(parameters, [
      { name: 'Tags', values: ['a', 'b'] },
    ])

    expect(seeded.values).toEqual({ Tags: ['a', 'b'] })
  })
})

describe('mergeCascadedNullChecked', () => {
  it('defaults newly seen nullable parameters from SSRS defaultValues', () => {
    const parameters = [
      param({ name: 'Region', nullable: true }),
      param({ name: 'NewOptional', nullable: true }),
      param({ name: 'WithDefault', nullable: true, defaultValues: ['x'] }),
      param({ name: 'Year' }),
    ]

    expect(mergeCascadedNullChecked(parameters, { Region: false })).toEqual({
      Region: false,
      NewOptional: true,
      WithDefault: false,
    })
  })
})
