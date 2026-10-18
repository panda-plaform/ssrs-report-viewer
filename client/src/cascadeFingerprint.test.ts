import { describe, expect, it } from 'vitest'
import type { ReportParameter } from './reportApi'
import { cascadeFingerprint } from './cascadeFingerprint'

function param(overrides: Partial<ReportParameter> & Pick<ReportParameter, 'name'>): ReportParameter {
  return {
    dataType: 'String',
    nullable: false,
    multiValue: false,
    required: false,
    prompt: overrides.name,
    defaultValues: [],
    validValues: [],
    dependencies: [],
    ...overrides,
  }
}

describe('cascadeFingerprint', () => {
  it('changes when a parameter without Dependencies changes value', () => {
    const parameters = [
      param({ name: 'ReportName', multiValue: true }),
      param({ name: 'UserName', multiValue: true, defaultValues: ['<ALL>'] }),
    ]

    const before = cascadeFingerprint(
      parameters,
      { ReportName: [], UserName: [] },
      {},
    )
    const after = cascadeFingerprint(
      parameters,
      { ReportName: ['<ALL>'], UserName: [] },
      {},
    )

    expect(before).not.toEqual('')
    expect(after).not.toEqual(before)
  })

  it('still changes when Dependencies are declared on another parameter', () => {
    const parameters = [
      param({ name: 'Region' }),
      param({ name: 'City', dependencies: ['Region'] }),
    ]

    const before = cascadeFingerprint(parameters, { Region: ['West'], City: [] }, {})
    const after = cascadeFingerprint(parameters, { Region: ['East'], City: [] }, {})

    expect(after).not.toEqual(before)
  })
})
