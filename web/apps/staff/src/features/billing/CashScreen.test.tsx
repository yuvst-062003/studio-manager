// The money tab, rebuilt the evening it shipped (owner, 2026-10-14: "it doesn't clear"),
// and the two cases that come back every month — one family paying two ways, and a dozen
// families to mark at once.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { setForcedMode } from '@studio/core'
import { t } from '@studio/i18n'
import { CashScreen } from './CashScreen'
import type { CashClient, OpenCharge } from './cashClient'
import { collectedInMonth, householdsFrom } from './households'

const charge = (over: Partial<OpenCharge> & { id: string }): OpenCharge => ({
  payer_person_id: 'p-1',
  student_id: 's-1',
  kind: 'tuition',
  period_year: 2026,
  period_month: 9,
  amount_agorot: 30000,
  allocated_agorot: 0,
  due_date: '2026-09-01',
  status: 'open',
  ...over,
})

const AUGUST = charge({ id: 'c-1', period_month: 8, due_date: '2026-08-01' })
const SEPTEMBER = charge({ id: 'c-2', period_month: 9, due_date: '2026-09-01' })
const OCTOBER = charge({ id: 'c-3', period_month: 10, due_date: '2026-10-01' })

const STUDENTS = [
  { id: 's-1', first_name: 'ליאון', last_name: 'בודק', guardian_display_names: ['דנה בודק'] },
  { id: 's-2', first_name: 'לביא', last_name: 'בודק', guardian_display_names: ['דנה בודק'] },
]

const NOW = () => new Date('2026-10-14T09:00:00Z')

function makeClient(over: Partial<CashClient> = {}): CashClient {
  return {
    openCharges: vi.fn(() => Promise.resolve([AUGUST, SEPTEMBER, OCTOBER])),
    payments: vi.fn(() =>
      Promise.resolve([
        { id: 'pay-1', payer_person_id: 'p-9', method: 'cash', amount_agorot: 40000, received_at: '2026-10-02T10:00:00Z' },
        { id: 'pay-2', payer_person_id: 'p-9', method: 'upay_card', amount_agorot: 90000, received_at: '2026-10-03T10:00:00Z' },
        { id: 'pay-3', payer_person_id: 'p-9', method: 'standing_order', amount_agorot: 10000, received_at: '2026-09-03T10:00:00Z' },
      ]),
    ),
    methods: vi.fn(() =>
      Promise.resolve([
        { student_id: 's-1', student_name: 'ליאון בודק', method: 'cheque' },
        { student_id: 's-2', student_name: 'לביא בודק', method: 'cash' },
      ]),
    ),
    recordCash: vi.fn(() => Promise.resolve()),
    ...over,
  }
}

function renderScreen(over: { client?: CashClient } = {}) {
  const client = over.client ?? makeClient()
  render(<CashScreen locale="he" client={client} students={STUDENTS} clock={NOW} />)
  return { client }
}

describe('the money tab', () => {
  it('leads with what was collected this month, by hand', async () => {
    renderScreen()
    // ₪400 cash in October. The ₪900 card is income but not this tab's business — it
    // records itself — and the ₪100 standing order was September.
    expect(await screen.findByTestId('cash-month-total')).toHaveTextContent('400')
  })

  it('puts the figure beside last month, so it means something', async () => {
    renderScreen()
    // October ₪400 against September ₪100.
    expect(await screen.findByTestId('cash-month-delta')).toHaveTextContent('300')
  })

  it('says plainly when nothing was collected rather than showing a bare zero', async () => {
    renderScreen({ client: makeClient({ payments: vi.fn(() => Promise.resolve([])) }) })
    expect(await screen.findByTestId('cash-month-delta')).toHaveTextContent(
      t('he', 'billing.cash.month.none'),
    )
  })

  it('offers something to do before anybody owes anything', async () => {
    renderScreen({ client: makeClient({ openCharges: vi.fn(() => Promise.resolve([])) }) })

    expect(await screen.findByTestId('cash-open-record')).toBeInTheDocument()
    expect(screen.getByTestId('cash-open-batch')).toBeInTheDocument()
    expect(screen.getByTestId('cash-open-summary')).toHaveAttribute('href', '#/cash/summary')
  })

  it('shows an empty debts section as one quiet line, not a hole', async () => {
    renderScreen({ client: makeClient({ openCharges: vi.fn(() => Promise.resolve([])) }) })
    expect(await screen.findByTestId('cash-debts-empty')).toHaveTextContent(
      t('he', 'billing.cash.debts.clear'),
    )
  })

  it('names the family and what it owes', async () => {
    renderScreen()
    const row = await screen.findByTestId('cash-family-p-1')
    expect(row).toHaveTextContent('דנה בודק')
    expect(row).toHaveTextContent('900')
  })

  it('offers a retry rather than a blank screen when the read fails', async () => {
    renderScreen({
      client: makeClient({ openCharges: vi.fn(() => Promise.reject(new Error('boom'))) }),
    })
    expect(await screen.findByTestId('load-failed')).toBeInTheDocument()
  })
})

describe('recording a payment', () => {
  it('opens at the family when a debt row is pressed — the family is already known', async () => {
    renderScreen()
    await userEvent.click(await screen.findByTestId('cash-family-p-1'))

    const sheet = await screen.findByTestId('record-payment-sheet')
    expect(sheet).toHaveAttribute('role', 'dialog')
    expect(within(sheet).getByTestId('record-payment-total')).toHaveTextContent('900')
  })

  it('asks who first when opened from the actions group', async () => {
    renderScreen()
    await userEvent.click(await screen.findByTestId('cash-open-record'))

    expect(await screen.findByTestId('record-payment-search')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('record-payment-pick-p-1'))
    expect(await screen.findByTestId('record-payment-total')).toHaveTextContent('900')
  })

  it('writes ONE payment per method — a cheque for one child and cash for the other', async () => {
    const { client } = renderScreen({
      client: makeClient({
        openCharges: vi.fn(() =>
          Promise.resolve([
            charge({ id: 'c-1', student_id: 's-1', amount_agorot: 27500 }),
            charge({ id: 'c-2', student_id: 's-2', amount_agorot: 30000 }),
          ]),
        ),
      }),
    })
    await userEvent.click(await screen.findByTestId('cash-family-p-1'))
    await screen.findByTestId('record-payment-plan')

    await userEvent.click(screen.getByTestId('record-payment-commit'))

    await waitFor(() => expect(client.recordCash).toHaveBeenCalledTimes(2))
    expect(client.recordCash).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'cash', amountAgorot: 30000, chargeIds: ['c-2'] }),
    )
    expect(client.recordCash).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'cheque', amountAgorot: 27500, chargeIds: ['c-1'] }),
    )
  })

  it('shows both lines before writing either', async () => {
    renderScreen({
      client: makeClient({
        openCharges: vi.fn(() =>
          Promise.resolve([
            charge({ id: 'c-1', student_id: 's-1' }),
            charge({ id: 'c-2', student_id: 's-2' }),
          ]),
        ),
      }),
    })
    await userEvent.click(await screen.findByTestId('cash-family-p-1'))

    const plan = await screen.findByTestId('record-payment-plan')
    expect(within(plan).getByText(/צ׳קים/)).toBeInTheDocument()
    expect(within(plan).getByText(/מזומן/)).toBeInTheDocument()
  })

  it('puts everything on one method when the evening did not match the records', async () => {
    const { client } = renderScreen({
      client: makeClient({
        openCharges: vi.fn(() =>
          Promise.resolve([
            charge({ id: 'c-1', student_id: 's-1' }),
            charge({ id: 'c-2', student_id: 's-2' }),
          ]),
        ),
      }),
    })
    await userEvent.click(await screen.findByTestId('cash-family-p-1'))
    await screen.findByTestId('record-payment-plan')

    await userEvent.click(screen.getByTestId('record-payment-all-standing_order'))
    await userEvent.click(screen.getByTestId('record-payment-commit'))

    await waitFor(() => expect(client.recordCash).toHaveBeenCalledTimes(1))
    expect(client.recordCash).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'standing_order', chargeIds: ['c-1', 'c-2'] }),
    )
  })

  it('follows the ticks — unticking a charge takes it off the total and the write', async () => {
    const { client } = renderScreen()
    await userEvent.click(await screen.findByTestId('cash-family-p-1'))
    await screen.findByTestId('record-payment-total')

    await userEvent.click(screen.getByTestId('record-payment-charge-c-1'))

    expect(screen.getByTestId('record-payment-total')).toHaveTextContent('600')
    await userEvent.click(screen.getByTestId('record-payment-commit'))
    await waitFor(() =>
      expect(client.recordCash).toHaveBeenCalledWith(
        expect.objectContaining({ chargeIds: ['c-2', 'c-3'] }),
      ),
    )
  })

  it('refuses to write when nothing is ticked', async () => {
    renderScreen()
    await userEvent.click(await screen.findByTestId('cash-family-p-1'))
    await screen.findByTestId('record-payment-total')

    for (const id of ['c-1', 'c-2', 'c-3']) {
      await userEvent.click(screen.getByTestId(`record-payment-charge-${id}`))
    }

    expect(screen.getByTestId('record-payment-commit')).toBeDisabled()
  })

  it('never writes money offline, and says why', async () => {
    setForcedMode('offline')
    try {
      renderScreen()
      await userEvent.click(await screen.findByTestId('cash-family-p-1'))
      await screen.findByTestId('record-payment-total')

      expect(screen.getByTestId('record-payment-offline')).toBeInTheDocument()
      expect(screen.getByTestId('record-payment-commit')).toBeDisabled()
    } finally {
      setForcedMode(null)
    }
  })
})

describe('recording for several families at once', () => {
  const FAMILY_B = charge({
    id: 'c-9',
    payer_person_id: 'p-2',
    student_id: 's-2',
    amount_agorot: 60000,
  })

  function batchClient() {
    return makeClient({
      openCharges: vi.fn(() =>
        Promise.resolve([charge({ id: 'c-1', student_id: 's-1' }), FAMILY_B]),
      ),
      methods: vi.fn(() =>
        Promise.resolve([
          { student_id: 's-1', student_name: 'ליאון בודק', method: 'standing_order' },
          { student_id: 's-2', student_name: 'לביא בודק', method: 'standing_order' },
        ]),
      ),
    })
  }

  it('pre-ticks everybody on the chosen method and counts the press', async () => {
    renderScreen({ client: batchClient() })
    await userEvent.click(await screen.findByTestId('cash-open-batch'))

    const commit = await screen.findByTestId('batch-payment-commit')
    await waitFor(() => expect(commit).toHaveTextContent('2'))
    expect(commit).toHaveTextContent('900')
  })

  it('writes one payment per family, each with its own idempotency key', async () => {
    const client = batchClient()
    renderScreen({ client })
    await userEvent.click(await screen.findByTestId('cash-open-batch'))
    await waitFor(() => expect(screen.getByTestId('batch-payment-family-p-1')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('batch-payment-commit'))

    await waitFor(() => expect(client.recordCash).toHaveBeenCalledTimes(2))
    const keys = (client.recordCash as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => (call[0] as { key?: string }).key,
    )
    expect(new Set(keys).size).toBe(2)
  })

  it('untick a family and it is not written', async () => {
    const client = batchClient()
    renderScreen({ client })
    await userEvent.click(await screen.findByTestId('cash-open-batch'))
    await waitFor(() => expect(screen.getByTestId('batch-payment-family-p-2')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('batch-payment-family-p-2'))
    await userEvent.click(screen.getByTestId('batch-payment-commit'))

    await waitFor(() => expect(client.recordCash).toHaveBeenCalledTimes(1))
    expect(client.recordCash).toHaveBeenCalledWith(expect.objectContaining({ payerPersonId: 'p-1' }))
  })

  it('says what it did, not that it worked — one failure is named with a retry', async () => {
    const client = batchClient()
    let calls = 0
    client.recordCash = vi.fn(() => {
      calls += 1
      return calls === 1 ? Promise.reject(new Error('409')) : Promise.resolve()
    })
    renderScreen({ client })
    await userEvent.click(await screen.findByTestId('cash-open-batch'))
    await waitFor(() => expect(screen.getByTestId('batch-payment-family-p-1')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('batch-payment-commit'))

    expect(await screen.findByTestId('batch-payment-failures')).toBeInTheDocument()
    expect(screen.getByTestId('batch-payment-result')).toHaveTextContent('1')
    expect(screen.getByTestId('batch-payment-retry')).toBeInTheDocument()
  })

  it('says so when nobody is on that method rather than offering an empty press', async () => {
    renderScreen({
      client: makeClient({
        methods: vi.fn(() =>
          Promise.resolve([{ student_id: 's-1', student_name: 'ליאון בודק', method: 'cash' }]),
        ),
      }),
    })
    await userEvent.click(await screen.findByTestId('cash-open-batch'))

    expect(await screen.findByTestId('batch-payment-empty')).toBeInTheDocument()
    expect(screen.getByTestId('batch-payment-commit')).toBeDisabled()
  })
})

describe('householdsFrom', () => {
  it('groups by the person who pays, not by the child', () => {
    const rows = householdsFrom([AUGUST, { ...SEPTEMBER, student_id: 's-2' }], STUDENTS)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.studentNames).toHaveLength(2)
    expect(rows[0]!.owedAgorot).toBe(60000)
  })

  it('counts what is LEFT of a part-paid charge, not its face value', () => {
    expect(householdsFrom([{ ...AUGUST, allocated_agorot: 10000 }], STUDENTS)[0]!.owedAgorot).toBe(
      20000,
    )
  })

  it('drops a charge that is fully covered — it is not a debt', () => {
    expect(householdsFrom([{ ...AUGUST, allocated_agorot: 30000 }], STUDENTS)).toEqual([])
  })

  it('titles a family by its children when no guardian is on file', () => {
    const rows = householdsFrom([AUGUST], [{ id: 's-1', first_name: 'ליאון', last_name: 'בודק' }])
    expect(rows[0]!.title).toBe('ליאון בודק')
  })

  it('names the oldest period owed, which is the conversation to have', () => {
    expect(householdsFrom([OCTOBER, AUGUST], STUDENTS)[0]!.oldestPeriod).toBe('2026-08')
  })

  it('puts the biggest debt first', () => {
    const other = charge({ id: 'c-9', payer_person_id: 'p-2' })
    const rows = householdsFrom([AUGUST, SEPTEMBER, other], STUDENTS)
    expect(rows.map((row) => row.payerPersonId)).toEqual(['p-1', 'p-2'])
  })
})

describe('collectedInMonth', () => {
  const now = new Date('2026-10-14T09:00:00Z')

  it('counts the three methods that reach the club by hand', () => {
    expect(
      collectedInMonth(
        [
          { method: 'cash', amount_agorot: 30000, received_at: '2026-10-01T10:00:00Z' },
          { method: 'cheque', amount_agorot: 20000, received_at: '2026-10-09T10:00:00Z' },
          { method: 'standing_order', amount_agorot: 10000, received_at: '2026-10-11T10:00:00Z' },
        ],
        now,
      ),
    ).toBe(60000)
  })

  it('leaves the card out — it records itself and is counted on the summary page', () => {
    expect(
      collectedInMonth(
        [{ method: 'upay_card', amount_agorot: 30000, received_at: '2026-10-02T10:00:00Z' }],
        now,
      ),
    ).toBe(0)
  })

  it('leaves last month out of this month', () => {
    expect(
      collectedInMonth(
        [{ method: 'cash', amount_agorot: 30000, received_at: '2026-09-30T10:00:00Z' }],
        now,
      ),
    ).toBe(0)
  })
})
