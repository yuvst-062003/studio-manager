// §3 decision 1's mechanism, built once rather than four hardcoded branches: "One
// wizard, four step lists. The *door* decides which steps exist; a *status* decides
// which are still needed; the wizard opens on the first one still needed. If nothing is
// needed it does not open at all."
//
// Doors A (`/t/<slug>`) and B (`/join/<token>`) are not here. Door A has its own step
// list (agreements · students · health, no payment) and its own orchestrator
// (`../landing/TrialBookingFlow.tsx`) because it can be anonymous -- there is no
// `/me/onboarding-status` to read for a caller with no session at all. Door B's status
// is naturally empty for a brand-new identity (F9's own case) and its one non-trivial
// branch -- a RETURNING trial family -- still opens at step 1 per §3's own table ("Trial
// family → opens at step 1"), so `JoinFlow.tsx` keeps its existing `welcome`-first
// behaviour unchanged rather than routing through this module.
//
// Doors C (`/?invite=<token>`) and D (`#/add-child`) are the two doors this module
// serves: both are reached by a caller who ALREADY has an active studio, and both use
// `/me/onboarding-status` to decide whether the agreements step is still needed.
import type { WizardStepKey } from './OnboardingWizardChrome'

export type Door = 'join' | 'invite' | 'addChild'

//: The one place a wizard step key becomes the STATUS endpoint's key -- the two
//: vocabularies exist for a reason (`family`/`health`/`payment` are what the SCREENS are
//: called; `agreements`/`students`/`health`/`payment` are what the SERVER computes a
//: flag for), and this is the one seam where they have to agree.
const STATUS_KEY_FOR_STEP: Record<WizardStepKey, OnboardingStatusStepKey> = {
  welcome: 'agreements',
  family: 'students',
  health: 'health',
  payment: 'payment',
}

export type OnboardingStatusStepKey = 'agreements' | 'students' | 'health' | 'payment'

export type OnboardingStatus = {
  steps: readonly { key: OnboardingStatusStepKey; complete: boolean }[]
  next: OnboardingStatusStepKey | null
}

//: Doors C and D share one step list -- §3: "Door C is Door B with one row pre-filled,
//: not a separate 'gaps only' step list." Both are the full 4-step wizard; what differs
//: between them is what is already known going in (a pre-filled row for C, an existing
//: account for both), never the list of screens.
const FULL_STEPS: readonly WizardStepKey[] = ['welcome', 'family', 'health', 'payment']

export const DOOR_STEPS: Record<Door, readonly WizardStepKey[]> = {
  join: FULL_STEPS,
  invite: FULL_STEPS,
  addChild: FULL_STEPS,
}

/** §3 Door D: "The agreements step is skipped, not absent... The consents are already
 *  given, so the status marks the step done and the wizard opens past it. It reappears
 *  only when CLUB_TERMS_VERSION or POLICY_VERSION has moved." The same mechanism serves
 *  Door C's manager-invited parent, who has typically agreed to nothing yet and so sees
 *  it exactly as a first-time family would.
 *
 *  **Only the FIRST step is ever skipped this way.** `students` is not a step to skip --
 *  it is the reason these two doors exist ("+ הוסף ילד"/the manager's pre-filled row).
 *  `health` and `payment` are scoped to the students THIS RUN creates (decision 6), which
 *  a family-wide status flag describing EXISTING students cannot answer for a run still
 *  in progress -- `JoinFlow`'s own local `stillNeedsDeclaration` and `PaymentSetup`'s own
 *  `onNothingToPay` already handle "nothing left to ask" correctly for those two, the
 *  same way they do for every other door. A `null` status (still loading, or the read
 *  failed) is the honest "cannot say it is done" answer, so it opens at 'welcome' same as
 *  a first-time family -- asking once more is a lesser cost than silently skipping a
 *  document nobody actually confirmed reading.
 */
export function startingStep(door: Door, status: OnboardingStatus | null): WizardStepKey {
  const steps = DOOR_STEPS[door]
  const first = steps[0] ?? 'welcome'
  if (first !== 'welcome') return first
  const agreementsDone =
    status?.steps.find((row) => row.key === STATUS_KEY_FOR_STEP.welcome)?.complete ?? false
  if (!agreementsDone) return first
  return steps[1] ?? first
}
