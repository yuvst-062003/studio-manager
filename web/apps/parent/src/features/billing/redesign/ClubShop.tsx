// חנות המועדון — the redesigned shop tab, composed. Checkpoint 4 of the parent-app redesign.
//
// It replaces `ShopSection` + `OrderItemsScreen`, and keeps the two decisions those recorded,
// because neither was about how the screen looked:
//
//  - THE CLIENT NEVER SENDS A PRICE. `POST /me/orders/items` takes ids and quantities and
//    prices from the catalogue server-side, "for the same reason payment orders never take a
//    payer from the body". The basket's running total here is a display of what the parent
//    has chosen; the number on the receipt is the server's.
//  - AN ORDER BECOMES ORDINARY MANUAL CHARGES. §4.3: "inventory is a different product."
//    Nothing is paid on this screen and there is no fulfilment state to track — the payments
//    screen takes over, and it is the one with the double-payment guard in it.
//
// THE SUCCESS STATE USES THE SERVER'S TOTAL, not the basket's sum. `ItemOrderOut` returns
// `total_agorot`, and it is the only number that can be right: the catalogue this screen
// loaded may be minutes old, and a manager who repriced a גי in between would otherwise have
// the app tell a parent one figure while charging another.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch, formatAgorot, formatDateInStudioZone } from '@studio/core'
import type { Locale } from '@studio/i18n'
import { t } from '@studio/i18n'
import { ShopScreen } from './ShopScreen'
import { OrdersSheet } from './OrdersSheet'
import type { OrderRow } from './OrdersSheet'
import type { CartLine, CheckoutState, ShopProduct } from './types'

type ProductRow = {
  id: string
  name: string
  description?: string | null
  price_agorot: number
  sizes?: string[]
  image_url?: string | null
}

export function ClubShop({ locale }: { locale: Locale }) {
  const [products, setProducts] = useState<readonly ShopProduct[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [cart, setCart] = useState<readonly CartLine[]>([])
  const [checkout, setCheckout] = useState<CheckoutState>({ kind: 'idle' })
  // ההזמנות שלי — moved here from פרופיל on the owner's review of 2026-09-06.
  const [orders, setOrders] = useState<readonly OrderRow[] | null>(null)
  const [ordersOpen, setOrdersOpen] = useState(false)

  useEffect(() => {
    let live = true
    // `setFailed(false)` used to sit here, synchronously — which is a cascading render the
    // React Compiler's own rule flags. Both flags are set in the settled branches instead,
    // where they are already asynchronous and where the answer is actually known.
    void apiFetch('/api/v1/me/products')
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status))
        const body = (await response.json()) as { items: ProductRow[] }
        if (!live) return
        setFailed(false)
        setProducts(
          body.items.map((row) => ({
            id: row.id,
            name: row.name,
            // Returned by `/me/products` all along; the previous client type simply had no
            // field for it, so the manager's own words never reached a parent.
            description: row.description ?? null,
            priceAgorot: row.price_agorot,
            // `null` is the ordinary state of a product nobody has photographed, and the
            // card draws its default tile for it. Never a placeholder URL: a broken image
            // and an absent one look different and mean different things.
            imageUrl: row.image_url ?? null,
            sizes: row.sizes ?? [],
          })),
        )
      })
      .catch(() => {
        if (!live) return
        setProducts(null)
        setFailed(true)
      })
    return () => {
      live = false
    }
  }, [attempt])

  useEffect(() => {
    let live = true
    void apiFetch('/api/v1/me/charges')
      .then(async (response) => {
        if (!live) return
        if (!response.ok) return setOrders([])
        const body = (await response.json()) as {
          items: {
            id: string
            label?: string | null
            amount_agorot: number
            due_date: string
            product_id: string | null
          }[]
        }
        // `product_id`, not `created_by`. A shop order and a manager's ad-hoc charge are
        // BOTH `manual` — and so is §5.10's negative credit, which under the old filter
        // appeared here as a purchase of minus fifty shekels. The column added in revision
        // 0022 is the only thing that separates them, and it exists because this list does.
        setOrders(
          body.items
            .filter((charge) => charge.product_id !== null)
            .map((charge) => ({
              id: charge.id,
              label: charge.label ?? '',
              amountAgorot: charge.amount_agorot,
              dueDate: charge.due_date,
            }))
            .sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
        )
      })
      .catch(() => live && setOrders([]))
    return () => {
      live = false
    }
    // Re-read after a checkout lands, so an order just placed is in the list.
  }, [checkout.kind])

  const addToCart = useCallback((line: CartLine) => {
    setCart((current) => {
      // One line per (product, size, note). A second גי in the same size is a quantity, not
      // a row; a second one with a different name embroidered on it is a different row.
      const index = current.findIndex(
        (existing) =>
          existing.productId === line.productId &&
          existing.size === line.size &&
          existing.note === line.note,
      )
      if (index === -1) return [...current, line]
      const next = [...current]
      // The server's own ceiling is 10 per line, so merging two adds cannot exceed it.
      next[index] = {
        ...next[index]!,
        quantity: Math.min(10, next[index]!.quantity + line.quantity),
      }
      return next
    })
  }, [])

  const placeOrder = useCallback(() => {
    if (cart.length === 0) return
    setCheckout({ kind: 'sending' })
    void apiFetch('/api/v1/me/orders/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: cart.map((line) => ({
          product_id: line.productId,
          quantity: line.quantity,
          // Omitted rather than sent as null: the route refuses a size against a sizeless
          // item, and `size: null` reads on the wire like an answer that was given.
          ...(line.size ? { size: line.size } : {}),
          ...(line.note ? { note: line.note } : {}),
        })),
      }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status))
        const body = (await response.json()) as { charge_ids: string[]; total_agorot: number }
        setCheckout({
          kind: 'placed',
          lines: body.charge_ids.length,
          totalAgorot: body.total_agorot,
        })
        setCart([])
      })
      .catch(() => setCheckout({ kind: 'failed' }))
  }, [cart])

  const state: 'ready' | 'loading' | 'failed' = failed
    ? 'failed'
    : products === null
      ? 'loading'
      : 'ready'

  const money = useMemo(() => (agorot: number) => formatAgorot(agorot), [])

  return (
    <section aria-label={t(locale, 'billing.shop.title')} data-testid="parent-shop">
      <ShopScreen
        products={products}
        state={state}
        onRetry={() => setAttempt((n) => n + 1)}
        cart={cart}
        onAddToCart={addToCart}
        onSetQuantity={(index, quantity) =>
          setCart((current) =>
            current.map((line, at) => (at === index ? { ...line, quantity } : line)),
          )
        }
        onRemoveLine={(index) => setCart((current) => current.filter((_, at) => at !== index))}
        checkout={checkout}
        onCheckout={placeOrder}
        onCheckoutClose={() => setCheckout({ kind: 'idle' })}
        money={money}
        onOpenOrders={() => setOrdersOpen(true)}
      />

      {ordersOpen ? (
        <OrdersSheet
          orders={orders}
          money={money}
          dateLabel={(isoDate) => formatDateInStudioZone(`${isoDate}T12:00:00Z`, locale)}
          onClose={() => setOrdersOpen(false)}
        />
      ) : null}
    </section>
  )
}
