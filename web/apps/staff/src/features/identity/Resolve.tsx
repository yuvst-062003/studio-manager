// §6.1's staff-app first launch, after the setup wizard left this app (owner, 2026-10-13).
//
// **What this used to decide.** §6.1 step 3 had two non-refusal arms: an owner of a studio
// that had not been set up went to the setup wizard (§5.1), and everybody else went to
// Today. The arm existed because §5.1 said both the staff app and the dashboard routed into
// the same wizard, so either app could be an owner's first door.
//
// The owner's call: the wizard does not belong in the coach app at all. Setting a club up —
// classes, halls, the training year, the price list — is desk work done on the dashboard,
// and this app is for the person standing on a mat. It was also the only reason this file
// asked `/api/v1/setup` on launch and held a three-valued "have we asked yet" state to keep
// the wizard from flashing at every returning owner.
//
// So the branch is gone, the question with it, and what is left is the second arm: staff
// access means Today. The wizard itself is untouched in `@studio/ui` and the dashboard still
// routes into it — this is one app's door closing, not a feature being deleted.
//
// The refusal arm — "no role assignment anywhere" — moved to `AccessGate` (2026-09-02),
// which wraps this component's caller rather than living inside it. Everything here runs
// under the guarantee it provides: `session.access.staff` is `true`.
import { StaffLanding } from './StaffLanding'

export function Resolve() {
  return <StaffLanding />
}
