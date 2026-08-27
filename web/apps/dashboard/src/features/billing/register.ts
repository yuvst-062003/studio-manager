// This lane's slot fills, registered the way M3's are.
//
// Called once from the app's own entry, never at module import of a component file — a
// registration that happens on import registers twice under HMR and in any test importing
// the barrel more than once (`features/people/register.ts` states the rule).
//
// `order: 10` for the debt alert, because `features/people/register.ts` says so out loud:
// "M6's debt alert belongs above a trial queue". Its own orders start at 20 and leave the
// gap deliberately, so this lane renumbers nothing.
import { registerSlot } from '@studio/ui'
import type { Locale } from '@studio/i18n'
import { DebtAlert } from './DebtAlert'
import { RUN_JOB_ORDER, makeRunJobTool } from './RunJobTool'
import type { DashboardBillingClient } from './billingClient'

export const DEBT_ALERT_ORDER = 10

// `registerBillingAlerts` is gone. It declared the slot's renderer as `DebtAlertProps`,
// which the container never supplies, so nothing satisfying it could be mounted —
// `BillingAlertSection.tsx` explains the mismatch and registers the working section
// under the same key and order. The S1 guard test now fails on any register* export
// that no app calls, which is what caught the dead half surviving here.

export function registerBillingDevTools(client: DashboardBillingClient): void {
  registerSlot<{ locale: Locale }>('dev-bar', {
    key: 'runJob',
    order: RUN_JOB_ORDER,
    render: makeRunJobTool(client),
  })
}

export { DebtAlert }
