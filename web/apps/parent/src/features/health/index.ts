// §5.5's parent surface: the gate, the flow and the pad.
//
// The gate is a HARD BLOCK IN THE PARENT APP ONLY. Nothing on the mat is ever blocked — the
// coach's roster shows a ⚠ and the coach can still mark the student present. There is
// deliberately no `block_attendance_without_health` setting for either side to read.
// §6.1's blocking gate is the join wizard now (2026-09-06) — `HealthGate` and
// `AgreementFlow` are gone with it. What survived them is the pair of predicates three
// other screens ask; see `gating.ts` for why they are shared rather than restated.
export { firstStudentNeedingDeclaration, needsFullDeclaration } from './gating'
export type { GatedStudent } from './gating'
export { DeclarationForm } from './DeclarationForm'
export { RegistrationStep } from './RegistrationStep'
export { ClubTermsStep } from './ClubTermsStep'
export { applicableClause, CLAUSE_LIMITED, CLAUSE_NONE, CLAUSE_QUESTION_ID } from './clauses'
export { isValidNationalId } from './nationalId'
export { SignaturePad } from './SignaturePad'
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
