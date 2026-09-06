// §6.1 step 5's gate, §11's screen, and the client both read through.
//
// Exported so `App.tsx` mounts them by name. HB-w6-health-gate-unmounted is the reason
// this barrel exists at all: a feature that is not exported is a feature the shell cannot
// mount, and a feature the shell does not mount does not ship.
// `ConsentGate` is gone (2026-09-06): §6.1 step 5 is the join wizard's own agreements
// screen, and the wizard is what `App.tsx` now mounts in front of the app.
// The legal copy moved to @studio/ui when the staff sign-in began linking to the same
// two documents. Re-exported here so this feature's public surface is unchanged.
export { PolicyDocument, DraftNotice } from '@studio/ui'
export { PrivacyScreen } from './PrivacyScreen'
export { makePrivacyClient, readConsentState, REQUIRED_CONSENTS } from './privacyClient'
export type {
  ConsentRecord,
  ConsentState,
  PrivacyClient,
  PrivacyRequest,
  PrivacyRequests,
} from './privacyClient'
