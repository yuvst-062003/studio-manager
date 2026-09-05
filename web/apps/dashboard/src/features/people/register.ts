// This lane's `alert-centre` sections, registered the way M4's, M5's and M6's will be.
//
// Called once from the app's own entry, never at module import of a component file — a
// registration that happens on import registers twice under HMR and in any test importing
// the barrel more than once.
//
// The `order` values leave gaps deliberately: M6's debt alert belongs above a trial queue,
// M4's missing declarations below it, and neither lane should have to renumber what is
// already here to say so. Order 20 held the registration approval queue, deleted
// 2026-08-30 when its only producer of pending rows went: a parent adding a child enrols
// them, so there was nothing left for a manager to approve. Task 4b (2026-09-05) took the
// slot back for a different queue: the join wizard's health gate holds an enrolment
// rather than refusing it, and this is the manager's view of every hold.
import { registerSlot } from '@studio/ui'
import { PendingHealthReviewAlert } from './sections/PendingHealthReviewAlert'
import { TrialsAwaitingDecisionAlert } from './sections/TrialsAwaitingDecisionAlert'
import { UpcomingTrialsAlert } from './sections/UpcomingTrialsAlert'
import type { AlertSectionProps } from './AlertCentre'

export function registerPeopleAlerts(): void {
  // Task 4b -- above the trial queues. A child here cannot train until a manager acts;
  // a trial decision can wait a day.
  registerSlot<AlertSectionProps>('alert-centre', {
    key: 'people-pending-health-review',
    order: 20,
    render: PendingHealthReviewAlert,
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
