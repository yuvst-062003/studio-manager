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
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, EmptyState, MoneyDisplay } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { ProductOut } from './billingClient'

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

export type OrderItemsScreenProps = {
  locale: Locale
  products: readonly ProductOut[]
  onOrder: (productIds: string[]) => Promise<void>
}

export function OrderItemsScreen({ locale, products, onOrder }: OrderItemsScreenProps) {
  const [chosen, setChosen] = useState<string[]>([])
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

  return (
    <div style={columnStyle} data-testid="order-items">
      <h2>{t(locale, 'billing.product.order')}</h2>
      <Card>
        {products.map((product) => (
          <label key={product.id} style={rowStyle} data-testid="product-row">
            <input
              type="checkbox"
              checked={chosen.includes(product.id)}
              onChange={(event) =>
                setChosen((previous) =>
                  event.target.checked
                    ? [...previous, product.id]
                    : previous.filter((id) => id !== product.id),
                )
              }
            />
            <span>{product.name}</span>
            <MoneyDisplay agorot={product.price_agorot} />
          </label>
        ))}
      </Card>
      {/* §5.10 on the screen, because a parent choosing the last גי will otherwise expect
          the app to know it was the last one. */}
      <p data-testid="no-stock-hint">{t(locale, 'billing.product.noStockHint')}</p>
      <div style={rowStyle}>
        <span>{t(locale, 'billing.card.total')}</span>
        <MoneyDisplay agorot={total} tone="debt" />
      </div>
      <Button
        variant="primary"
        data-testid="order-button"
        disabled={inFlight || chosen.length === 0}
        onClick={async () => {
          setInFlight(true)
          try {
            await onOrder(chosen)
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
