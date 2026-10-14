// `סיכום כספי` — the month's shape (owner, 2026-10-14: "it should be a page from finance
// to press"). Every figure is a sum of rows already stored, which is what these assert:
// the arithmetic, and the states where there is nothing to say.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { FinanceSummaryScreen, debtAging, methodSplit, monthSeries } from './FinanceSummaryScreen'
import type { CashClient, OpenCharge, RecordedPayment } from './cashClient'

const NOW = new Date('2026-10-14T09:00:00Z')

const payment = (over: Partial<RecordedPayment> & { id: string }): RecordedPayment => ({
  payer_person_id: 'p-1',
  method: 'cash',
  amount_agorot: 30000,
  received_at: '2026-10-02T10:00:00Z',
  ...over,
})

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

function makeClient(over: Partial<CashClient> = {}): CashClient {
  return {
    openCharges: vi.fn(() => Promise.resolve([charge({ id: 'c-1' })])),
    payments: vi.fn(() =>
      Promise.resolve([
        payment({ id: 'pay-1', method: 'cash', amount_agorot: 40000 }),
        payment({ id: 'pay-2', method: 'upay_card', amount_agorot: 60000 }),
      ]),
    ),
    methods: vi.fn(() => Promise.resolve([])),
    recordCash: vi.fn(() => Promise.resolve()),
    ...over,
  }
}

describe('the financial summary', () => {
  it('counts card income too — it is income, it just did not pass through anybody\'s hands', async () => {
    render(<FinanceSummaryScreen client={makeClient()} clock={() => NOW} locale="he" />)
    expect(await screen.findByTestId('finance-summary-month-total')).toHaveTextContent('1,000')
  })

  it('reads collection as paid over billed', async () => {
    // ₪1,000 in, ₪300 still open → ₪1,300 billed → 77%.
    render(<FinanceSummaryScreen client={makeClient()} clock={() => NOW} locale="he" />)
    expect(await screen.findByTestId('finance-summary-rate')).toHaveTextContent('77%')
  })

  it('says nothing rather than 0% when nothing was billed at all', async () => {
    render(
      <FinanceSummaryScreen
        client={makeClient({
          openCharges: vi.fn(() => Promise.resolve([])),
          payments: vi.fn(() => Promise.resolve([])),
        })}
        clock={() => NOW}
        locale="he"
      />,
    )
    expect(await screen.findByTestId('finance-summary-rate')).toHaveTextContent('—')
  })

  it('replaces three empty aging bars with one line when nothing is owed', async () => {
    render(
      <FinanceSummaryScreen
        client={makeClient({ openCharges: vi.fn(() => Promise.resolve([])) })}
        clock={() => NOW}
        locale="he"
      />,
    )
    expect(await screen.findByTestId('finance-summary-no-debt')).toHaveTextContent(
      t('he', 'billing.cash.debts.clear'),
    )
  })

  it('leads back to the tab it was pressed from', async () => {
    render(<FinanceSummaryScreen client={makeClient()} clock={() => NOW} locale="he" />)
    expect(await screen.findByTestId('finance-summary-back')).toHaveAttribute('href', '#/cash')
  })

  it('offers a retry rather than a blank page when the read fails', async () => {
    render(
      <FinanceSummaryScreen
        client={makeClient({ payments: vi.fn(() => Promise.reject(new Error('boom'))) })}
        clock={() => NOW}
        locale="he"
      />,
    )
    expect(await screen.findByTestId('load-failed')).toBeInTheDocument()
  })
})

describe('monthSeries', () => {
  it('ends on the current month and marks it, because it is not finished', () => {
    const series = monthSeries([], NOW)
    expect(series).toHaveLength(12)
    expect(series.at(-1)).toMatchObject({ key: '2026-10', current: true })
    expect(series.at(0)).toMatchObject({ key: '2025-11', current: false })
  })

  it('puts each payment in the month it was received', () => {
    const series = monthSeries(
      [
        payment({ id: 'a', received_at: '2026-09-04T10:00:00Z', amount_agorot: 10000 }),
        payment({ id: 'b', received_at: '2026-10-04T10:00:00Z', amount_agorot: 20000 }),
      ],
      NOW,
    )
    expect(series.find((month) => month.key === '2026-09')!.agorot).toBe(10000)
    expect(series.find((month) => month.key === '2026-10')!.agorot).toBe(20000)
  })
})

describe('methodSplit', () => {
  it('splits this month by how the money arrived, dropping methods nobody used', () => {
    const split = methodSplit(
      [
        payment({ id: 'a', method: 'cash', amount_agorot: 30000 }),
        payment({ id: 'b', method: 'cheque', amount_agorot: 10000 }),
        payment({ id: 'c', method: 'cash', amount_agorot: 20000 }),
        payment({ id: 'd', method: 'cash', amount_agorot: 99999, received_at: '2026-08-01T10:00:00Z' }),
      ],
      NOW,
    )
    expect(split).toEqual([
      { method: 'cash', agorot: 50000 },
      { method: 'cheque', agorot: 10000 },
    ])
  })
})

describe('debtAging', () => {
  it('separates a debt from last week from one from the summer', () => {
    const bands = debtAging(
      [
        charge({ id: 'a', due_date: '2026-10-10', amount_agorot: 10000 }),
        charge({ id: 'b', due_date: '2026-09-10', amount_agorot: 20000 }),
        charge({ id: 'c', due_date: '2026-05-10', amount_agorot: 30000 }),
      ],
      NOW,
    )
    expect(bands.find((band) => band.key === 'fresh')!.agorot).toBe(10000)
    expect(bands.find((band) => band.key === 'month')!.agorot).toBe(20000)
    expect(bands.find((band) => band.key === 'old')!.agorot).toBe(30000)
  })

  it('counts what is left of a part-paid charge', () => {
    const bands = debtAging(
      [charge({ id: 'a', due_date: '2026-10-10', amount_agorot: 30000, allocated_agorot: 10000 })],
      NOW,
    )
    expect(bands.find((band) => band.key === 'fresh')!.agorot).toBe(20000)
  })
})
