// §19.5's `runJob` — the dev-bar slot `packages/ui/src/dev-bar/tools.ts` has listed as M6's
// pending tool since M0.4, at `DEV_TOOL_ORDER.runJob = 40`.
//
// **D-M6-5 — it triggers `POST /billing-runs`, the real manager-scoped endpoint §7
// specifies.** `POST /dev/jobs/{name}/run` would live in `app/routers/dev.py`, which is the
// core lane's file, and §19.5's other three jobs — retention, the follow-up sweep,
// reconciliation suggestions — belong to the lanes that own them. This tool offers the
// billing job M6 owns; the next lane adds its own rather than re-deriving why.
//
// Registered through the PUBLIC `registerSlot` at exactly `DEV_TOOL_ORDER.runJob`, the way
// `apps/staff/src/features/attendance/devbar.tsx` does: `registerDevTool` is not on the
// package's export map, and registering under the exact key is what makes `PENDING_TOOLS`
// erase its own placeholder.
import { useState } from 'react'
import { Button } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { DashboardBillingClient } from './billingClient'

/** Must equal `packages/ui/src/dev-bar/tools.ts`'s `DEV_TOOL_ORDER.runJob`. Duplicated
 *  rather than imported because that module is not on the package's export map; the two
 *  numbers are asserted equal by this feature's own slot test. */
export const RUN_JOB_ORDER = 40

export function makeRunJobTool(client: DashboardBillingClient) {
  return function RunJobTool({ locale }: { locale: Locale }) {
    const [running, setRunning] = useState(false)
    const [created, setCreated] = useState<number | null>(null)
    const today = new Date()
    return (
      <span data-testid="dev-run-job">
        <Button
          variant="secondary"
          disabled={running}
          onClick={async () => {
            setRunning(true)
            try {
              const run = await client.runBilling(today.getFullYear(), today.getMonth() + 1)
              setCreated(run.charges_created)
            } finally {
              setRunning(false)
            }
          }}
        >
          {t(locale, 'billing.run.runNow')}
        </Button>
        {created !== null ? (
          <span data-testid="dev-run-result">
            {t(locale, 'billing.run.chargesCreated').replace('{{count}}', String(created))}
          </span>
        ) : null}
      </span>
    )
  }
}
