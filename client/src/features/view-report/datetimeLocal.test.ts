import { describe, expect, it } from 'vitest'
import { toDateInputValue } from './datetimeLocal'

describe('toDateInputValue', () => {
  it('maps SSRS en-US DateTime defaults to date-only input values', () => {
    expect(toDateInputValue('10/14/2026 10:25:13 PM')).toBe('2026-10-14')
  })

  it('keeps ISO date and strips time from ISO datetime', () => {
    expect(toDateInputValue('2026-10-14T22:25:13')).toBe('2026-10-14')
    expect(toDateInputValue('2026-10-14')).toBe('2026-10-14')
  })

  it('maps en-GB short dates used for SetExecutionParameters', () => {
    expect(toDateInputValue('14/10/2026')).toBe('2026-10-14')
  })

  it('returns empty for blank or unparseable input', () => {
    expect(toDateInputValue('')).toBe('')
    expect(toDateInputValue('not-a-date')).toBe('')
  })
})
