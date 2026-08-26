// Dashboard artboard 4e, and D11's editor behind it.
//
// NO MEDICAL CONTENT reaches either screen: only whether a document exists, who owes it, and how
// to ask. The full record is opened as a PDF, which the server audit-logs (§11.2) and which
// `documents.viewFullNotice` warns the manager about first.
export { DocumentsScreen, chaseable, chipStatusFor, statusLabel, filterLabel } from './DocumentsScreen'
export {
  TemplateEditor,
  withFlag,
  withNewQuestion,
  withQuestionLabel,
  withoutQuestion,
} from './TemplateEditor'
export { makeHealthClient } from './healthClient'
export type {
  DashboardHealthClient,
  DocumentFilter,
  EditableQuestion,
  EditableSchema,
  EditableSection,
  HealthStatusSummaryOut,
} from './healthClient'
