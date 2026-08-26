// 5a, mounted (design pass 2026-08-27). `PricePlansScreen` was built and unit-tested in
// W4 and imported by nothing — plans could be created only through the setup wizard's
// step, never revisited. This container owns the list read and the refetch-on-change.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@studio/core'
import type { Locale } from '@studio/i18n'
import { PricePlansScreen } from './PricePlansScreen'
import { makeDashboardBillingClient } from './billingClient'
import type { PricePlanOut } from './billingClient'

export function PricesSection({ locale }: { locale: Locale }) {
  const client = useMemo(() => makeDashboardBillingClient(apiFetch), [])
  const [plans, setPlans] = useState<PricePlanOut[] | null>(null)
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let alive = true
    client
      .pricePlans()
      .then((rows) => alive && setPlans(rows))
      .catch(() => alive && setPlans([]))
    return () => {
      alive = false
    }
  }, [client, reloads])

  const onChanged = useCallback(() => setReloads((n) => n + 1), [])

  if (plans === null) return null
  return <PricePlansScreen locale={locale} client={client} plans={plans} onChanged={onChanged} />
}
