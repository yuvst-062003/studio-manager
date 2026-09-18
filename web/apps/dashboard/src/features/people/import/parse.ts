// The file half of the import: a manager's `.xlsx` or `.csv` becomes `RawRow`s, and nothing
// else happens here — no validation, no matching against the studio, no network. Those are
// `review.ts`'s, so the rules that decide what is importable can be tested without a file
// and the file reader can be tested without a studio.
//
// What this reader is forgiving about, because Excel does it without asking: dates that
// arrive as Date objects, serial numbers or `12/04/2018`; a phone typed as a number, which
// Excel strips the leading zero from; an email Excel turned into a hyperlink; a CSV a Hebrew
// Excel saved in Windows-1255 rather than UTF-8. What it is strict about: the header row.
// A column it cannot name is ignored, and a file without the two required headers is
// refused outright, because silently mis-mapping a column puts a phone number where a
// birthdate belongs across forty families.
import type { ColumnKey, RawRow } from './columns'
import { IMPORT_COLUMNS, columnForHeader } from './columns'

export const MAX_ROWS = 500

export type ParseError = 'empty' | 'bad_header' | 'unreadable' | 'too_many_rows'
export type Parsed = { ok: true; rows: RawRow[] } | { ok: false; error: ParseError }

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30)
const DAY_MS = 86_400_000

const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

function calendarDay(year: number, month: number, day: number): string | 'invalid' {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return 'invalid'
  const ms = Date.UTC(year, month - 1, day)
  const back = new Date(ms)
  // 31/02 rolls over into March; that roll-over is the tell of a date that does not exist.
  if (back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return 'invalid'
  return isoDay(ms)
}

/** Whatever a birthdate cell holds → an ISO day, `null` for blank, `'invalid'` for a value
 *  no reading makes a date. Day-first for the slash and dot shapes, because the file is
 *  Israeli: `03/01/2020` is the third of January, never the first of March. */
export function normalizeDate(value: unknown): string | null | 'invalid' {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 'invalid' : isoDay(value.getTime())
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 1 || value > 80_000) return 'invalid'
    return isoDay(EXCEL_EPOCH_UTC + Math.round(value) * DAY_MS)
  }
  const text = String(value).trim()
  if (text === '') return null
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(text)
  if (iso) return calendarDay(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const dayFirst = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text)
  if (dayFirst) return calendarDay(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]))
  return 'invalid'
}

/** A cell's text, whatever ExcelJS wrapped it in: a rich-text run, a hyperlink (what
 *  Excel makes of a typed email), a formula's cached result, or a bare number. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined || typeof value === 'boolean') return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 10 })
  }
  if (value instanceof Date) return isoDay(value.getTime())
  if (typeof value === 'object') {
    const v = value as { richText?: { text: string }[]; text?: unknown; result?: unknown; hyperlink?: unknown }
    if (Array.isArray(v.richText)) return v.richText.map((run) => run.text).join('').trim()
    if ('text' in v) return cellText(v.text)
    if ('result' in v) return cellText(v.result)
  }
  return String(value).trim()
}

/** Excel drops the leading zero of an Israeli mobile typed as a number; nine digits that
 *  start with 5 are that number with its zero missing. Anything else is left as typed. */
function phoneText(value: unknown): string {
  const text = cellText(value)
  return /^5\d{8}$/.test(text) ? `0${text}` : text
}

/** The header row is the contract. Columns may come in any order and unknown ones are
 *  ignored; the two required ones must be there. Blank rows are skipped, not counted. */
export function rowsFromGrid(grid: readonly (readonly unknown[])[]): Parsed {
  const headerIndex = grid.findIndex((row) => row.some((cell) => cellText(cell) !== ''))
  if (headerIndex === -1) return { ok: false, error: 'empty' }
  const header = grid[headerIndex]!
  const slots = new Map<ColumnKey, number>()
  header.forEach((cell, index) => {
    const column = columnForHeader(cellText(cell))
    if (column && !slots.has(column.key)) slots.set(column.key, index)
  })
  if (IMPORT_COLUMNS.some((column) => column.required && !slots.has(column.key))) {
    return { ok: false, error: 'bad_header' }
  }

  const rows: RawRow[] = []
  grid.slice(headerIndex + 1).forEach((cells, offset) => {
    const row = { line: headerIndex + offset + 2 } as RawRow
    let anything = false
    for (const column of IMPORT_COLUMNS) {
      const index = slots.get(column.key)
      const raw = index === undefined ? undefined : cells[index]
      let text: string
      if (column.kind === 'date') {
        const day = normalizeDate(raw)
        text = day === null ? '' : day
      } else if (column.key === 'phone') {
        text = phoneText(raw)
      } else {
        text = cellText(raw)
      }
      if (text !== '') anything = true
      row[column.key] = text
    }
    if (anything) rows.push(row)
  })
  if (rows.length === 0) return { ok: false, error: 'empty' }
  if (rows.length > MAX_ROWS) return { ok: false, error: 'too_many_rows' }
  return { ok: true, rows }
}

/** One CSV line → cells. Quoted cells (`"a, b"`) survive their commas; doubled quotes
 *  inside them unescape. Deliberately no multi-line cells — a name or a phone number never
 *  legitimately contains a newline. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      cells.push(cell)
      cell = ''
    } else cell += ch
  }
  cells.push(cell)
  return cells
}

export function parseCsvText(text: string): Parsed {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
  return rowsFromGrid(lines.map(splitCsvLine))
}

/** A Hebrew Excel's "CSV" is Windows-1255, and those bytes are not valid UTF-8 — which is
 *  exactly how they are told apart: decode strictly as UTF-8 first, fall back on failure.
 *  A BOM settles it as UTF-8 before either attempt. */
export function decodeCsvBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1255').decode(bytes)
  }
}

async function gridFromWorkbook(buffer: ArrayBuffer): Promise<unknown[][]> {
  // Loaded on demand: ExcelJS is the heaviest thing the dashboard ships, and only this
  // screen needs it.
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return []
  const grid: unknown[][] = []
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const cells: unknown[] = []
    for (let c = 1; c <= sheet.columnCount; c++) cells.push(row.getCell(c).value)
    grid.push(cells)
  }
  return grid
}

const isCsv = (file: File) => /\.csv$/i.test(file.name) || file.type === 'text/csv'

export async function parseImportFile(file: File): Promise<Parsed> {
  try {
    const buffer = await file.arrayBuffer()
    if (isCsv(file)) return parseCsvText(decodeCsvBytes(buffer))
    return rowsFromGrid(await gridFromWorkbook(buffer))
  } catch {
    return { ok: false, error: 'unreadable' }
  }
}
