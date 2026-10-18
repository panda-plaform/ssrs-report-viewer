import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FindControls } from './FindControls'
import { findInReport, findNextInReport } from './findApi'

vi.mock('./findApi', () => ({
  findInReport: vi.fn(),
  findNextInReport: vi.fn(),
}))

function renderFindControls() {
  const onFindResult = vi.fn()
  const onError = vi.fn()
  const onBusyChange = vi.fn()

  render(
    <FindControls
      sessionId="session-1"
      busy={false}
      onFindResult={onFindResult}
      onError={onError}
      onBusyChange={onBusyChange}
    />,
  )

  return { onFindResult, onError, onBusyChange }
}

describe('FindControls', () => {
  beforeEach(() => {
    vi.mocked(findInReport).mockReset().mockResolvedValue({
      html: '<div>found</div>',
      found: true,
      pageInfo: { currentPage: 3, pageCount: 5 },
    })
    vi.mocked(findNextInReport).mockReset().mockResolvedValue({
      html: '<div>next</div>',
      found: true,
      pageInfo: { currentPage: 4, pageCount: 5 },
    })
  })

  it('disables Find when Find text is empty and Find next until a Find completes', async () => {
    const user = userEvent.setup()
    renderFindControls()

    expect(screen.getByRole('button', { name: 'Find' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Find next' })).toBeDisabled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText('Enter text to Find.')).not.toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Find' }), 'revenue')

    expect(screen.getByRole('button', { name: 'Find' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Find next' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Find' }))

    expect(screen.getByRole('button', { name: 'Find next' })).toBeEnabled()
  })

  it('enables Find next after Find completes with no matches', async () => {
    const user = userEvent.setup()
    vi.mocked(findInReport).mockResolvedValueOnce({
      html: '<div>page</div>',
      found: false,
      pageInfo: { currentPage: 2, pageCount: 5 },
    })
    renderFindControls()

    await user.type(screen.getByRole('searchbox', { name: 'Find' }), 'missing')
    expect(screen.getByRole('button', { name: 'Find next' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Find' }))

    expect(screen.getByRole('button', { name: 'Find next' })).toBeEnabled()
    expect(screen.getByRole('status')).toHaveTextContent('No matches in the current Execution.')
  })

  it('disables Find next again when Find text changes after a completed search', async () => {
    const user = userEvent.setup()
    renderFindControls()

    const findField = screen.getByRole('searchbox', { name: 'Find' })
    await user.type(findField, 'revenue')
    await user.click(screen.getByRole('button', { name: 'Find' }))
    expect(screen.getByRole('button', { name: 'Find next' })).toBeEnabled()

    await user.type(findField, 's')
    expect(screen.getByRole('button', { name: 'Find next' })).toBeDisabled()
  })

  it('keeps Find next disabled when Find fails', async () => {
    const user = userEvent.setup()
    vi.mocked(findInReport).mockRejectedValueOnce(new Error('Find failed'))
    renderFindControls()

    await user.type(screen.getByRole('searchbox', { name: 'Find' }), 'revenue')
    await user.click(screen.getByRole('button', { name: 'Find' }))

    expect(screen.getByRole('button', { name: 'Find next' })).toBeDisabled()
  })

  it('calls findInReport and findNextInReport from Find icon controls', async () => {
    const user = userEvent.setup()
    const { onFindResult } = renderFindControls()

    const findField = screen.getByRole('searchbox', { name: 'Find' })
    await user.type(findField, 'revenue')
    expect(screen.getByRole('button', { name: 'Find next' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Find' }))

    expect(findInReport).toHaveBeenCalledWith('session-1', 'revenue')
    expect(onFindResult).toHaveBeenCalledWith(
      expect.objectContaining({ found: true, pageInfo: { currentPage: 3, pageCount: 5 } }),
    )
    expect(screen.getByRole('button', { name: 'Find next' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Find next' }))
    expect(findNextInReport).toHaveBeenCalledWith('session-1', 'revenue')
  })
})
