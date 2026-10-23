import { beforeEach, describe, expect, it, vi } from 'vitest'
import { drillthroughReport, goBack } from './drillthroughApi'

describe('drillthroughApi', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          sessionId: 'session-1',
          html: '<div>ok</div>',
          pageInfo: { currentPage: 1, pageCount: 1 },
          zoomPercent: 100,
          documentMap: null,
          documentMapVisible: true,
          canGoBack: true,
          reportPath: '/Sales/Child',
          parameters: [],
        }),
      }),
    )
  })

  it('posts Drillthrough with report path and parameters', async () => {
    await drillthroughReport('session-1', '/Sales/Child', [
      { name: 'Region', values: ['North'] },
    ])

    expect(fetch).toHaveBeenCalledWith(
      '/api/sessions/session-1/drillthrough',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          reportPath: '/Sales/Child',
          parameters: [{ name: 'Region', values: ['North'] }],
        }),
      }),
    )
  })

  it('posts Back with no body', async () => {
    await goBack('session-1')

    expect(fetch).toHaveBeenCalledWith(
      '/api/sessions/session-1/back',
      expect.objectContaining({ method: 'POST' }),
    )
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit
    expect(init.body).toBeUndefined()
  })
})
