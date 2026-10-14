import { describe, expect, it } from 'vitest'
import {
  buildReportPathSearch,
  catalogSearch,
  readReportPathFromSearch,
  viewerModeFromReportPath,
} from './reportPathUrl'

describe('readReportPathFromSearch', () => {
  it('returns null when path is absent', () => {
    expect(readReportPathFromSearch('')).toBeNull()
    expect(readReportPathFromSearch('?')).toBeNull()
    expect(readReportPathFromSearch('?other=1')).toBeNull()
  })

  it('returns the Report path from ?path=', () => {
    expect(readReportPathFromSearch('?path=%2FSales%2FMonthly')).toBe('/Sales/Monthly')
    expect(readReportPathFromSearch('?path=/Sales/Monthly')).toBe('/Sales/Monthly')
  })

  it('ignores empty path values', () => {
    expect(readReportPathFromSearch('?path=')).toBeNull()
    expect(readReportPathFromSearch('?path=%20')).toBeNull()
  })

  it('does not treat other query keys as the Report path', () => {
    expect(readReportPathFromSearch('?sessionId=abc&path=%2FReports%2FFoo')).toBe(
      '/Reports/Foo',
    )
  })
})

describe('buildReportPathSearch', () => {
  it('encodes only the Report path as ?path=', () => {
    expect(buildReportPathSearch('/Sales/Monthly')).toBe('?path=%2FSales%2FMonthly')
  })

  it('encodes spaces and special characters in the path', () => {
    expect(buildReportPathSearch('/Folder/My Report')).toBe(
      '?path=%2FFolder%2FMy%20Report',
    )
  })
})

describe('catalogSearch', () => {
  it('clears the path query for Catalog browse', () => {
    expect(catalogSearch()).toBe('')
  })
})

describe('viewerModeFromReportPath', () => {
  it('is catalog when no Report is open', () => {
    expect(viewerModeFromReportPath(null)).toBe('catalog')
  })

  it('is report when a Report path is present', () => {
    expect(viewerModeFromReportPath('/Sales/Monthly')).toBe('report')
  })
})
