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
export const WIZARD_STEP_ORDER: readonly WizardStepId[] = [
  'studio',
  'belts',
  'groups',
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
