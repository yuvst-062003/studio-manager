// This lane's `alert-centre` fill on the dashboard. W5's contract commit assigns it to M8:
// "Slots | `alert-centre` at-risk cards (M8)".
//
// `6c` is M3's container and is never reopened — one file plus one line in this lane's own
// barrel, which is what seam 4 buys. Called from the app's entry and never at module import of
// a component file, per `features/people/register.ts`.
import { registerSlot } from '@studio/ui'
import { AtRiskAlert, makeAtRiskSection } from './AtRiskAlert'
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

/**
 * Takes the comms client rather than a render prop: the slot's renderer receives
 * `AlertSectionProps` — `{ locale, client: DashboardPeopleClient }` — so a component
 * wanting the COMMS client can never be mounted directly. The section closes over its
 * own client instead, the same correction `BillingAlertSection` already made for M6.
 * (The old render-prop signature was exported and called by nothing — the S1 guard
 * test found it, and the at-risk card had never rendered on the dashboard.)
 */
export function registerCommsAlerts(client: DashboardCommsClient): void {
  registerSlot<{ locale: Locale }>('alert-centre', {
    key: 'comms-at-risk',
    order: AT_RISK_ORDER,
    render: makeAtRiskSection(client),
  })
}

export { AtRiskAlert }
