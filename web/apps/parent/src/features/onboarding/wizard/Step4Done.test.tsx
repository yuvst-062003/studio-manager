// F1 and F4 (fix round 1). `Step4Done` is presentational -- both findings are about what
// it draws from its own props, with nothing to write and nothing to drive through a real
// registration -- so these render it directly.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { step4Copy } from './copy'
import { Step4Done } from './Step4Done'
import type { PaymentOutcome } from './submitJoin'
import { emptyStudent } from './types'
import type { WizardGroup } from './types'

// Rendered in Hebrew below (`locale="he"`), so assertions read the same reference values.
const STEP4_COPY = step4Copy('he')

const GROUPS: readonly WizardGroup[] = [
  {
    id: 'g1',
    name: 'קבוצת בוקר',
    trackLabel: '',
    durationMin: 0,
    scheduleLabel: '',
    coachesLabel: '',
    locationLabel: '',
  },
]

describe('Step4Done -- the payment chip is driven by the outcome (F1, fix round 1)', () => {
  it('a not_recorded outcome shows no chip claiming a payment was approved, and "תשלום אושר" appears nowhere', () => {
    const student = emptyStudent('c1', { firstName: 'מאיה', lastName: 'לוי', groupId: 'g1' })
    const outcomes: PaymentOutcome[] = [
      {
        draftId: 'c1',
        name: 'מאיה לוי',
        method: 'cash',
        amountAgorot: 30_000,
        state: 'not_recorded',
        reason: 'write_failed',
      },
    ]

    render(
      <Step4Done locale="he" students={[student]} groups={GROUPS} outcomes={outcomes} onEnterApp={vi.fn()} />,
    )

    // The false claim F1 found: a green tick chip reading this, drawn unconditionally.
    expect(screen.queryByText('תשלום אושר')).toBeNull()
    expect(screen.getByText(STEP4_COPY.chipNotRecorded)).toBeInTheDocument()
  })

  it('a recorded outcome shows chipRecorded, not a paid/approved chip', () => {
    const student = emptyStudent('c1', { firstName: 'איתי', lastName: 'לוי', groupId: 'g1' })
    const outcomes: PaymentOutcome[] = [
      { draftId: 'c1', name: 'איתי לוי', method: 'cash', amountAgorot: 30_000, state: 'recorded' },
    ]

    render(
      <Step4Done locale="he" students={[student]} groups={GROUPS} outcomes={outcomes} onEnterApp={vi.fn()} />,
    )

    expect(screen.queryByText('תשלום אושר')).toBeNull()
    expect(screen.getByText(STEP4_COPY.chipRecorded)).toBeInTheDocument()
  })
})

describe('Step4Done -- events render only when supplied (F4, fix round 1)', () => {
  it('renders no events card when the `events` prop is absent', () => {
    const student = emptyStudent('c1', { firstName: 'איתי', lastName: 'לוי', groupId: 'g1' })

    render(<Step4Done locale="he" students={[student]} groups={GROUPS} outcomes={[]} onEnterApp={vi.fn()} />)

    expect(screen.queryByText(STEP4_COPY.eventsTitle)).toBeNull()
  })

  it('renders the events card when `events` is supplied', () => {
    const student = emptyStudent('c1', { firstName: 'איתי', lastName: 'לוי', groupId: 'g1' })

    render(
      <Step4Done
        locale="he"
        students={[student]}
        groups={GROUPS}
        outcomes={[]}
        onEnterApp={vi.fn()}
        events={[
          {
            id: 'ev-1',
            day: '15',
            month: 'ספט׳',
            title: 'אימון פתיחת עונה',
            detail: 'יום א׳',
            audience: 'לכל המשפחה',
          },
        ]}
      />,
    )

    expect(screen.getByText(STEP4_COPY.eventsTitle)).toBeInTheDocument()
    expect(screen.getByText('אימון פתיחת עונה')).toBeInTheDocument()
  })
})
