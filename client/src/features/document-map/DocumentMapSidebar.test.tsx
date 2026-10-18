import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DocumentMapSidebar } from './DocumentMapSidebar'

describe('DocumentMapSidebar', () => {
  it('renders Document Map nodes and navigates on click', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()

    render(
      <DocumentMapSidebar
        nodes={[
          {
            id: 'root',
            label: 'Revenue',
            children: [
              { id: 'north', label: 'North Region', children: [] },
              { id: 'south', label: 'South Region', children: [] },
            ],
          },
        ]}
        busy={false}
        onNavigate={onNavigate}
      />,
    )

    expect(screen.getByRole('navigation', { name: 'Document Map' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revenue' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'North Region' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'South Region' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'North Region' }))
    expect(onNavigate).toHaveBeenCalledWith('north')
  })

  it('renders nothing when Document Map nodes are empty', () => {
    const { container } = render(
      <DocumentMapSidebar nodes={[]} busy={false} onNavigate={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('disables node buttons while busy', () => {
    render(
      <DocumentMapSidebar
        nodes={[{ id: 'north', label: 'North Region', children: [] }]}
        busy={true}
        onNavigate={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'North Region' })).toBeDisabled()
  })
})
