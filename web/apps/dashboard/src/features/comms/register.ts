// This lane's `alert-centre` fill on the dashboard. W5's contract commit assigns it to M8:
// "Slots | `alert-centre` at-risk cards (M8)".
//
// `6c` is M3's container and is never reopened — one file plus one line in this lane's own
// barrel, which is what seam 4 buys. Called from the app's entry and never at module import of
// a component file, per `features/people/register.ts`.
import { registerSlot } from '@studio/ui'
import type { ComponentType } from 'react'
import { AtRiskAlert } from './AtRiskAlert'
import type { DashboardCommsClient } from './dashboardCommsClient'
import type { Locale } from '@studio/i18n'

export type DashboardAtRiskProps = { client: DashboardCommsClient; locale: Locale }

/**
 * Below M6's debt alert (10) and above M3's pending requests (20).
 *
 * `features/people/register.ts` left the gaps deliberately and said what belongs in them.
 * Money first — an `amount_mismatch` is real money already received against charges that were
 * not settled — then a child who has stopped coming, then the trial queue.
 */
export const AT_RISK_ORDER = 15

export function registerCommsAlerts(render: ComponentType<DashboardAtRiskProps>): void {
  registerSlot<DashboardAtRiskProps>('alert-centre', {
    key: 'comms-at-risk',
    order: AT_RISK_ORDER,
    render,
  })
}

export { AtRiskAlert }
