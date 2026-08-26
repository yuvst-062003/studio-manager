// The parent app's absence feature. §5.7's "לא אגיע היום", artboard `12a`.
//
// **No `registerSlot` here**, unlike every other feature barrel in this lane: `12a` is a
// screen of its own, not a section of somebody else's. The spec's own Slot row says `none`.
export { AbsenceScreen } from './AbsenceScreen'
export { AbsenceRefused, countdown, makeAbsenceClient } from './client'
export type { AbsenceClient, AbsenceError, AbsenceReportOut, UpcomingSession } from './client'
