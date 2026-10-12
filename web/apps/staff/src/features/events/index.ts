// What is left of 9i (אירועים בצוות) and 9d (מבחן חגורה) after the owner removed both
// screens from the staff app (2026-10-13): the CLIENT and the two small pieces the
// schedule still draws with.
//
// §4.1 folds an event into the day's own session list, so `TodayScreen` and `timeline`
// read `EventOut` whether or not a screen listing events exists. The screens themselves —
// the list, the exam-results sheet and the event roster — are the dashboard's work now.
export { ExamResultMark, nextResult } from './ExamResultMark'
export type { ExamResult } from './ExamResultMark'
export { BeltPair } from './BeltPair'
export { makeStaffEventsClient } from './client'
export type { CandidateOut, EventOut, StaffEventsClient } from './client'
