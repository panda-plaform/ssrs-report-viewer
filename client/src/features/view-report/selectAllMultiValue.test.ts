import { describe, expect, it } from 'vitest'
import type { ReportParameter } from './viewReportApi'
import { toParameterSubmissions } from './parameterSubmissions'
import {
  SELECT_ALL_LABEL,
  applySelectAll,
  selectAllCheckboxState,
  selectedLabelsSummary,
} from './selectAllMultiValue'

const validValues = [
  { label: 'East', value: 'East' },
  { label: 'West', value: 'West' },
  { label: 'North', value: 'North' },
]

describe('selectAllCheckboxState', () => {
  it('is unchecked when no Valid Values are selected', () => {
    expect(selectAllCheckboxState(validValues, [])).toEqual({
      checked: false,
      indeterminate: false,
    })
  })

  it('is checked when every Valid Value is selected', () => {
    expect(selectAllCheckboxState(validValues, ['East', 'West', 'North'])).toEqual({
      checked: true,
      indeterminate: false,
    })
  })

  it('is indeterminate when some but not all Valid Values are selected', () => {
    expect(selectAllCheckboxState(validValues, ['East', 'West'])).toEqual({
      checked: false,
      indeterminate: true,
    })
  })

  it('ignores selected values that are not Valid Values', () => {
    expect(selectAllCheckboxState(validValues, [SELECT_ALL_LABEL, 'East'])).toEqual({
      checked: false,
      indeterminate: true,
    })
  })
})

describe('applySelectAll', () => {
  it('selects every Valid Value when checked', () => {
    expect(applySelectAll(validValues, true)).toEqual(['East', 'West', 'North'])
  })

  it('clears all selections when unchecked', () => {
    expect(applySelectAll(validValues, false)).toEqual([])
  })

  it('never includes the Select All chrome label as a value', () => {
    expect(applySelectAll(validValues, true)).not.toContain(SELECT_ALL_LABEL)
    expect(applySelectAll(validValues, false)).not.toContain(SELECT_ALL_LABEL)
  })

  it('never submits the Select All chrome label as a parameter value', () => {
    const parameters: ReportParameter[] = [
      {
        name: 'Region',
        dataType: 'String',
        nullable: false,
        multiValue: true,
        required: false,
        prompt: null,
        defaultValues: [],
        validValues,
        dependencies: [],
      },
    ]
    const values = { Region: applySelectAll(validValues, true) }

    expect(toParameterSubmissions(parameters, values, {})).toEqual([
      { name: 'Region', values: ['East', 'West', 'North'] },
    ])
    expect(toParameterSubmissions(parameters, values, {})[0]?.values).not.toContain(
      SELECT_ALL_LABEL,
    )
  })
})

describe('selectedLabelsSummary', () => {
  it('is empty when nothing is selected', () => {
    expect(selectedLabelsSummary(validValues, [])).toBe('')
  })

  it('joins Valid Value labels for the closed dropdown face', () => {
    expect(selectedLabelsSummary(validValues, ['East', 'North'])).toBe('East, North')
  })
})
