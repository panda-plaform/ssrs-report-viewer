import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ParameterForm } from './ParameterForm'
import { fetchParameters, viewReport } from './viewReportApi'

vi.mock('./viewReportApi', async () => {
  const actual = await vi.importActual<typeof import('./viewReportApi')>('./viewReportApi')
  return {
    ...actual,
    fetchParameters: vi.fn(),
    viewReport: vi.fn(),
  }
})

describe('ParameterForm View Report errors', () => {
  beforeEach(() => {
    vi.mocked(fetchParameters).mockReset()
    vi.mocked(viewReport).mockReset()
  })

  it('shows ParameterValueNotSet ProblemDetails and keeps the form usable for retry', async () => {
    vi.mocked(fetchParameters).mockResolvedValue({
      path: '/Sales/Folders',
      parameters: [
        {
          name: 'Region',
          dataType: 'String',
          nullable: false,
          multiValue: false,
          required: true,
          prompt: 'Region',
          defaultValues: [],
          validValues: [{ label: 'North', value: 'N' }],
          dependencies: [],
        },
      ],
    })
    vi.mocked(viewReport).mockRejectedValue(
      new Error(
        "This report requires a default or user-defined value for the report parameter 'folder_name'.",
      ),
    )

    const onClearSurface = vi.fn()
    const onViewed = vi.fn()
    const user = userEvent.setup()
    render(
      <ParameterForm
        reportPath="/Sales/Folders"
        onViewed={onViewed}
        onClearSurface={onClearSurface}
      />,
    )

    await screen.findByRole('button', { name: 'View Report' })
    await user.selectOptions(screen.getByLabelText(/Region/), 'N')
    await user.click(screen.getByRole('button', { name: 'View Report' }))

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent(
      "This report requires a default or user-defined value for the report parameter 'folder_name'.",
    )
    expect(onViewed).not.toHaveBeenCalled()
    expect(onClearSurface).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'View Report' })).toBeEnabled()
    expect(screen.getByLabelText(/Region/)).toHaveValue('N')
  })
})

describe('ParameterForm cascading Valid Values', () => {
  beforeEach(() => {
    vi.mocked(fetchParameters).mockReset()
    vi.mocked(viewReport).mockReset()
  })

  it('refreshes User Name Valid Values when Report Name changes even without Dependencies', async () => {
    const initial = {
      path: '/Example Reports/Execution Log',
      parameters: [
        {
          name: 'ReportName',
          dataType: 'String',
          nullable: false,
          multiValue: true,
          required: true,
          prompt: 'Report Name',
          defaultValues: [],
          validValues: [
            { label: '<ALL>', value: '<ALL>' },
            { label: 'Scheduled Jobs', value: 'Scheduled Jobs' },
          ],
          dependencies: [],
        },
        {
          name: 'UserName',
          dataType: 'String',
          nullable: false,
          multiValue: true,
          required: false,
          prompt: 'User Name',
          defaultValues: ['<ALL>'],
          validValues: [],
          dependencies: [],
        },
      ],
    }
    const cascaded = {
      path: '/Example Reports/Execution Log',
      parameters: [
        {
          ...initial.parameters[0],
        },
        {
          ...initial.parameters[1],
          validValues: [
            { label: '<ALL>', value: '<ALL>' },
            { label: 'dblai', value: 'dblai' },
            { label: 'ReportingServiceAcc', value: 'ReportingServiceAcc' },
          ],
        },
      ],
    }

    vi.mocked(fetchParameters).mockImplementation(async (_path, values) => {
      if (!values) {
        return initial
      }
      return cascaded
    })

    const user = userEvent.setup()
    render(
      <ParameterForm
        reportPath="/Example Reports/Execution Log"
        onViewed={vi.fn()}
        onClearSurface={vi.fn()}
      />,
    )

    await screen.findByRole('button', { name: 'User Name' })
    await user.click(screen.getByRole('button', { name: 'User Name' }))
    expect(screen.queryByRole('checkbox', { name: 'dblai' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'User Name' }))

    await user.click(screen.getByRole('button', { name: 'Report Name' }))
    const reportNameMenu = screen.getByRole('listbox')
    await user.click(within(reportNameMenu).getByRole('checkbox', { name: '<ALL>' }))

    await waitFor(() => {
      expect(fetchParameters).toHaveBeenCalledWith(
        '/Example Reports/Execution Log',
        expect.arrayContaining([
          expect.objectContaining({ name: 'ReportName', values: ['<ALL>'] }),
        ]),
      )
    })

    await user.click(screen.getByRole('button', { name: 'User Name' }))
    const userNameMenu = screen.getByRole('listbox')
    expect(within(userNameMenu).getByRole('checkbox', { name: 'dblai' })).toBeInTheDocument()
    expect(
      within(userNameMenu).getByRole('checkbox', { name: 'ReportingServiceAcc' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'User Name' })).toHaveAccessibleName('User Name')
    expect(screen.getByRole('button', { name: 'User Name' })).toHaveTextContent('<ALL>')
  })
})

