// The staff app's M8 surface. **No new artboard** — conflict C2, and the milestone plan says
// so outright: "M8's staff-surface work is real and screenless."
//
// Three pieces, all of them named in the lane brief: `push_token` registration for the staff
// app, notification preferences inside the existing `9e` drawer, and the coach ICS feed
// (`calendar_feed.subject_type = 'coach'`).
//
// **The fourth piece — the coach's at-risk push — no longer has a component here.**
// `AtRiskAlert.tsx` and its `staff-alerts` registration (`register.ts`) were deleted
// 2026-09-06: the same at-risk notification was rendering twice, once as this banner card
// and once as a `features/tasks` task card, and the owner's call was "tasks tab only".
// `byMostMissed` and `AT_RISK_KIND` outlive the deleted component — the tasks tab's own
// `deriveTasks.ts::callParentTasks` reads both, and `atRisk()` below still hits the same
// coach-scoped inbox `AtRiskAlert` used to.
export { NotificationPreferences } from './NotificationPreferences'
export { CoachCalendarFeed } from './CoachCalendarFeed'
export { StaffPushSetting } from './StaffPushSetting'
export {
  useStaffPushRegistration,
  staffPlatformOf,
  reconcileStaffPushRegistration,
} from './useStaffPushRegistration'
export type { StaffPushState } from './useStaffPushRegistration'
export { makeStaffCommsClient, AT_RISK_KIND, byMostMissed } from './staffCommsClient'
export type { AtRiskPayload, StaffCommsClient } from './staffCommsClient'
