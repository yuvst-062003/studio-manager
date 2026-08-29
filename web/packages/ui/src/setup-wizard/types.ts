// SPEC §5.1's wizard, as a contract two other milestones will register into.
//
// The step ids are all six the canvas draws, not the four M1 builds: *complete* means
// every one of the six is `done`, and a four-value union would report a studio finished
// before its belt system existed.
import type { ComponentType } from 'react'
import type { Locale } from '@studio/i18n'

export type WizardStepId = 'studio' | 'belts' | 'groups' | 'prices' | 'staff' | 'students'

export type WizardStepStatus = 'pending' | 'done' | 'skipped'

/** The canvas order, right-to-left in he. `order` in the slot registry mirrors it. */
/**
 * Mirrors `WIZARD_STEPS` in `app/services/structure/setup.py`, which carries the reason:
 * `groups` runs before `belts` because a belt ladder hangs off a class (`belt_rank.class_id`
 * is NOT NULL) and classes are created in `groups`. The canvas ordered them the other way
 * and that order could not be walked — belts met a fresh owner with an empty class picker.
 */
export const WIZARD_STEP_ORDER: readonly WizardStepId[] = [
  'studio',
  'groups',
  'belts',
  'prices',
  'staff',
  'students',
]

export type WizardStep = {
  id: WizardStepId
  order: number
  status: WizardStepStatus
  at: string | null
}

/** The `GET /api/v1/setup` payload, and what every transition returns. */
export type SetupProgress = {
  steps: WizardStep[]
  /** Every one of the six is `done`. Governs the dashboard checklist, nothing else. */
  complete: boolean
  /** The owner chose an exit at step 6. Governs auto-routing, nothing else. */
  dismissed_at: string | null
}

/**
 * What the container passes every step.
 *
 * `onDone` and `onSkip` exist because **the container never computes completeness** —
 * each step reports its own outcome. That is what makes the seam hold: the container
 * cannot know when *belts* is finished without M7 reopening it, and M7 must not have to.
 */
export type WizardStepProps = {
  locale: Locale
  status: WizardStepStatus
  onDone: () => void
  onSkip: () => void
}

export type WizardStepComponent = ComponentType<WizardStepProps>
