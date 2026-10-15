import { describe, expect, it } from 'vitest'
import { toDatetimeLocalValue } from './datetimeLocal'

describe('toDatetimeLocalValue', () => {
  it('maps SSRS en-US DateTime defaults into datetime-local values', () => {
    expect(toDatetimeLocalValue('10/14/2026 10:25:13 PM')).toBe('2026-10-14T22:25:13')
  })

  it('keeps ISO-like values usable by datetime-local', () => {
    expect(toDatetimeLocalValue('2026-10-14T22:25:13')).toBe('2026-10-14T22:25:13')
    expect(toDatetimeLocalValue('2026-10-14')).toBe('2026-10-14T00:00')
  })

  it('returns empty for blank or unparseable input', () => {
    expect(toDatetimeLocalValue('')).toBe('')
    expect(toDatetimeLocalValue('not-a-date')).toBe('')
  })
})
