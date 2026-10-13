// The money tab (owner, 2026-10-14): "I want to replace the timer with cash, and there do
// the cash collection". Two bands — the requests a parent sent, and what every family still
// owes — and the act this whole screen exists for: taking notes at the door and recording
// it while they are still in hand.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { setForcedMode } from '@studio/core'
import { t } from '@studio/i18n'
import { CashScreen } from './CashScreen'
import type { CashClient, OpenCharge } from './cashClient'
import { cashThisMonth, householdsFrom } from './households'

const AUGUST: OpenCharge = {
  id: 'c-1',
  payer_person_id: 'p-1',
  student_id: 's-1',
  kind: 'tuition',
  period_year: 2026,
  period_month: 8,
  amount_agorot: 30000,
  allocated_agorot: 0,
  due_date: '2026-08-01',
  status: 'open',
}
const SEPTEMBER: OpenCharge = { ...AUGUST, id: 'c-2', period_month: 9, due_date: '2026-09-01' }
const OCTOBER: OpenCharge = { ...AUGUST, id: 'c-3', period_month: 10, due_date: '2026-10-01' }

const STUDENTS = [
  { id: 's-1', first_name: 'ילד', last_name: 'בודק', guardian_display_names: ['דנה בודק'] },
]

function makeClient(over: Partial<CashClient> = {}): CashClient {
  return {
    openCharges: vi.fn(() => Promise.resolve([AUGUST, SEPTEMBER, OCTOBER])),
    payments: vi.fn(() =>
      Promise.resolve([
        { id: 'pay-1', payer_person_id: 'p-9', method: 'cash', amount_agorot: 40000, received_at: '2026-10-02T10:00:00Z' },
        { id: 'pay-2', payer_person_id: 'p-9', method: 'card', amount_agorot: 90000, received_at: '2026-10-03T10:00:00Z' },
      ]),
    ),
    recordCash: vi.fn(() => Promise.resolve()),
    ...over,
  }
}

function renderScreen(over: { client?: CashClient } = {}) {
  const client = over.client ?? makeClient()
  render(
    <CashScreen
      locale="he"
      client={client}
      students={STUDENTS}
      clock={() => new Date('2026-10-14T09:00:00Z')}
    />,
  )
  return { client }
}

describe('the cash tab', () => {
  it('names the family by its payer, not by a charge id', async () => {
    renderScreen()
    expect(await screen.findByTestId('cash-family-p-1')).toHaveTextContent('דנה בודק')
  })

  it('shows what the family owes, summed across their months', async () => {
    renderScreen()
    expect(await screen.findByTestId('cash-family-p-1')).toHaveTextContent('900')
  })

  it('counts only cash and cheques into the month, never a card', async () => {
    renderScreen()
    // ₪400 in cash this month; the ₪900 card payment is somebody else's arithmetic.
    expect(await screen.findByTestId('cash-month-total')).toHaveTextContent('400')
  })

  it('says so plainly when nothing is outstanding', async () => {
    renderScreen({ client: makeClient({ openCharges: vi.fn(() => Promise.resolve([])) }) })
    expect(await screen.findByText(t('he', 'billing.cash.debts.empty'))).toBeInTheDocument()
  })

  it('offers a retry rather than a blank screen when the read fails', async () => {
    renderScreen({
      client: makeClient({ openCharges: vi.fn(() => Promise.reject(new Error('boom'))) }),
    })
    expect(await screen.findByTestId('load-failed')).toBeInTheDocument()
  })
})

describe('taking money for several months at once', () => {
  it('opens the family with every charge ticked and the total to hand', async () => {
    renderScreen()
    await userEvent.click(await screen.findByTestId('cash-family-p-1'))

    const sheet = await screen.findByTestId('cash-family-sheet')
    expect(sheet).toHaveAttribute('role', 'dialog')
    expect(screen.getByTestId('cash-selected-total')).toHaveTextContent('900')
  })

  it('records ONE payment against exactly the charges that were ticked', async () => {
    const { client } = renderScreen()
    await userEvent.click(await screen.findByTestId('cash-family-p-1'))
    await screen.findByTestId('cash-family-sheet')

    // The family is paying for two of the three months.
    await userEvent.click(screen.getByTestId('cash-charge-c-3'))
    await userEvent.click(screen.getByTestId('cash-record-cash'))

    await waitFor(() =>
      expect(client.recordCash).toHaveBeenCalledWith(
        expect.objectContaining({
          payerPersonId: 'p-1',
          amountAgorot: 60000,
          chargeIds: ['c-1', 'c-2'],
          method: 'cash',
        }),
      ),
    )
    expect(client.recordCash).toHaveBeenCalledTimes(1)
  })

  it('keeps the button and the hand in step — the sum follows the ticks', async () => {
    renderScreen()
    await userEvent.click(await screen.findByTestId('cash-family-p-1'))
    await screen.findByTestId('cash-family-sheet')

    await userEvent.click(screen.getByTestId('cash-charge-c-1'))

    expect(screen.getByTestId('cash-selected-total')).toHaveTextContent('600')
  })

  it('refuses to record anything when nothing is ticked', async () => {
    renderScreen()
    await userEvent.click(await screen.findByTestId('cash-family-p-1'))
    await screen.findByTestId('cash-family-sheet')

    for (const id of ['c-1', 'c-2', 'c-3']) {
      await userEvent.click(screen.getByTestId(`cash-charge-${id}`))
    }

    expect(screen.getByTestId('cash-record-cash')).toBeDisabled()
  })

  it('can take it as a cheque instead, which is the other half of how this club is paid', async () => {
    const { client } = renderScreen()
    await userEvent.click(await screen.findByTestId('cash-family-p-1'))
    await screen.findByTestId('cash-family-sheet')

    await userEvent.click(screen.getByTestId('cash-record-cheque'))

    await waitFor(() =>
      expect(client.recordCash).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'cheque', amountAgorot: 90000 }),
      ),
    )
  })

  it('says so and refuses when there is no network — money is never marked offline', async () => {
    // Attendance is written offline and reconciled; money is not. A payment recorded on a
    // phone with no signal, in a pocket, for an hour, is a number two people later
    // disagree about. `setForcedMode` is the same switch the dev bar flips.
    setForcedMode('offline')
    try {
      renderScreen()
      await userEvent.click(await screen.findByTestId('cash-family-p-1'))
      await screen.findByTestId('cash-family-sheet')

      expect(screen.getByTestId('cash-offline')).toBeInTheDocument()
      expect(screen.getByTestId('cash-record-cash')).toBeDisabled()
    } finally {
      setForcedMode(null)
    }
  })
})

describe('householdsFrom', () => {
  it('groups by the person who pays, not by the child', () => {
    const rows = householdsFrom(
      [AUGUST, { ...SEPTEMBER, student_id: 's-2' }],
      [...STUDENTS, { id: 's-2', first_name: 'אח', last_name: 'בודק' }],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.studentNames).toHaveLength(2)
    expect(rows[0]!.owedAgorot).toBe(60000)
  })

  it('counts what is LEFT of a part-paid charge, not its face value', () => {
    const rows = householdsFrom([{ ...AUGUST, allocated_agorot: 10000 }], STUDENTS)
    expect(rows[0]!.owedAgorot).toBe(20000)
  })

  it('drops a charge that is fully covered — it is not a debt', () => {
    expect(householdsFrom([{ ...AUGUST, allocated_agorot: 30000 }], STUDENTS)).toEqual([])
  })

  it('titles a family by its children when no guardian is on file', () => {
    const rows = householdsFrom([AUGUST], [{ id: 's-1', first_name: 'ילד', last_name: 'בודק' }])
    expect(rows[0]!.title).toBe('ילד בודק')
  })

  it('names the oldest period owed, which is the conversation to have', () => {
    expect(householdsFrom([OCTOBER, AUGUST], STUDENTS)[0]!.oldestPeriod).toBe('2026-08')
  })

  it('puts the biggest debt first', () => {
    const other: OpenCharge = { ...AUGUST, id: 'c-9', payer_person_id: 'p-2' }
    const rows = householdsFrom([AUGUST, SEPTEMBER, other], STUDENTS)
    expect(rows.map((row) => row.payerPersonId)).toEqual(['p-1', 'p-2'])
  })
})

describe('cashThisMonth', () => {
  const now = new Date('2026-10-14T09:00:00Z')

  it('sums cash and cheques received this month', () => {
    expect(
      cashThisMonth(
        [
          { method: 'cash', amount_agorot: 30000, received_at: '2026-10-01T10:00:00Z' },
          { method: 'cheque', amount_agorot: 20000, received_at: '2026-10-09T10:00:00Z' },
        ],
        now,
      ),
    ).toBe(50000)
  })

  it('leaves last month out of this month', () => {
    expect(
      cashThisMonth([{ method: 'cash', amount_agorot: 30000, received_at: '2026-09-30T10:00:00Z' }], now),
    ).toBe(0)
  })

  it('leaves a card payment out entirely — it is not money that changed hands here', () => {
    expect(
      cashThisMonth([{ method: 'card', amount_agorot: 30000, received_at: '2026-10-02T10:00:00Z' }], now),
    ).toBe(0)
  })
})
