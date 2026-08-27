// §5.5's parent surface: the gate, the flow and the pad.
//
// The gate is a HARD BLOCK IN THE PARENT APP ONLY. Nothing on the mat is ever blocked — the
// coach's roster shows a ⚠ and the coach can still mark the student present. There is
// deliberately no `block_attendance_without_health` setting for either side to read.
export { HealthGate, firstStudentNeedingDeclaration } from './HealthGate'
export type { GatedStudent, HealthGateProps } from './HealthGate'
export { DeclarationForm } from './DeclarationForm'
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
