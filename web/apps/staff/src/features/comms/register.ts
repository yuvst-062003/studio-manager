// This lane's slot fill in the staff app, registered the way M3's, M5's and M6's are.
//
// Called once from the app's own entry, never at module import of a component file — a
// registration that happens on import registers twice under HMR and in any test importing the
// barrel more than once. `features/people/register.ts` states the rule; every lane since has
// followed it.
import { registerSlot } from '@studio/ui'
import type { ComponentType } from 'react'
import { AtRiskAlert } from './AtRiskAlert'
import type { StaffCommsClient } from './staffCommsClient'
import type { Locale } from '@studio/i18n'

export type AtRiskAlertProps = { client: StaffCommsClient; locale: Locale }

/**
 * Between M5's attendance conflicts (5) and M3's pending requests (20).
 *
 * The gap is deliberate on both sides. M5's conflicts sit at 5 because "a coach's lost
 * register cannot wait an hour"; a child who has missed three lessons in a row is urgent in a
 * different sense — nothing is being lost while it waits, but §5.14 built this whole feature
 * against alerts that sit unread. Above a trial queue, below unsynced work.
 */
export const AT_RISK_ORDER = 12

export function registerCommsSections(render: ComponentType<AtRiskAlertProps>): void {
  registerSlot<AtRiskAlertProps>('alert-centre', {
    key: 'comms-at-risk',
    order: AT_RISK_ORDER,
    render,
  })
}

export { AtRiskAlert }
