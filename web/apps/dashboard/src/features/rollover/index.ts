// SPEC §5.15's training-year rollover — the dashboard's one door into this vertical.
//
// `App.tsx` imports the wizard and its client from here and nothing else: the seven steps are
// the container's business, and a step exported through this barrel is a step another screen
// could mount out of order.
export { RolloverWizard } from './RolloverWizard'
export { fill, makeRolloverClient, refusalLabel } from './client'
export type {
  AnnounceResult,
  BulkOutcome,
  BulkRefusal,
  ClassRow,
  ClosureIn,
  EnrollmentMove,
  EnrollmentRow,
  Fetcher,
  GenerateResult,
  GroupCreate,
  GroupRename,
  GroupRow,
  HolidayPreset,
  PlanRepricing,
  PricePlanRow,
  RolloverClient,
  RolloverGroupsIn,
  RolloverPricesIn,
  RolloverState,
  RolloverStep,
  RolloverStudentsIn,
  TrainingYear,
} from './client'
export { DERIVED_ROLLOVER_STEPS, ROLLOVER_STEP_ORDER, isDerivedStep } from './types'
export type { RolloverStepId, RolloverStepProps, RolloverStepStatus } from './types'
