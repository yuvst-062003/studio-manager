// §6.1 step 5's gate, §16's operator queue, and the two clients they read through.
//
// Exported so `App.tsx` mounts them BY NAME. HB-w6-health-gate-unmounted is why this
// barrel matters: a gate that is not exported is a gate the shell cannot mount, and a
// gate the shell does not mount does not gate anything.
export { StaffConsentGate } from './StaffConsentGate'
export type { StaffConsentStatus } from './StaffConsentGate'
export { makeStaffConsentClient, readConsentState } from './staffConsentClient'
export type { ConsentState, StaffConsentClient } from './staffConsentClient'
export { PrivacyOperatorScreen } from './PrivacyOperatorScreen'
export { makeStaffPrivacyClient } from './staffPrivacyClient'
export type { PrivacyRequest, PrivacyRequests, StaffPrivacyClient } from './staffPrivacyClient'
