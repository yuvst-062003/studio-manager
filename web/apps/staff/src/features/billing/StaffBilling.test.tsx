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

const LOCALE = 'he' as const

const OPTIONS = [
  { id: 'p1', name: 'גי מידה 140' },
  { id: 'p2', name: 'חגורה' },
]

const PRESENT = [
  { id: 's1', displayName: 'דנה' },
  { id: 's2', displayName: 'יוסי' },
]

function stub(overrides: Partial<HandoutClient> = {}): HandoutClient {
  return {
    options: vi.fn().mockResolvedValue(OPTIONS),
    handOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as HandoutClient
}

function renderSheet(props: Record<string, unknown> = {}) {
  return render(
    <HandOverSheet
      locale={LOCALE}
      client={stub()}
      options={OPTIONS}
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
