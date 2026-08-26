// This lane's `alert-centre` sections, registered the way M4's, M5's and M6's will be.
//
// Called once from the app's own entry, never at module import of a component file — a
// registration that happens on import registers twice under HMR and in any test importing
// the barrel more than once.
//
// The `order` values leave gaps deliberately: M6's debt alert belongs above a trial queue,
// M4's missing declarations below it, and neither lane should have to renumber what is
// already here to say so.
import { registerSlot } from '@studio/ui'
import { PendingRequestsAlert } from './sections/PendingRequestsAlert'
import { TrialsAwaitingDecisionAlert } from './sections/TrialsAwaitingDecisionAlert'
import { UpcomingTrialsAlert } from './sections/UpcomingTrialsAlert'
import type { AlertSectionProps } from './AlertCentre'

export function registerPeopleAlerts(): void {
  registerSlot<AlertSectionProps>('alert-centre', {
    key: 'people-pending-requests',
    order: 20,
    render: PendingRequestsAlert,
  })
  registerSlot<AlertSectionProps>('alert-centre', {
    key: 'people-trials-awaiting',
    order: 40,
    render: TrialsAwaitingDecisionAlert,
  })
  registerSlot<AlertSectionProps>('alert-centre', {
    key: 'people-upcoming-trials',
    order: 60,
    render: UpcomingTrialsAlert,
  })
}
