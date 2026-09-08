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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch, formatAgorot, formatDateInStudioZone, useRefreshSignal } from '@studio/core'
import type { Locale } from '@studio/i18n'
import { t } from '@studio/i18n'
import { DEMO_SIMULATOR, makeParentBillingClient } from '../billingClient'
import { PaymentOverlay } from '../PaymentOverlay'
import type { PaymentOverlayRequest } from '../PaymentOverlay'
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
  /** The uPay form, when a card order has been opened. Same overlay the payments screen
   *  uses — the parent never leaves the shop for it. */
  const [overlay, setOverlay] = useState<PaymentOverlayRequest | null>(null)
  const billing = useMemo(() => makeParentBillingClient(apiFetch), [])
  /** A card order opened but not yet handed to the overlay. Held so a retry after a failed
   *  form fetch reuses it instead of asking the server for a second order over charges it
   *  has already claimed. */
  const pendingRef = useRef<string | null>(null)
  const [checkout, setCheckout] = useState<CheckoutState>({ kind: 'idle' })
  // ההזמנות שלי — moved here from פרופיל on the owner's review of 2026-09-06.
  const [orders, setOrders] = useState<readonly OrderRow[] | null>(null)
  const [ordersOpen, setOrdersOpen] = useState(false)

  // Pull-to-refresh re-reads in place rather than reloading the document
  // (2026-09-08). It joins the dependency array this loader already has, so the
  // subscription cannot end up half-wired -- see tools/__tests__/refresh-coverage.
  const refreshSignal = useRefreshSignal()

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
  }, [attempt, refreshSignal])

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
          chargeIds: body.charge_ids,
        })
        setCart([])
      })
      .catch(() => setCheckout({ kind: 'failed' }))
  }, [cart])

  /**
   * Pay for the order that was just placed, without leaving the shop.
   *
   * **Neither route is new.** `createOrder`/`orderForm` is the same pair the payments
   * screen opens the uPay overlay with, and `createPromise` is the same call that raises a
   * cash promise and notifies the managers (`PaymentPromiseService._notify_managers`). Both
   * take charge ids and nothing else, which is why the shop can offer them over the charges
   * `POST /me/orders/items` just returned rather than growing a third payment path.
   *
   * A failure here is NOT an order failure: the charges exist either way, and saying "your
   * order failed" over a placed order would send a parent to order it a second time. That
   * is what `settleFailed` is for, and why it keeps the charge ids so a retry is possible.
   */
  const payByCard = useCallback(async () => {
    if (checkout.kind !== 'placed' && checkout.kind !== 'settleFailed') return
    const { lines, totalAgorot, chargeIds } = checkout
    setCheckout({ kind: 'settling', lines, totalAgorot, chargeIds })
    try {
      // **The retry reuses the order it already opened.** `OrderService.create` refuses a
      // charge already covered by an open order, so if the FORM fetch is what failed, a
      // second `createOrder` over the same charges 409s — and the parent could never reach
      // the payment page at all. `PaymentsScreen` solves it the same way; this is that
      // logic, not a second invention. One payment, no prepaid months: an item order is a
      // one-off, not a subscription.
      const publicRef =
        pendingRef.current ?? (await billing.createOrder([...chargeIds], 1, 0)).public_ref
      pendingRef.current = publicRef
      const form = await billing.orderForm(publicRef)
      if (form.action === DEMO_SIMULATOR.action) {
        // No live form exists in this deployment; the order is open and the IPN settles it.
        setCheckout({ kind: 'promised', totalAgorot })
        return
      }
      setOverlay({ kind: 'checkout', form })
      setCheckout({ kind: 'placed', lines, totalAgorot, chargeIds })
      pendingRef.current = null
    } catch {
      setCheckout({ kind: 'settleFailed', lines, totalAgorot, chargeIds })
    }
  }, [billing, checkout])

  const payByCash = useCallback(async () => {
    if (checkout.kind !== 'placed' && checkout.kind !== 'settleFailed') return
    const { lines, totalAgorot, chargeIds } = checkout
    setCheckout({ kind: 'settling', lines, totalAgorot, chargeIds })
    try {
      // `alreadyPaid: false` explicitly — this is "I will pay", not "I already did", and
      // the two are different claims to a manager. Zero prepaid months, as above.
      await billing.createPromise([...chargeIds], 'cash', 0, false)
      setCheckout({ kind: 'promised', totalAgorot })
    } catch {
      setCheckout({ kind: 'settleFailed', lines, totalAgorot, chargeIds })
    }
  }, [billing, checkout])

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
        locale={locale}
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
        onPayByCard={payByCard}
        onPayByCash={payByCash}
        onCheckout={placeOrder}
        onCheckoutClose={() => setCheckout({ kind: 'idle' })}
        money={money}
        onOpenOrders={() => setOrdersOpen(true)}
      />

      {overlay ? (
        <PaymentOverlay
          locale={locale}
          onClose={() => setOverlay(null)}
          onComplete={() => {
            setOverlay(null)
            // The IPN settles the charges; the shop's own list re-reads on the next open.
            setCheckout({ kind: 'idle' })
          }}
          request={overlay}
        />
      ) : null}

      {ordersOpen ? (
        <OrdersSheet
          orders={orders}
          locale={locale}
          money={money}
          dateLabel={(isoDate) => formatDateInStudioZone(`${isoDate}T12:00:00Z`, locale)}
          onClose={() => setOrdersOpen(false)}
        />
      ) : null}
    </section>
  )
}
