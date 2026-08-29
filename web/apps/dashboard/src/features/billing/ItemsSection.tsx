// The items screen's read and its refetch-on-change, the same shape `PricesSection` uses.
//
// **`include_inactive` is always true here.** The screen's own toggle decides what is
// SHOWN; fetching only the active rows would make "show retired items" a second request
// that can fail on its own, and a retired גי that the manager is trying to revive would
// briefly not exist.
//
// A failed read is not an empty catalogue. `LoadFailed` rather than an empty list: "the
// club sells nothing" is a statement about the club, and the network must not be allowed
// to make it.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@studio/core'
import { LoadFailed } from '@studio/ui'
import type { Locale } from '@studio/i18n'
import { ItemsScreen } from './ItemsScreen'
import { makeDashboardBillingClient } from './billingClient'
import type { ProductOut } from './billingClient'

export function ItemsSection({ locale }: { locale: Locale }) {
  const client = useMemo(() => makeDashboardBillingClient(apiFetch), [])
  const [products, setProducts] = useState<ProductOut[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let alive = true
    client
      .products(true)
      .then((rows) => alive && setProducts(rows))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [client, reloads])

  const onChanged = useCallback(() => setReloads((n) => n + 1), [])

  if (failed) {
    return (
      <LoadFailed
        locale={locale}
        onRetry={() => {
          setFailed(false)
          setReloads((n) => n + 1)
        }}
      />
    )
  }
  if (products === null) return null
  return <ItemsScreen client={client} locale={locale} onChanged={onChanged} products={products} />
}
