// §6.1 step 5's gate, §11's screen, and the client both read through.
//
// Exported so `App.tsx` mounts them by name. HB-w6-health-gate-unmounted is the reason
// this barrel exists at all: a feature that is not exported is a feature the shell cannot
// mount, and a feature the shell does not mount does not ship.
export { ConsentGate } from './ConsentGate'
export type { ConsentGateStatus } from './ConsentGate'
export { PolicyDocument, DraftNotice } from './PolicyDocument'
export { PrivacyScreen } from './PrivacyScreen'
export { makePrivacyClient, readConsentState, REQUIRED_CONSENTS } from './privacyClient'
export type {
  ConsentRecord,
  ConsentState,
  PrivacyClient,
  PrivacyRequest,
  PrivacyRequests,
} from './privacyClient'
