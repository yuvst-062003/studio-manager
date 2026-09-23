// The file the manager downloads and writes in (owner, 2026-09-18): ONE sheet, headers only,
// built in the browser from THIS studio's groups, belts and plans, so what Excel offers in a
// cell is what the import will accept.
//
// The restriction is the point, not the dropdown. The four choice columns carry Excel's own
// list validation in "stop" mode — a dropdown of the club's names, and any other value is
// refused by Excel with an error — so a typo never reaches the review screen. The lists
// live in hidden columns of the same sheet: no second sheet to find, nothing to explain.
// The guidance is Excel's input message: select a cell and it says what goes there.
//
// No example rows. A row the manager forgets to delete would import a fake family; the
// worked example lives on the screen beside the download button instead.
import type { ColumnKey } from './columns'
import { IMPORT_COLUMNS, mandatoryOf } from './columns'

export type TemplateLists = {
  groups: readonly string[]
  belts: readonly string[]
  plans: readonly string[]
  payments: readonly string[]
}

export type TemplateText = {
  sheetName: string
  /** The input message each column shows when a cell in it is selected. */
  prompts: Record<ColumnKey, string>
  listErrorTitle: string
  listError: string
  dateErrorTitle: string
  dateError: string
  /** Suffix word for the tooltip of the column a row cannot do without. */
  required: string
  /** Suffix for אימייל and טלפון — one of the two, not both. */
  contactRequired: string
}

/** How many rows below the header carry validation. A club of 500 is the same cap the
 *  reader enforces; a longer roster is two files. */
export const TEMPLATE_ROWS = 500

/** Headers of the hidden list columns. Not one of the eleven, so the reader ignores them
 *  on the way back; named so a manager who unhides them understands what they are. */
export const LIST_ROWS = {
  groups: '· קבוצות',
  belts: '· חגורות',
  plans: '· מסלולים',
  payments: '· הסדר תשלום',
} as const

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const HEADER_FILL = 'FFE4F5EE'
const COLUMN_WIDTHS: Record<ColumnKey, number> = {
  first_name: 14,
  last_name: 14,
  birthdate: 14,
  parent_first: 16,
  parent_last: 16,
  email: 28,
  phone: 14,
  group: 22,
  belt: 12,
  plan: 18,
  payment: 20,
}
/** The list columns sit two past the data, leaving one blank column as a visual seam. */
const FIRST_LIST_COLUMN = IMPORT_COLUMNS.length + 2

const columnLetter = (index: number): string => {
  let n = index
  let letters = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    letters = String.fromCharCode(65 + rem) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

export async function buildTemplate(lists: TemplateLists, text: TemplateText): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(text.sheetName, {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  })

  // ── the header row ──────────────────────────────────────────────────────────────────
  IMPORT_COLUMNS.forEach((column, index) => {
    const cell = sheet.getCell(1, index + 1)
    cell.value = mandatoryOf(column.key) === 'always' ? `${column.he} *` : column.he
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.border = { bottom: { style: 'thin' } }
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
    sheet.getColumn(index + 1).width = COLUMN_WIDTHS[column.key]
  })
  sheet.getRow(1).height = 22

  // ── the hidden lists ────────────────────────────────────────────────────────────────
  const listRanges = new Map<ColumnKey, string>()
  const listSources: [ColumnKey, keyof TemplateLists][] = [
    ['group', 'groups'],
    ['belt', 'belts'],
    ['plan', 'plans'],
    ['payment', 'payments'],
  ]
  listSources.forEach(([key, source], offset) => {
    const values = lists[source]
    const columnIndex = FIRST_LIST_COLUMN + offset
    const letter = columnLetter(columnIndex)
    sheet.getCell(1, columnIndex).value = LIST_ROWS[source]
    values.forEach((value, i) => {
      sheet.getCell(i + 2, columnIndex).value = value
    })
    sheet.getColumn(columnIndex).hidden = true
    // An empty list would be a dropdown with nothing in it and a column nothing can be
    // typed into. A club that has not set its ladder up yet keeps free text there.
    if (values.length > 0) listRanges.set(key, `$${letter}$2:$${letter}$${values.length + 1}`)
  })

  // ── validation, row by row ──────────────────────────────────────────────────────────
  // Per cell rather than per range because that is the typed API; ExcelJS merges equal
  // neighbours back into one range when it writes.
  const birthdateIndex = IMPORT_COLUMNS.findIndex((column) => column.key === 'birthdate') + 1
  sheet.getColumn(birthdateIndex).numFmt = 'dd/mm/yyyy'

  IMPORT_COLUMNS.forEach((column, index) => {
    const mandatory = mandatoryOf(column.key)
    const suffix =
      mandatory === 'always' ? text.required : mandatory === 'contact' ? text.contactRequired : ''
    const promptTitle = suffix ? `${column.he} (${suffix})` : column.he
    const prompt = text.prompts[column.key]
    const shared = { allowBlank: true, showInputMessage: prompt !== '', promptTitle, prompt }
    const listRange = listRanges.get(column.key)
    const validation =
      column.kind === 'list' && listRange
        ? {
            ...shared,
            type: 'list' as const,
            formulae: [listRange],
            showErrorMessage: true,
            errorStyle: 'stop',
            errorTitle: text.listErrorTitle,
            error: text.listError,
          }
        : column.kind === 'date'
          ? {
              ...shared,
              type: 'date' as const,
              operator: 'between' as const,
              formulae: [new Date(Date.UTC(1920, 0, 1)), new Date(Date.UTC(2100, 0, 1))],
              showErrorMessage: true,
              errorStyle: 'stop',
              errorTitle: text.dateErrorTitle,
              error: text.dateError,
            }
          : {
              ...shared,
              type: 'textLength' as const,
              operator: 'lessThanOrEqual' as const,
              formulae: [254],
              showErrorMessage: false,
            }
    for (let row = 2; row <= TEMPLATE_ROWS + 1; row++) {
      sheet.getCell(row, index + 1).dataValidation = validation
    }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: XLSX_MIME })
}
