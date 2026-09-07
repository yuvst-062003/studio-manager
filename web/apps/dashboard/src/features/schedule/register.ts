// This lane's `alert-centre` fill for §6.1/C12's coach unavailability — the same pattern
// `features/comms/register.ts` and `features/billing/register.ts` follow: one file, called
// once from the app's own entry, never at module import of a component file.
//
// `order: 17` — between M8's at-risk card (15) and M4's health-review hold (20). A coach
// unavailability the manager has not yet answered is an operational scheduling problem, not
// a child-safety or money one, so it sits below both; it is still time-sensitive (a session
// may need reassigning before it happens), so it sits above the trial queues, which can
// wait a day. `features/people/register.ts` left the gaps and said what belongs in them —
// this fills the one between 15 and 20.
import { registerSlot } from '@studio/ui'
import type { Locale } from '@studio/i18n'
import { makeCoachConstraintsSection } from './CoachConstraintsAlert'
import type { ScheduleClient } from './client'
import type { CoachConstraintClient } from './coachConstraintsClient'

export const COACH_CONSTRAINTS_ALERT_ORDER = 17

export function registerCoachConstraintAlerts(
  client: CoachConstraintClient,
  scheduleClient: ScheduleClient,
): void {
  registerSlot<{ locale: Locale }>('alert-centre', {
    key: 'schedule-coach-constraints',
    order: COACH_CONSTRAINTS_ALERT_ORDER,
    render: makeCoachConstraintsSection(client, scheduleClient),
  })
}
