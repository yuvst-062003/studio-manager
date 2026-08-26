// SPEC §5.15's wizard, as a contract its seven steps share.
//
// Mirrors `packages/ui/src/setup-wizard/types.ts` on purpose. §5.1's wizard and §5.15's are
// different flows with different lifetimes — one runs once when a club signs up, the other
// once a year — but the seam that made the first one survive three milestones is worth
// copying exactly, and it is the last paragraph of this file.
//
// The order is data rather than a switch statement for the same reason it is data in
// `app/services/schedule/rollover.py`: the rail renders it and the resume rule reads it, and
// a hard-coded order in the client plus another on the server is how the two drift.
import type { Locale } from '@studio/i18n'

export type RolloverStepId =
  | 'year'
  | 'closures'
  | 'groups'
  | 'students'
  | 'prices'
  | 'generate'
  | 'announce'

export type RolloverStepStatus = 'pending' | 'done' | 'skipped'

/** §5.15's seven steps, in the order the manager walks them. Right-to-left in `he`. */
export const ROLLOVER_STEP_ORDER: readonly RolloverStepId[] = [
  'year',
  'closures',
  'groups',
  'students',
  'prices',
  'generate',
  'announce',
]

/**
 * The two steps whose completion is OBSERVABLE from the data.
 *
 * `PATCH /rollover/{id}/steps/{stepId}` answers **409** for either of them —
 * `_DERIVED_STEPS` in `app/services/schedule/rollover.py`, and the refusal is deliberate:
 * "a client that believed it had marked generation done would let the manager activate a
 * year with an empty calendar." So the screen never renders a control that would send one.
 * The set is here rather than inlined in the container because two files need it and a
 * second copy is a second thing to forget.
 */
export const DERIVED_ROLLOVER_STEPS: readonly RolloverStepId[] = ['year', 'generate']

export function isDerivedStep(id: RolloverStepId): boolean {
  return DERIVED_ROLLOVER_STEPS.includes(id)
}

/**
 * What the container passes every step.
 *
 * `onDone` and `onSkip` exist because **the container never computes completeness** — each
 * step reports its own outcome. The container cannot know when *prices* is finished: a year
 * with no price rise closes no plan, so "zero rows written" and "not started" are
 * indistinguishable from the data. That is the same sentence
 * `app/services/schedule/rollover.py` uses to justify storing acknowledgements at all, and
 * the screen has to honour it or it will either loop the manager back to step 5 for ever or
 * tick it before they have looked.
 *
 * Each step declares its own props ON TOP of these — a client, a year id, a count. What it
 * never gets is a way to tell the container it is done other than these two functions.
 */
export type RolloverStepProps = {
  locale: Locale
  status: RolloverStepStatus
  onDone: () => void
  onSkip: () => void
}
