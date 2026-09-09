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
  //: The classes a plan may price. Read here beside the plans, so one failed read cannot
  //: leave the picker empty while the rest of the screen looks fine — an empty list makes
  //: every new plan studio-wide, which is a silent wrong answer rather than a visible one.
  const [classes, setClasses] = useState<readonly { id: string; name: string }[]>([])
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let alive = true
    client
      .pricePlans()
      .then((rows) => alive && setPlans(rows))
      .catch(() => alive && setPlans([]))
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

  if (plans === null) return null
  return (
    <PricePlansScreen
      classes={classes}
      client={client}
      locale={locale}
      onChanged={onChanged}
      plans={plans}
    />
  )
}
