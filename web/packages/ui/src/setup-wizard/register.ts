// The four M1 steps, registered into the 'setup-wizard' slot.
//
// One call per step. M7 adds `belts` at order 2 and M6 adds `prices` at order 4 the same
// way — one file, one line here — and SetupWizard.tsx is never reopened for either.
//
// Called by the app rather than at module load: the steps need a fetcher, and a module
// that registered itself on import would have to reach for a global one.
import { registerSlot } from '../slots'
import { makeGroupsStep } from './GroupsStep'
import { makeStaffStep } from './StaffStep'
import { makeStudentsStep } from './StudentsStep'
import { makeStudioStep } from './StudioStep'
import {
  makeStaffClient,
  makeStructureClient,
  makeStudentsClient,
  makeStudioClient,
} from './client'
import type { Fetcher } from './client'
import type { WizardStepProps } from './types'

export function registerM1WizardSteps(fetcher: Fetcher): void {
  registerSlot<WizardStepProps>('setup-wizard', {
    key: 'studio',
    order: 1,
    render: makeStudioStep(makeStudioClient(fetcher)),
  })
  registerSlot<WizardStepProps>('setup-wizard', {
    key: 'groups',
    // 2, not 3: belts moved down because a ladder hangs off a class and classes are
    // created here. These numbers must agree with `WIZARD_STEP_ORDER` and with the
    // `order: 3` in `BeltsWizardStep.tsx` — two steps claiming one position is how the
    // owner lands on the wrong panel.
    order: 2,
    render: makeGroupsStep(makeStructureClient(fetcher)),
  })
  registerSlot<WizardStepProps>('setup-wizard', {
    key: 'staff',
    // 6, not 5: items sits at 5 since 2026-08-30 (owner request).
    order: 6,
    render: makeStaffStep(makeStaffClient(fetcher)),
  })
  registerSlot<WizardStepProps>('setup-wizard', {
    key: 'students',
    order: 7,
    render: makeStudentsStep(makeStudentsClient(fetcher)),
  })
}
