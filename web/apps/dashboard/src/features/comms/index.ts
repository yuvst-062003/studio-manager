// Dashboard artboard `4f` (הודעות — קהל יעד ותצוגה מקדימה), §5.11's delivery report, §6.5's
// install list, and this lane's `alert-centre` fill.
export {
  AnnouncementsScreen,
  truncateForLockScreen,
  PUSH_TITLE_BUDGET,
} from './AnnouncementsScreen'
export type { ScopeOption } from './AnnouncementsScreen'
export { DeliveryReport, inFlightCount } from './DeliveryReport'
export { InstallState } from './InstallState'
export { AtRiskAlert, byMostMissed } from './AtRiskAlert'
export type { AtRiskPayload } from './AtRiskAlert'
export { registerCommsAlerts, AT_RISK_ORDER } from './register'
export type { DashboardAtRiskProps } from './register'
export {
  makeDashboardCommsClient,
  phoneList,
  whatsappShareUrl,
  AT_RISK_KIND,
} from './dashboardCommsClient'
export type { DashboardCommsClient } from './dashboardCommsClient'
