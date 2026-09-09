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
  //: The classes an item may be filed under (2026-09-09). Read beside the products rather
  //: than inside the form, so one failed read cannot leave the picker empty while the rest
  //: of the screen looks fine — an empty list silently turns the class OPTIONAL, which is
  //: how an item ends up filed under nothing and invisible to every parent.
  const [classes, setClasses] = useState<readonly { id: string; name: string }[]>([])
  const [failed, setFailed] = useState(false)
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let alive = true
    client
      .products(true)
      .then((rows) => alive && setProducts(rows))
      .catch(() => alive && setFailed(true))
    void apiFetch('/api/v1/classes')
      .then(async (response) => {
        if (!alive || !response.ok) return
        const body = (await response.json()) as { items: { id: string; name: string }[] }
        setClasses(body.items)
      })
      .catch(() => undefined)
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
  return (
    <ItemsScreen
      classes={classes}
      client={client}
      locale={locale}
      onChanged={onChanged}
      products={products}
    />
  )
}
