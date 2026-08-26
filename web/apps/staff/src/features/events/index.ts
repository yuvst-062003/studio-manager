// Staff artboards 9i (אירועים בצוות) and 9d (מבחן חגורה).
//
// **No `registerSlot` here.** 9i is a page and 9d is a page; neither is a section of
// somebody else's screen. C2's documented exception — M7 having staff work with no new
// artboard — does not apply to this lane, which has two.
export { StaffEventsScreen, invited } from './StaffEventsScreen'
export { ExamResultsScreen } from './ExamResultsScreen'
export { ExamResultMark, nextResult } from './ExamResultMark'
export type { ExamResult } from './ExamResultMark'
export { BeltPair } from './BeltPair'
export { makeStaffEventsClient } from './client'
export type { CandidateOut, EventOut, StaffEventsClient } from './client'
