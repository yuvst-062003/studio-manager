// Parent artboard `12e` — הזמנת פריטים · ordering, paid by card.
//
// **§5.10's no-inventory rule, held.** 'No stock counts, no inventory — that is a different
// product and it is not this one.' No stock count, no "N left", no availability indicator
// appears here, and `product` has no column that could hold one. `12e`'s own spec records
// that `11a` breaks this rule and that only one of the two artboards can be right; D-M6-14
// settles it for both — the spec wins, and this screen is the one already obeying it.
//
// Selecting items creates `manual` charges and hands the parent straight to the card route,
// which is the flow `1b` already owns. This screen does not open uPay itself: one place
// builds an order, and it is the one with the double-payment guard in it.
//
// **Sizes (2026-08-29).** A גי is bought in a size and a חגורה is not, and `product.sizes`
// is the manager's answer per item. The picker appears only under a chosen item that has
// any, and the order button stays disabled until every one of them has been answered —
// because the alternative is a 422 the parent gets after pressing pay, on a screen whose
// next step is a payment page.
//
// **Still no stock count.** The size picker greys nothing out and says nothing about
// availability: §5.10's rule did not move because the catalogue grew a column. Which sizes
// the club *offers* is not which sizes it *has*, and this screen must not imply otherwise.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, Checkbox, EmptyState, MoneyDisplay, SlotChips } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
/** What the screen renders — the payer-side catalogue read (`/me/products`) serves
 *  exactly this, and the manager's fuller ProductOut satisfies it structurally.
 *
 *  `sizes` empty IS "this item has no sizes" — there is no flag beside it, on the wire or
 *  here. Optional only so a caller holding an older shape still type-checks; every real
 *  response carries it. */
export type OrderableProduct = {
  id: string
  name: string
  price_agorot: number
  sizes?: string[]
}

/** One line of the order. `size` is null for an item that has none — which is a different
 *  thing from an unanswered picker, and `readyToOrder` below is what tells them apart. */
export type OrderLine = { productId: string; size: string | null }

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-4)',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
}

//: Each row is a full-width tap target: the label stretches so the whole line toggles,
//: not just the 20px box.
const itemRowStyle: CSSProperties = {
  display: 'flex',
  paddingBlock: 'var(--space-2)',
}

export type OrderItemsScreenProps = {
  locale: Locale
  products: readonly OrderableProduct[]
  onOrder: (lines: OrderLine[]) => Promise<void>
}

/**
 * Whether every chosen item has been answered.
 *
 * Exported so the rule is testable without a render, and so there is exactly one place
 * deciding it. The server refuses a sized item with no size with a `size_required` 422 —
 * this is that refusal moved to before the press, on a screen whose next step is a payment
 * page a parent should not be bounced off.
 */
export function readyToOrder(
  products: readonly OrderableProduct[],
  chosen: readonly string[],
  sizes: Readonly<Record<string, string>>,
): boolean {
  if (chosen.length === 0) return false
  return chosen.every((id) => {
    const product = products.find((row) => row.id === id)
    return !product?.sizes?.length || Boolean(sizes[id])
  })
}

export function OrderItemsScreen({ locale, products, onOrder }: OrderItemsScreenProps) {
  const [chosen, setChosen] = useState<string[]>([])
  // Kept per product id and NOT cleared when an item is unchecked: a parent who unticks a
  // גי and ticks it again has not changed their mind about the size, and re-asking would
  // read as the app having lost it.
  const [sizes, setSizes] = useState<Record<string, string>>({})
  const [inFlight, setInFlight] = useState(false)
  const total = products
    .filter((product) => chosen.includes(product.id))
    .reduce((sum, product) => sum + product.price_agorot, 0)

  if (products.length === 0) {
    // `12e`'s state table: not drawn, and `billing.product.empty` exists for it.
    return (
      <div style={columnStyle} data-testid="order-items">
        <EmptyState title={t(locale, 'billing.product.empty')} />
      </div>
    )
  }

  const ready = readyToOrder(products, chosen, sizes)

  return (
    <div style={columnStyle} data-testid="order-items">
      <h2>{t(locale, 'billing.product.order')}</h2>
      <Card>
        {/* `Checkbox`, not a bare `<input type="checkbox">`. The hand-rolled one rendered at
            the browser default 13x13 with no focus ring — the only control on this screen,
            in a mobile-first app. The primitive is 20x20 with `accent-color` and a
            `:focus-visible` ring, and it was exported all along. */}
        {products.map((product) => {
          const picked = chosen.includes(product.id)
          const options = product.sizes ?? []
          return (
            <div key={product.id} style={itemRowStyle} data-testid="product-row">
              <Checkbox
                block
                checked={picked}
                label={
                  <span style={rowStyle}>
                    <span>{product.name}</span>
                    <MoneyDisplay agorot={product.price_agorot} />
                  </span>
                }
                onChange={(event) =>
                  setChosen((previous) =>
                    event.target.checked
                      ? [...previous, product.id]
                      : previous.filter((id) => id !== product.id),
                  )
                }
              />
              {/* Only under a CHOSEN item that has sizes. Showing every picker at once
                  would put a dozen radio groups on a phone to sell one belt, and showing
                  one under an unchosen item asks a question nobody has reached yet.
                  `SlotChips` rather than a select: it wraps, so a גי's ten sizes are all
                  visible instead of hidden behind a native dropdown, and it is a real
                  radio group underneath. */}
              {picked && options.length > 0 ? (
                <SlotChips
                  legend={`${t(locale, 'billing.product.chooseSize')} — ${product.name}`}
                  onValueChange={(size) =>
                    setSizes((previous) => ({ ...previous, [product.id]: size }))
                  }
                  options={options.map((size) => ({ id: size, label: size }))}
                  value={sizes[product.id] ?? null}
                />
              ) : null}
            </div>
          )
        })}
      </Card>
      {/* §5.10 on the screen, because a parent choosing the last גי will otherwise expect
          the app to know it was the last one. */}
      <p data-testid="no-stock-hint">{t(locale, 'billing.product.noStockHint')}</p>
      <div style={rowStyle}>
        <span>{t(locale, 'billing.card.total')}</span>
        <MoneyDisplay agorot={total} tone="debt" />
      </div>
      {/* Said, not only enforced. A button that is disabled and does not say why is a
          button a parent presses twice and then gives up on. */}
      {chosen.length > 0 && !ready ? (
        <p data-testid="choose-size-first">{t(locale, 'billing.product.chooseSizeFirst')}</p>
      ) : null}
      <Button
        variant="primary"
        data-testid="order-button"
        disabled={inFlight || !ready}
        onClick={async () => {
          setInFlight(true)
          try {
            await onOrder(
              chosen.map((id) => ({
                productId: id,
                // `null`, never `''`: the server refuses a size against a sizeless item,
                // and an empty string is a size the parent did not choose.
                size: products.find((row) => row.id === id)?.sizes?.length
                  ? (sizes[id] ?? null)
                  : null,
              })),
            )
          } finally {
            setInFlight(false)
          }
        }}
      >
        {t(locale, 'billing.card.pay')}
      </Button>
    </div>
  )
}
