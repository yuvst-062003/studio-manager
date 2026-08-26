// Dashboard artboards 5b (מערכת חגורות) and 5d (the setup wizard's belts step).
//
// `5d` is this lane's ONE slot fill, and it lives here rather than in features/events/
// because it configures the belt system 5b defines. It registers itself into M1's
// `setup-wizard` slot from its own file — SetupWizard.tsx is never reopened, and neither is
// packages/ui/src/setup-wizard/register.ts, which registers M1's own four steps.
export { BeltSystemScreen, moved } from './BeltSystemScreen'
export { BeltsWizardStep, SCRATCH, registerBeltsWizardStep } from './BeltsWizardStep'
export { BELT_PALETTE, makeDashboardBeltsClient } from './client'
export type { BeltPresetOut, DashboardBeltsClient, LadderRankOut, StudentBeltOut } from './client'
