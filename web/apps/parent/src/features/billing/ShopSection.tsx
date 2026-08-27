// 12e, mounted (feature pass 2026-08-27). `OrderItemsScreen` shipped in W4 imported by
// nothing, and the parent client's `products()` returned `[]` by design — a parent could
// not buy a גי at all. This container owns the payer-side catalogue read and the order
// POST; the created charges are ordinary manual charges, so the payments screen (card
// AND cash request) takes over from there — one place builds card orders, and it is the
// one with the double-payment guard in it.
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@studio/core'
import { Alert, Button } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { OrderItemsScreen } from './OrderItemsScreen'
import type { OrderableProduct } from './OrderItemsScreen'

export function ShopSection({ locale }: { locale: Locale }) {
  const [products, setProducts] = useState<readonly OrderableProduct[] | null>(null)
  const [ordered, setOrdered] = useState(false)
  const [failed, setFailed] = useState(false)
  const client = useMemo(
    () => ({
      async list(): Promise<OrderableProduct[]> {
        const response = await apiFetch('/api/v1/me/products')
        if (!response.ok) throw new Error(String(response.status))
        return ((await response.json()) as { items: OrderableProduct[] }).items
      },
      async order(productIds: string[]): Promise<void> {
        const response = await apiFetch('/api/v1/me/orders/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: productIds.map((id) => ({ product_id: id, quantity: 1 })) }),
        })
        if (!response.ok) throw new Error(String(response.status))
      },
    }),
    [],
  )

  useEffect(() => {
    let alive = true
    client
      .list()
      .then((rows) => alive && setProducts(rows))
      .catch(() => alive && setProducts([]))
    return () => {
      alive = false
    }
  }, [client])

  if (products === null) return null
  if (ordered) {
    return (
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-4)' }}
        data-testid="shop-ordered"
      >
        <Alert tone="paid" iconLabel={t(locale, 'billing.shop.title')}>
          {t(locale, 'billing.shop.ordered')}
        </Alert>
        <Button onClick={() => (globalThis.location.hash = '#/payments')}>
          {t(locale, 'billing.shop.toPayment')}
        </Button>
      </div>
    )
  }
  return (
    <>
      {failed ? (
        <Alert tone="danger" live iconLabel={t(locale, 'billing.shop.title')}>
          {t(locale, 'common.error.generic')}
        </Alert>
      ) : null}
      <OrderItemsScreen
        locale={locale}
        products={products}
        onOrder={async (productIds) => {
          setFailed(false)
          try {
            await client.order(productIds)
            setOrdered(true)
          } catch {
            setFailed(true)
          }
        }}
      />
    </>
  )
}
