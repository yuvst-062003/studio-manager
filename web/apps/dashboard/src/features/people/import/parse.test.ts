// The file half of the import (owner, 2026-09-18): a manager's Excel, as Excel actually
// saves it — Hebrew headers, locale dates, a hyperlinked email cell — and the CSV a Hebrew
// Excel writes, which is Windows-1255 and never UTF-8.
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { decodeCsvBytes, normalizeDate, parseCsvText, parseImportFile, rowsFromGrid } from './parse'
import { HEBREW_HEADERS } from './columns'

describe('rowsFromGrid — the header row is the contract', () => {
  it('maps the Hebrew headers in any column order and ignores columns it does not know', () => {
    const parsed = rowsFromGrid([
      ['הערות', 'אימייל', 'שם פרטי', 'קבוצה', 'מסלול'],
      ['x', 'ruth@example.com', 'דנה', 'ג׳ודו ילדים א׳', 'מנוי חודשי'],
    ])
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]).toMatchObject({
      first_name: 'דנה',
      email: 'ruth@example.com',
      group: 'ג׳ודו ילדים א׳',
      last_name: '',
      line: 2,
    })
  })

  it('still reads the old English header NAMES — they are aliases, not a second contract', () => {
    const parsed = rowsFromGrid([
      ['parent_first', 'parent_last', 'email', 'phone', 'child_first', 'child_last', 'birthdate', 'group', 'plan'],
      ['רות', 'כהן', 'ruth@example.com', '050', 'דנה', 'כהן', '2018-04-12', 'ג׳ודו ילדים א׳', 'מנוי חודשי'],
    ])
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.rows[0]).toMatchObject({
      parent_first: 'רות',
      first_name: 'דנה',
      last_name: 'כהן',
      birthdate: '2018-04-12',
      group: 'ג׳ודו ילדים א׳',
      plan: 'מנוי חודשי',
    })
  })

  it('refuses the 2026-08-30 sample outright, because it cannot make an importable row', () => {
    // That sample has seven columns and neither קבוצה nor מסלול, and both became required
    // on 2026-09-23. Every row it produced would be flagged, so refusing the FILE — with a
    // message naming the missing columns — beats a hundred identical red rows the manager
    // would have to answer one dropdown at a time.
    expect(
      rowsFromGrid([
        ['parent_first', 'parent_last', 'email', 'phone', 'child_first', 'child_last', 'birthdate'],
        ['רות', 'כהן', 'ruth@example.com', '050', 'דנה', 'כהן', '2018-04-12'],
      ]),
    ).toEqual({ ok: false, error: 'bad_header' })
  })

  it('refuses a sheet whose header row lacks any required column', () => {
    expect(rowsFromGrid([['שם פרטי', 'טלפון'], ['דנה', '050']])).toEqual({
      ok: false,
      error: 'bad_header',
    })
  })

  it('skips blank rows and refuses a file with only a header', () => {
    expect(
      rowsFromGrid([['שם פרטי', 'אימייל', 'קבוצה', 'מסלול'], ['', '', '', ''], ['   ', '', '', '']]),
    ).toEqual({
      ok: false,
      error: 'empty',
    })
  })

  it('refuses more than 500 rows rather than sending a thousand requests', () => {
    const grid = [
      ['שם פרטי', 'אימייל', 'קבוצה', 'מסלול'],
      ...Array.from({ length: 501 }, (_, i) => [`ילד${i}`, 'a@b.c', 'ג׳ודו ילדים א׳', 'מנוי חודשי']),
    ]
    expect(rowsFromGrid(grid)).toEqual({ ok: false, error: 'too_many_rows' })
  })
})

describe('normalizeDate — whatever Excel hands over becomes an ISO day', () => {
  it('reads Israeli dd/mm/yyyy and dd.mm.yyyy', () => {
    expect(normalizeDate('12/04/2018')).toBe('2018-04-12')
    expect(normalizeDate('3.1.2020')).toBe('2020-01-03')
  })
  it('keeps ISO as is', () => {
    expect(normalizeDate('2018-04-12')).toBe('2018-04-12')
  })
  it('reads a Date object and an Excel serial', () => {
    expect(normalizeDate(new Date(Date.UTC(2018, 3, 12)))).toBe('2018-04-12')
    // 43202 is 2018-04-12 in Excel's 1900 date system.
    expect(normalizeDate(43202)).toBe('2018-04-12')
  })
  it('is null for blank and "invalid" for nonsense', () => {
    expect(normalizeDate('')).toBeNull()
    expect(normalizeDate('אתמול')).toBe('invalid')
    expect(normalizeDate('31/02/2018')).toBe('invalid')
  })
})

describe('CSV', () => {
  it('parses a UTF-8 file with a BOM and quoted commas', () => {
    const parsed = parseCsvText(
      '\uFEFFשם פרטי,שם משפחה,אימייל,קבוצה,מסלול\n"כהן, דנה",כהן,r@x.com,נוער,מנוי חודשי\n',
    )
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.rows[0]!.first_name).toBe('כהן, דנה')
  })

  it('decodes the Windows-1255 bytes a Hebrew Excel writes', () => {
    // "שם" in cp1255 is 0xF9 0xED; in UTF-8 those bytes are invalid, which is the tell.
    const bytes = new Uint8Array([0xf9, 0xed, 0x2c, 0x61, 0x0a])
    expect(decodeCsvBytes(bytes.buffer)).toBe('שם,a\n')
  })

  it('leaves valid UTF-8 without a BOM alone', () => {
    const bytes = new TextEncoder().encode('שם,a\n')
    expect(decodeCsvBytes(bytes.buffer)).toBe('שם,a\n')
  })
})

describe('XLSX through parseImportFile', () => {
  it('reads the first sheet, Excel dates and hyperlinked emails included', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('חניכים')
    ws.addRow([...HEBREW_HEADERS])
    const row = ws.addRow([])
    row.getCell(1).value = 'דנה'
    row.getCell(2).value = 'כהן'
    row.getCell(3).value = new Date(Date.UTC(2018, 3, 12))
    row.getCell(4).value = 'רות'
    row.getCell(5).value = 'כהן'
    row.getCell(6).value = { text: 'ruth@example.com', hyperlink: 'mailto:ruth@example.com' }
    // Typed as a number, so Excel dropped the leading zero; the reader puts it back.
    row.getCell(7).value = 501234567
    row.getCell(8).value = 'ג׳ודו ילדים א׳'
    const buffer = await wb.xlsx.writeBuffer()
    const file = new File([buffer], 'students.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const parsed = await parseImportFile(file)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.rows[0]).toMatchObject({
      first_name: 'דנה',
      birthdate: '2018-04-12',
      email: 'ruth@example.com',
      phone: '0501234567',
      group: 'ג׳ודו ילדים א׳',
    })
  })

  it('says a non-spreadsheet is unreadable instead of throwing', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.xlsx')
    expect(await parseImportFile(file)).toEqual({ ok: false, error: 'unreadable' })
  })
})
