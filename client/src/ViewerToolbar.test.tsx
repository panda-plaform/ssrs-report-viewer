import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ViewerToolbar } from './ViewerToolbar'

vi.mock('./reportApi', () => ({
  setZoom: vi.fn(),
  setReportPage: vi.fn(),
  refreshReport: vi.fn(),
  downloadExport: vi.fn(),
}))

describe('ViewerToolbar chrome harness', () => {
  it('renders Report Viewer toolbar chrome with reportApi mocked', () => {
    render(
      <ViewerToolbar
        sessionId="session-1"
        pageInfo={{ currentPage: 1, pageCount: 3 }}
        zoomPercent={100}
        busy={false}
        onUpdated={() => {}}
        onError={() => {}}
        onBusyChange={() => {}}
      />,
    )

    expect(screen.getByRole('toolbar', { name: 'Report Viewer toolbar' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Zoom' })).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PDF' })).toBeInTheDocument()
  })
})
