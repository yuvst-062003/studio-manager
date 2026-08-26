// The staff app's M8 surface. **No new artboard** — conflict C2, and the milestone plan says
// so outright: "M8's staff-surface work is real and screenless."
//
// Four pieces, all of them named in the lane brief: `push_token` registration for the staff
// app, notification preferences inside the existing `9e` drawer, the coach's at-risk push with
// its one-tap `צור קשר עם ההורה`, and the coach ICS feed
// (`calendar_feed.subject_type = 'coach'`).
export { AtRiskAlert, byMostMissed } from './AtRiskAlert'
export { NotificationPreferences } from './NotificationPreferences'
export { CoachCalendarFeed } from './CoachCalendarFeed'
export { useStaffPushRegistration, staffPlatformOf } from './useStaffPushRegistration'
export type { StaffPushState } from './useStaffPushRegistration'
export { makeStaffCommsClient, AT_RISK_KIND } from './staffCommsClient'
export type { AtRiskPayload, StaffCommsClient } from './staffCommsClient'
export { registerCommsSections, AT_RISK_ORDER } from './register'
