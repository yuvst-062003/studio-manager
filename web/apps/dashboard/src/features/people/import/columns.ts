// The file's column contract — the one place the eleven columns are named, so the template
// the manager downloads, the header matcher that reads their file back, and the review
// table that shows it cannot drift from each other.
//
// Owner decisions (2026-09-18): trainee first, names split into first and last, the
// parent's too; only the trainee's first name and the email are required; a blank parent
// means an adult trainee (their own account, 18+); the four choice columns are CHOICE ONLY
// in Excel — the template's list validation refuses any other value — and Hebrew headers,
// because the file is filled in Hebrew Excel. The English names are the 2026-08-30 sample's
// headers, kept as aliases so a file written against it still imports.

export type ColumnKind = 'text' | 'date' | 'list'

export type ImportColumn = {
  key: ColumnKey
  /** The header the template writes and the manager sees. */
  he: string
  /** Other headers the matcher accepts, lower-cased. */
  aliases: readonly string[]
  kind: ColumnKind
  required: boolean
}

export type ColumnKey =
  | 'first_name'
  | 'last_name'
  | 'birthdate'
  | 'parent_first'
  | 'parent_last'
  | 'email'
  | 'phone'
  | 'group'
  | 'belt'
  | 'plan'
  | 'payment'

export const IMPORT_COLUMNS: readonly ImportColumn[] = [
  { key: 'first_name', he: 'שם פרטי', aliases: ['first_name', 'child_first', 'first name'], kind: 'text', required: true },
  { key: 'last_name', he: 'שם משפחה', aliases: ['last_name', 'child_last', 'last name'], kind: 'text', required: false },
  { key: 'birthdate', he: 'תאריך לידה', aliases: ['birthdate', 'birth_date', 'dob'], kind: 'date', required: false },
  { key: 'parent_first', he: 'שם פרטי ההורה', aliases: ['parent_first', 'שם פרטי הורה'], kind: 'text', required: false },
  { key: 'parent_last', he: 'שם משפחה ההורה', aliases: ['parent_last', 'שם משפחה הורה'], kind: 'text', required: false },
  { key: 'email', he: 'אימייל', aliases: ['email', 'מייל', 'אימייל הורה', 'דוא"ל'], kind: 'text', required: true },
  { key: 'phone', he: 'טלפון', aliases: ['phone', 'נייד'], kind: 'text', required: false },
  { key: 'group', he: 'קבוצה', aliases: ['group'], kind: 'list', required: true },
  { key: 'belt', he: 'חגורה', aliases: ['belt'], kind: 'list', required: false },
  { key: 'plan', he: 'מסלול', aliases: ['plan', 'price_plan', 'מסלול מחיר'], kind: 'list', required: true },
  { key: 'payment', he: 'הסדר תשלום מראש', aliases: ['payment', 'paid_by', 'payment_received', 'הסדר תשלום'], kind: 'list', required: true },
]

export const HEBREW_HEADERS: readonly string[] = IMPORT_COLUMNS.map((column) => column.he)

/** What a ROW cannot do without — which is NOT what `required` above says. That one is the
 *  header contract: `parse.ts` refuses a file whose first row is missing those columns, and
 *  the template always ships both, so it stays as it is.
 *
 *  This is the rule the manager reads and the row is judged by: a first name always, and
 *  ONE of email or phone (owner, 2026-09-23 — a club that has run on WhatsApp for years
 *  reaches half its families by phone). Marking אימייל with an asterisk in Excel and "חובה"
 *  on the column table said something the review no longer enforces, which is the kind of
 *  wrong that makes a manager invent an address rather than leave a cell blank. */
export type Mandatory = 'always' | 'contact' | 'optional'

export function mandatoryOf(key: ColumnKey): Mandatory {
  //: `group` and `plan` joined `first_name` on 2026-09-23, at the owner's word. Both were
  //: optional because §5.4a lets a manager create a lead and price them later — true of the
  //: phone enquiry the by-hand form was built for, and wrong for THIS door. A club arrives
  //: with its roster in a spreadsheet and the office already knows which group each child
  //: trains in and what the family pays; a blank there is a typo, not a decision. Left
  //: optional they produced the two failures the import exists to prevent: a hundred
  //: trainees with no enrollment, invisible on every roster and every register, and a
  //: hundred with no price, invisible to billing. Neither shows as an error anywhere —
  //: which is why the file has to refuse them rather than the manager having to notice.
  if (key === 'first_name' || key === 'group' || key === 'plan' || key === 'payment') return 'always'
  return key === 'email' || key === 'phone' ? 'contact' : 'optional'
}

/** One row of the file, every column as the text that was in the cell (dates already
 *  normalised to ISO by the parser, or `'invalid'`), plus the 1-based line it came from so
 *  a problem can be pointed back at the spreadsheet. */
export type RawRow = Record<ColumnKey, string> & { line: number }

/** Header matching is forgiving about what a human cannot see: case, surrounding space,
 *  doubled spaces, and the two shapes of the Hebrew apostrophe and quote — `ג'ודו` typed
 *  on a keyboard and `ג׳ודו` typed by a word processor are the same word. The same
 *  normalisation compares a group name in the file against the studio's list. */
export function normalizeName(value: string): string {
  return value
    .replace(/[׳’‘`´]/g, "'")
    .replace(/[״“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** The column a header cell names, or null for a column this import does not know
 *  (the template's own hidden list columns included — they are ignored on the way back). */
export function columnForHeader(header: string): ImportColumn | null {
  const wanted = normalizeName(header).replace(/\s*\*$/, '')
  if (!wanted) return null
  return (
    IMPORT_COLUMNS.find(
      (column) => normalizeName(column.he) === wanted || column.aliases.some((alias) => normalizeName(alias) === wanted),
    ) ?? null
  )
}
