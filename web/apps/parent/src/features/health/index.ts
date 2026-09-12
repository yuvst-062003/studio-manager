// §5.5's parent surface: the gate and the pad.
//
// **The flow is gone (2026-09-12).** `AgreementFlow` and its three screens -- the club's
// terms, the registration details and the declaration form -- were a second onboarding
// flow with its own five-step rail, reached only through the gate below. A manager who
// joined through the redesigned three-step wizard and then opened the app landed in it and
// reported the app had reverted. The gate now opens the one wizard, seeded with the
// family's own children; there is no second set of screens to drift from the first.
//
// The gate is a HARD BLOCK IN THE PARENT APP ONLY. Nothing on the mat is ever blocked — the
// coach's roster shows a ⚠ and the coach can still mark the student present. There is
// deliberately no `block_attendance_without_health` setting for either side to read.
export { HealthGate, firstStudentNeedingDeclaration } from './HealthGate'
export type { GatedStudent, HealthGateProps } from './HealthGate'
export { applicableClause, CLAUSE_LIMITED, CLAUSE_NONE, CLAUSE_QUESTION_ID } from './clauses'
export { isValidNationalId } from './nationalId'
export { makeHealthClient, isVisible, isAnswered, unansweredRequired } from './healthClient'
export type {
  AnswerValue,
  HealthClient,
  HealthDeclarationOut,
  TemplateQuestion,
  TemplateSchema,
  TemplateSection,
} from './healthClient'
export { registerHealthSections } from './StudentCardHealthSection'
