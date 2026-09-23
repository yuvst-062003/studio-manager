// The file the manager downloads (owner, 2026-09-18): ONE sheet, headers only, and the four
// choice columns refuse anything that is not on the club's own list — Excel enforces it,
// not a note asking nicely.
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { HEBREW_HEADERS, IMPORT_COLUMNS, mandatoryOf } from './columns'
import { buildTemplate, LIST_ROWS, TEMPLATE_ROWS, type TemplateText } from './template'

const TEXT: TemplateText = {
  sheetName: 'חניכים',
  prompts: {
    first_name: 'השם הפרטי של החניך/ה',
    last_name: 'שם המשפחה',
    birthdate: 'יום/חודש/שנה',
    parent_first: 'ריק = בוגר',
    parent_last: '',
    email: 'של ההורה; לבוגר — שלו',
    phone: 'נשמר בכרטיס',
    group: 'בחרו מהרשימה',
    belt: 'בחרו מהרשימה',
    plan: 'בחרו מהרשימה',
    payment: 'בחרו מהרשימה',
  },
  listErrorTitle: 'לא ברשימה',
  listError: 'בחרו ערך מהרשימה הנפתחת.',
  dateErrorTitle: 'לא תאריך',
  dateError: 'כתבו תאריך, למשל 12/04/2018.',
  required: 'חובה',
  contactRequired: 'אימייל או טלפון',
}

const LISTS = {
  groups: ['ג׳ודו ילדים א׳', 'ג׳ודו נוער', 'בוגרים'],
  belts: ['לבן', 'צהוב', 'כתום'],
  plans: ['מנוי חודשי'],
  payments: ['מזומן', 'צ׳קים', 'הוראת קבע'],
}

async function roundTrip() {
  const blob = await buildTemplate(LISTS, TEXT)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await blob.arrayBuffer())
  return wb
}

describe('buildTemplate', () => {
  it('is one right-to-left sheet with the eleven headers and no data rows', async () => {
    const wb = await roundTrip()
    expect(wb.worksheets).toHaveLength(1)
    const ws = wb.worksheets[0]!
    expect(ws.name).toBe('חניכים')
    expect(ws.views[0]).toMatchObject({ rightToLeft: true, state: 'frozen', ySplit: 1 })
    const header = ws.getRow(1)
    HEBREW_HEADERS.forEach((label, index) => {
      expect(String(header.getCell(index + 1).value)).toContain(label)
    })
    // The asterisk marks what a ROW cannot do without, and that is the first name alone.
    // אימייל carried one until 2026-09-23, when email-or-phone replaced email-always; a
    // manager reading a star over an optional column invents an address rather than leaving
    // the cell blank, which is the expensive direction to be wrong in.
    expect(String(header.getCell(1).value)).toContain('*')
    expect(String(header.getCell(6).value)).not.toContain('*')
    expect(String(header.getCell(7).value)).not.toContain('*')
    expect(ws.getRow(2).getCell(1).value).toBeNull()
  })

  it('the four choice columns carry a strict list validation fed from hidden columns on the same sheet', async () => {
    const ws = (await roundTrip()).worksheets[0]!
    const group = ws.getCell('H2').dataValidation
    expect(group).toMatchObject({ type: 'list', allowBlank: true, showErrorMessage: true, errorStyle: 'stop' })
    expect(group.formulae[0]).toMatch(/^\$[A-Z]+\$2:\$[A-Z]+\$4$/)
    // ...and the same validation reaches the last template row.
    expect(ws.getCell(`H${TEMPLATE_ROWS + 1}`).dataValidation).toMatchObject({ type: 'list' })
    expect(ws.getCell('I2').dataValidation.type).toBe('list')
    expect(ws.getCell('J2').dataValidation.type).toBe('list')
    expect(ws.getCell('K2').dataValidation).toMatchObject({ type: 'list', showErrorMessage: true })

    // The lists themselves: hidden, headed, holding the club's names.
    const listColumn = Number(/\$([A-Z]+)\$/.exec(group.formulae[0])![1]!.charCodeAt(0)) - 64
    expect(ws.getColumn(listColumn).hidden).toBe(true)
    expect(ws.getCell(2, listColumn).value).toBe('ג׳ודו ילדים א׳')
    expect(ws.getCell(4, listColumn).value).toBe('בוגרים')
    expect(ws.getCell(1, listColumn).value).toBe(LIST_ROWS.groups)
  })

  it('the birthdate column is a date cell that refuses non-dates, and every column explains itself when selected', async () => {
    const ws = (await roundTrip()).worksheets[0]!
    expect(ws.getCell('C2').dataValidation).toMatchObject({ type: 'date', showErrorMessage: true, allowBlank: true })
    expect(ws.getColumn(3).numFmt).toBe('dd/mm/yyyy')
    expect(ws.getCell('A2').dataValidation).toMatchObject({ showInputMessage: true, prompt: 'השם הפרטי של החניך/ה' })
    expect(ws.getCell('F2').dataValidation.prompt).toBe('של ההורה; לבוגר — שלו')
  })

  it('a club with no belts yet gets a free-text belt column rather than an empty dropdown', async () => {
    const blob = await buildTemplate({ ...LISTS, belts: [] }, TEXT)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await blob.arrayBuffer())
    const ws = wb.worksheets[0]!
    expect(ws.getCell('I2').dataValidation?.type ?? 'none').not.toBe('list')
    expect(ws.getCell('H2').dataValidation.type).toBe('list')
  })
})


describe('what a row cannot do without', () => {
  it('is the first name always, and one of email or phone', () => {
    expect(mandatoryOf('first_name')).toBe('always')
    expect(mandatoryOf('email')).toBe('contact')
    expect(mandatoryOf('phone')).toBe('contact')
    // Everything the review lets through empty.
    for (const key of ['last_name', 'birthdate', 'parent_first', 'group', 'belt', 'plan', 'payment'] as const) {
      expect(mandatoryOf(key)).toBe('optional')
    }
  })

  it('is NOT the header contract — the file must still carry both columns', () => {
    // `required` on the column stays true for אימייל: `parse.ts` refuses a file whose first
    // row is missing it, and the template always ships it. The two rules answer different
    // questions and are deliberately kept apart.
    const email = IMPORT_COLUMNS.find((column) => column.key === 'email')!
    expect(email.required).toBe(true)
    expect(mandatoryOf('email')).toBe('contact')
  })
})
