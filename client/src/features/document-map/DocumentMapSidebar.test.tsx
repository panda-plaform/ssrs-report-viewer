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

  it('collapses and expands a branch without navigating', async () => {
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

    expect(screen.getByRole('button', { name: 'North Region' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Collapse Revenue' }))
    expect(screen.queryByRole('button', { name: 'North Region' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'South Region' })).not.toBeInTheDocument()
    expect(onNavigate).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Expand Revenue' }))
    expect(screen.getByRole('button', { name: 'North Region' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'South Region' })).toBeInTheDocument()
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('marks the current Document Map node after navigate', () => {
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
        currentNodeId="north"
        onNavigate={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'North Region' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(screen.getByRole('button', { name: 'South Region' })).not.toHaveAttribute(
      'aria-current',
    )
    expect(screen.getByRole('button', { name: 'Revenue' })).not.toHaveAttribute('aria-current')
  })
})
