import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TemplateSchema } from '../health/healthClient'
import { HealthReviewPopup } from './HealthReviewPopup'

const schema: TemplateSchema = {
  sections: [
    {
      id: 'medical_history',
      title: 'רקע רפואי',
      questions: [
        { id: 'asthma', type: 'boolean', label: 'אסתמה', flag: true },
        {
          id: 'chronic_illness_details',
          type: 'text',
          label: 'פירוט',
          required: false,
          visible_if: { asthma: true },
        },
      ],
    },
    {
      id: 'other',
      title: 'נוסף',
      questions: [
        { id: 'health_fund', type: 'text', label: 'קופת חולים', required: false },
        { id: 'emergency_contact', type: 'phone', label: 'טלפון חירום', required: true },
      ],
    },
    {
      id: 'declaration',
      title: 'הצהרה',
      questions: [
        { id: 'special_notes', type: 'text', label: 'הערות בריאות מיוחדות', required: false },
        { id: 'clause_confirmed', type: 'clause', label: 'אני מאשר/ת', required: true },
      ],
    },
  ],
}

describe('HealthReviewPopup', () => {
  it('surfaces special_notes distinctly, and excludes health_fund and the clause', () => {
    render(
      <HealthReviewPopup
        locale="he"
        schema={schema}
        answers={{}}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByTestId('health-review-special-notes')).toBeInTheDocument()
    expect(screen.queryByLabelText('קופת חולים')).toBeNull()
    expect(screen.queryByText('אני מאשר/ת')).toBeNull()
  })

  it('answering a boolean reports the change and reveals its conditional detail field', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <HealthReviewPopup
        locale="he"
        schema={schema}
        answers={{}}
        onChange={onChange}
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText('פירוט')).toBeNull()
    await user.click(screen.getByRole('radio', { name: 'כן' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ asthma: true }))
  })

  it('renders every visible answer already in the seed', () => {
    render(
      <HealthReviewPopup
        locale="he"
        schema={schema}
        answers={{ asthma: true, chronic_illness_details: 'טיפול' }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('פירוט')).toHaveValue('טיפול')
  })

  it('close button calls onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <HealthReviewPopup
        locale="he"
        schema={schema}
        answers={{}}
        onChange={vi.fn()}
        onClose={onClose}
      />,
    )
    await user.click(screen.getByTestId('health-review-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
