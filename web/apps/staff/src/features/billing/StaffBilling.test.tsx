// Staff artboard `11a` — מסירת פריטים בשיעור.
//
// **Invariant 3 is the design here, not a router tag.** A coach picks the ITEM; the server
// prices it. The first three tests are that rule, and they are the reason this screen calls
// a coach-scoped options endpoint rather than the manager's `/products`.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { HandOverSheet } from './HandOverSheet'
import type { HandoutClient } from './handoutClient'
import { PaymentPromisesSection } from './PaymentPromisesSection'
import type { PromiseClient, StaffPromiseRow } from './promiseClient'

const LOCALE = 'he' as const

const OPTIONS = [
  { id: 'p1', name: 'גי מידה 140' },
  { id: 'p2', name: 'חגורה' },
]

const PRESENT = [
  { id: 's1', displayName: 'דנה' },
  { id: 's2', displayName: 'יוסי' },
]

const WAITING = [
  {
    charge_id: 'c1',
    student_id: 's1',
    product_id: 'p1',
    product_name: 'גי',
    // The shop's own line label — item and SIZE, no money. See `AwaitingHandoutOut`.
    line_note: 'גי · 140',
    ordered_on: '2026-08-20',
  },
]

function stub(overrides: Partial<HandoutClient> = {}): HandoutClient {
  return {
    options: vi.fn().mockResolvedValue(OPTIONS),
    handOut: vi.fn().mockResolvedValue(undefined),
    awaiting: vi.fn().mockResolvedValue([]),
    markHandedOver: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as HandoutClient
}

function renderSheet(props: Record<string, unknown> = {}) {
  return render(
    <HandOverSheet
      locale={LOCALE}
      client={stub()}
      options={OPTIONS}
      awaiting={[]}
      presentStudents={PRESENT}
      onHandedOut={vi.fn()}
      {...props}
    />,
  )
}

describe('11a — handing an item over', () => {
  it('shows no price anywhere', () => {
    // §3.2 and invariant 3. A lead coach opens a student card and marks attendance; they
    // never see what the family owes. In a small community that boundary is the product.
    const { container } = renderSheet()
    expect(container.textContent).not.toMatch(/₪/)
    // `MoneyDisplay` is the only thing in the product that renders an amount, so its
    // absence is the assertion. A bare digit check would not do: `גי מידה 140` is a SIZE
    // in a product name, and a test that failed on it would be a test nobody could satisfy.
    expect(container.querySelector('.studio-money')).toBeNull()
  })

  it('says out loud that the price is not shown to coaches', () => {
    // `11a`'s own approach — §3.2 written on the screen, rather than `2d`'s silent omission.
    renderSheet()
    expect(screen.getByTestId('price-policy')).toHaveTextContent(
      t(LOCALE, 'billing.product.handOutPolicy'),
    )
  })

  it('sends neither a price nor a payer', async () => {
    // The client's own shape forbids both: the server reads the amount from the product and
    // the payer from the primary guardian, so a coach could not set a family's bill from the
    // mat even by crafting a request.
    const handOut = vi.fn().mockResolvedValue(undefined)
    renderSheet({ client: stub({ handOut }) })
    await userEvent.click(screen.getAllByTestId('handout-option')[0]!)
    await userEvent.click(screen.getByTestId('hand-over-confirm'))
    expect(handOut).toHaveBeenCalledWith({ productId: 'p1', studentId: 's1' })
  })

  it('confirms that a charge was created without naming an amount', async () => {
    renderSheet()
    await userEvent.click(screen.getAllByTestId('handout-option')[0]!)
    await userEvent.click(screen.getByTestId('hand-over-confirm'))
    const confirmation = await screen.findByTestId('handed-out')
    expect(confirmation).toHaveTextContent('הפריט נמסר ונוצר חיוב')
    expect(confirmation.textContent).not.toMatch(/₪|\d/)
  })

  it('▲ shows no inventory: no stock count, no decrement, no out-of-stock row', () => {
    // D-M6-14. The artboard draws all three and §5.10 forbids all three — 'no stock counts,
    // no inventory; that is a different product'. `product` has no column that could hold a
    // count, so building it as drawn would need a migration this lane may not write for a
    // feature two spec sections refuse.
    const { container } = renderSheet()
    expect(screen.getByTestId('no-stock-hint')).toHaveTextContent(
      'אין ניהול מלאי — בחירת פריט יוצרת חיוב בלבד',
    )
    expect(container.textContent).not.toMatch(/חסר במלאי|נותרו|→/)
    expect(container.querySelector('[data-testid="inventory-switch"]')).toBeNull()
  })

  it('lists only students present in this lesson', () => {
    // D-M6-15. The scope banner's rule: pending hand-over AND marked present today. The
    // list arrives as a prop from the roster, so the cross-lane read of M5's marks is
    // visible at the call site rather than buried in a query.
    renderSheet({ presentStudents: [PRESENT[0]] })
    expect(screen.getByLabelText('דנה')).toBeInTheDocument()
    expect(screen.queryByLabelText('יוסי')).not.toBeInTheDocument()
  })

  it('cannot confirm before an item is picked', () => {
    renderSheet()
    expect(screen.getByTestId('hand-over-confirm')).toBeDisabled()
  })

  it('disables confirm while the charge is in flight', async () => {
    // A double tap in a noisy dojo raises two charges for one גי, and the parent disputes
    // the second one a month later.
    let release: (value: unknown) => void = () => {}
    const handOut = vi.fn().mockReturnValue(new Promise((resolve) => (release = resolve)))
    renderSheet({ client: stub({ handOut }) })
    await userEvent.click(screen.getAllByTestId('handout-option')[0]!)
    await userEvent.click(screen.getByTestId('hand-over-confirm'))
    expect(screen.getByTestId('hand-over-confirm')).toBeDisabled()
    release(undefined)
  })

  it('renders the empty state when the club sells nothing', () => {
    renderSheet({ options: [] })
    expect(screen.getByText('לא הוגדרו פריטים')).toBeInTheDocument()
  })
})

describe('the payment-promise queue on the phone', () => {
  // The one money surface this app carries, and it stays exactly this narrow: it calls
  // ManagerOrOwner routes only, and neither the entry nor the screen exists for a coach.
  // §13's third invariant is about coach-scoped endpoints, and this is not one.
  function promiseRow(
    id: string,
    method: 'cash' | 'cheque',
    overrides: Partial<StaffPromiseRow> = {},
  ): StaffPromiseRow {
    return {
      id,
      status: 'pending',
      method,
      total_agorot: 90_000,
      claimed_plan_name: null,
      already_paid: false,
      payer_name: 'משפחת כהן',
      charge_count: 3,
      created_at: '2026-09-01T09:00:00Z',
      ...overrides,
    }
  }

  function promiseStub(overrides: Partial<PromiseClient> = {}): PromiseClient {
    return {
      pending: vi.fn().mockResolvedValue([]),
      decide: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    } as PromiseClient
  }

  it('says which route each promise is, standing at the door', async () => {
    // The manager confirming at the door is holding either notes or a bundle of twelve
    // cheques. A row that does not say which is a row they cannot check against what is
    // in their hand.
    render(
      <PaymentPromisesSection
        locale={LOCALE}
        client={promiseStub({
          pending: vi.fn().mockResolvedValue([promiseRow('r1', 'cheque')]),
        })}
      />,
    )
    expect(await screen.findByTestId('promise-method')).toHaveTextContent(
      t(LOCALE, 'billing.method.cheque'),
    )
  })

  it('names a single charge in the singular, not "1 חיובים"', async () => {
    // §3.4 of the completion findings register.
    render(
      <PaymentPromisesSection
        locale={LOCALE}
        client={promiseStub({
          pending: vi.fn().mockResolvedValue([promiseRow('r1', 'cash', { charge_count: 1 })]),
        })}
      />,
    )
    const row = await screen.findByTestId('promise-charges')
    expect(row).toHaveTextContent(t(LOCALE, 'billing.promise.manager.chargesOne'))
    expect(row).not.toHaveTextContent('1 חיובים')
  })

  it('confirms through the promise route', async () => {
    const decide = vi.fn().mockResolvedValue(undefined)
    render(
      <PaymentPromisesSection
        locale={LOCALE}
        client={promiseStub({
          pending: vi.fn().mockResolvedValue([promiseRow('r1', 'cash')]),
          decide,
        })}
      />,
    )
    await userEvent.click(await screen.findByTestId('promise-confirm'))
    expect(decide).toHaveBeenCalledWith('r1', 'confirm')
  })

  it('shows a distinct chip when the payer claims they already paid', async () => {
    // The dashboard already renders this (PaymentPromisesPanel.tsx); the door -- where
    // reconciliation actually happens -- had silently dropped the field before this
    // fix, so a manager checking from their phone never saw a parent's self-report at
    // all.
    render(
      <PaymentPromisesSection
        locale={LOCALE}
        client={promiseStub({
          pending: vi.fn().mockResolvedValue([
            promiseRow('r1', 'cash', { already_paid: true }),
            promiseRow('r2', 'cash', { already_paid: false }),
          ]),
        })}
      />,
    )
    await screen.findAllByTestId('payment-promise-row')
    expect(screen.getByText(t(LOCALE, 'billing.promise.manager.saysPaid'))).toBeInTheDocument()
    expect(screen.getByText(t(LOCALE, 'billing.promise.manager.saysWillPay'))).toBeInTheDocument()
  })
})

describe('11a — an order the family already paid for', () => {
  it('settles the order instead of raising a second charge', async () => {
    // The defect this section exists to remove: a parent orders a גי in the shop, a charge
    // is raised, and the coach hands it over through the picker below — which knew nothing
    // about that order and charged the family again.
    const client = stub()
    renderSheet({ client, awaiting: WAITING })

    await userEvent.click(screen.getByTestId('awaiting-confirm'))

    expect(client.markHandedOver).toHaveBeenCalledWith('c1')
    // Never the route that creates money.
    expect(client.handOut).not.toHaveBeenCalled()
    expect(await screen.findByTestId('awaiting-done')).toBeInTheDocument()
  })

  it('shows the size, because the family was promised a hand-over after it is checked', () => {
    renderSheet({ awaiting: WAITING })
    expect(screen.getByTestId('awaiting-item')).toHaveTextContent('גי · 140')
    expect(screen.getByTestId('awaiting-student')).toHaveTextContent('דנה')
  })

  it('names no price in the waiting list either', () => {
    const { container } = renderSheet({ awaiting: WAITING })
    expect(container.textContent).not.toMatch(/₪/)
    expect(container.querySelector('.studio-money')).toBeNull()
  })

  it('says so plainly when another coach handed it over first', async () => {
    // Two coaches and one stale list is the ordinary case, not an error. A red failure for
    // a thing that went right would teach a coach to distrust the screen.
    const client = stub({ markHandedOver: vi.fn().mockResolvedValue(false) })
    renderSheet({ client, awaiting: WAITING })

    await userEvent.click(screen.getByTestId('awaiting-confirm'))

    expect(await screen.findByTestId('awaiting-taken')).toBeInTheDocument()
    expect(screen.queryByTestId('awaiting-done')).not.toBeInTheDocument()
  })

  it('offers nothing for a child who has not turned up', () => {
    // The route answers for the whole roster; this sheet is scoped to who is on the mat
    // (D-M6-15). `s3` is on neither list here.
    renderSheet({ awaiting: [{ ...WAITING[0], student_id: 's3' }] })
    expect(screen.queryByTestId('awaiting-handout')).not.toBeInTheDocument()
  })

  it('draws no section at all when nothing is waiting', () => {
    renderSheet({ awaiting: [] })
    expect(screen.queryByTestId('awaiting-handout')).not.toBeInTheDocument()
    // The picker is still there — this is the ordinary case for a club that sells nothing
    // online, and it must not look like a broken screen.
    expect(screen.getAllByTestId('handout-option').length).toBe(2)
  })
})
