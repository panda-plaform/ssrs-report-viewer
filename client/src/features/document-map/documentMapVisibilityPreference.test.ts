/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  readDocumentMapVisibilityPreference,
  writeDocumentMapVisibilityPreference,
} from './documentMapVisibilityPreference'

describe('Document Map Visibility Preference', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns undefined when no preference exists for the Report path', () => {
    expect(readDocumentMapVisibilityPreference('/Reports/A')).toBeUndefined()
  })

  it('round-trips a hidden preference for a Report path', () => {
    writeDocumentMapVisibilityPreference('/Reports/A', false)

    expect(readDocumentMapVisibilityPreference('/Reports/A')).toBe(false)
  })

  it('round-trips a visible preference for a Report path', () => {
    writeDocumentMapVisibilityPreference('/Reports/A', true)

    expect(readDocumentMapVisibilityPreference('/Reports/A')).toBe(true)
  })

  it('keeps preferences keyed per Report path', () => {
    writeDocumentMapVisibilityPreference('/Reports/A', false)
    writeDocumentMapVisibilityPreference('/Reports/B', true)

    expect(readDocumentMapVisibilityPreference('/Reports/A')).toBe(false)
    expect(readDocumentMapVisibilityPreference('/Reports/B')).toBe(true)
  })
})
