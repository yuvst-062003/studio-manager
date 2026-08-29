// Dashboard artboards 7a, 7b, 7c, 6b and 4d — §5.8's events and §5.9's exams.
//
// **No `registerSlot` here.** Every one of this lane's dashboard artboards is a page; none
// of them is a section of somebody else's screen. The one slot fill M7 owns is `5d`, the
// setup wizard's belts step, and it lives in `features/belts/` beside the belt system it
// configures.
export { EventsScreen, splitByTime } from './EventsScreen'
export { EventCard, chipStatusFor, invitedCount } from './EventCard'
export { DEFAULT_TARGETS, EventForm, validate } from './EventForm'
export { EventPreviewCard, wallDate, wallTime } from './EventPreviewCard'
export { EventTargetPicker, describeTargets, reachesNobody, targetKey } from './EventTargetPicker'
export { EventPage, isConfirmed, tally } from './EventPage'
export { ExamsScreen } from './ExamsScreen'
export { ExamEligibilityScreen } from './ExamEligibilityScreen'
export { BeltTransition } from './BeltTransition'
export { EventDateBadge } from './EventDateBadge'
export { EVENT_TYPES, makeDashboardEventsClient } from './client'
export type {
  CandidateOut,
  DashboardEventsClient,
  EventExamResultOut,
  EventOut,
  EventRegistrationOut,
  EventStatus,
  EventTargetOut,
  EventType,
} from './client'
