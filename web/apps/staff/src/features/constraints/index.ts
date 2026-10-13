// §4.8 / §6.1 — a coach's own unavailability. The SCREEN left this app on 2026-10-13 with
// two others the owner went through row by row; its CLIENT stayed, because §4.7's month
// calendar draws a coach's filed constraints onto the grid and asks the same endpoint for
// them. So this barrel exports the client and its types and nothing else — restoring the
// screen means restoring its file, not editing this line.
export { makeCoachConstraintsClient } from './constraintsClient'
export type {
  CoachConstraintInput,
  CoachConstraintReason,
  CoachConstraintRow,
  CoachConstraintStatus,
  CoachConstraintsClient,
} from './constraintsClient'
