// The dashboard's attendance feature. Artboards `4c` (נוכחות) and `1e`'s Quick View roster.
//
// **No `registerSlot` here.** Both artboards' Slot rows say `none`: `4c` is a page and `1e`'s
// popover is a piece of M2's week grid, mounted by whichever shell wins `1e` finding 1's
// merge. The `alert-centre` and `student-card` fills this lane owns are registered from the
// STAFF app's barrel, because that is the app that holds the offline queue those cards
// describe.
export { AttendanceReport } from './AttendanceReport'
export { QuickViewRoster } from './QuickViewRoster'
export { consecutiveAbsences, makeDashboardAttendanceClient } from './client'
export type {
  DashboardAttendanceClient,
  DashboardSessionRoster,
  UnmarkedSession,
} from './client'
