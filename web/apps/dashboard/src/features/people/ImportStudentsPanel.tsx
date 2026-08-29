// Owner request 2026-08-30 — 'can import a file'. A CSV of families, one row per child,
// pushed through the SAME `POST /students` the by-hand form uses: the server matches
// siblings onto one parent by the verified email exactly as it does for the form, every
// validation stays server-side, and no second create path exists to drift.
//
// The template is fixed and downloadable from here, so "what columns" is never a support
// question. Hebrew content, English headers — headers are a contract, not copy.
import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { DashboardPeopleClient } from './peopleClient'

export const CSV_HEADERS = [
  'parent_first',
  'parent_last',
  'email',
  'phone',
  'child_first',
  'child_last',
  'birthdate',
] as const

export type CsvRow = {
  parent_first: string
  parent_last: string
  email: string
  phone: string
  child_first: string
  child_last: string
  birthdate: string
}

export type ParsedCsv =
  | { ok: true; rows: CsvRow[] }
  | { ok: false; error: 'bad_header' | 'empty' }

/** One line of CSV → cells. Quoted cells (`"a, b"`) survive their commas; doubled quotes
 *  inside them unescape. Deliberately no full RFC 4180 — no multi-line cells — because a
 *  name or a phone number never legitimately contains a newline. */
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
  return cells.map((value) => value.trim())
}

/** Exported so the rule is testable without a file input. The header row is the contract:
 *  refused outright when it does not match, because silently mis-mapping a column puts a
 *  phone number where a birthdate belongs across forty families. */
export function parseStudentsCsv(text: string): ParsedCsv {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
  if (lines.length === 0) return { ok: false, error: 'empty' }
  const header = splitCsvLine(lines[0]!).map((cell) => cell.toLowerCase())
  if (CSV_HEADERS.some((expected, index) => header[index] !== expected)) {
    return { ok: false, error: 'bad_header' }
  }
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line)
    return Object.fromEntries(
      CSV_HEADERS.map((key, index) => [key, cells[index] ?? '']),
    ) as CsvRow
  })
  if (rows.length === 0) return { ok: false, error: 'empty' }
  return { ok: true, rows }
}

const TEMPLATE = `${CSV_HEADERS.join(',')}\nרות,כהן,ruth@example.com,050-1234567,דנה,כהן,2018-04-12\n`

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  alignItems: 'start',
}

const tableStyle: CSSProperties = {
  borderCollapse: 'collapse',
  fontSize: 'var(--text-label)',
}

type RowState = 'pending' | 'sending' | 'created' | 'failed'

export function ImportStudentsPanel({
  locale,
  client,
  onImported,
}: {
  locale: Locale
  client: DashboardPeopleClient
  onImported?: () => void
}) {
  const [rows, setRows] = useState<CsvRow[] | null>(null)
  const [states, setStates] = useState<RowState[]>([])
  const [parseError, setParseError] = useState<'bad_header' | 'empty' | null>(null)
  const [running, setRunning] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const load = async (file: File) => {
    setParseError(null)
    const parsed = parseStudentsCsv(await file.text())
    if (!parsed.ok) {
      setRows(null)
      setParseError(parsed.error)
      return
    }
    setRows(parsed.rows)
    setStates(parsed.rows.map(() => 'pending'))
  }

  const importAll = async () => {
    if (!rows) return
    setRunning(true)
    // Sequential on purpose: rows of one family share a parent, and the server's
    // match-by-email needs the first sibling's guardian row committed before the second
    // arrives. Parallel writes would race that match into duplicate people.
    for (let index = 0; index < rows.length; index++) {
      if (states[index] === 'created') continue
      const row = rows[index]!
      setStates((current) => current.map((s, i) => (i === index ? 'sending' : s)))
      let outcome: RowState = 'failed'
      try {
        const response = await client.createStudent({
          first_name: row.child_first,
          last_name: row.child_last,
          birthdate: row.birthdate || null,
          guardian: {
            first_name: row.parent_first,
            last_name: row.parent_last,
            email: row.email || null,
            phone: row.phone || null,
            relation: 'parent',
          },
        })
        if (response.ok) outcome = 'created'
      } catch {
        outcome = 'failed'
      }
      setStates((current) => current.map((s, i) => (i === index ? outcome : s)))
    }
    setRunning(false)
    onImported?.()
  }

  return (
    <section style={panelStyle} aria-labelledby="import-students" data-testid="import-students">
      <h3 id="import-students" style={{ margin: 0 }}>
        {t(locale, 'people.import.title')}
      </h3>
      <p style={{ margin: 0 }}>{t(locale, 'people.import.hint')}</p>
      <a
        download="students.csv"
        href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
        data-testid="import-template"
      >
        {t(locale, 'people.import.template')}
      </a>
      <label>
        {t(locale, 'people.import.pickFile')}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'block' }}
          data-testid="import-file"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void load(file)
            event.target.value = ''
          }}
        />
      </label>
      {parseError ? (
        <p role="alert" data-testid="import-parse-error">
          {t(locale, `people.import.${parseError === 'bad_header' ? 'badHeader' : 'emptyFile'}`)}
        </p>
      ) : null}

      {rows ? (
        <>
          <table style={tableStyle} data-testid="import-preview">
            <caption className="studio-visually-hidden">
              {t(locale, 'people.import.title')}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t(locale, 'people.guardian.one')}</th>
                <th scope="col">{t(locale, 'people.student.one')}</th>
                <th scope="col">{t(locale, 'people.student.birthdate')}</th>
                <th scope="col">{t(locale, 'people.import.state')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} data-testid={`import-row-${index}`}>
                  <td>
                    <bdi>{`${row.parent_first} ${row.parent_last}`}</bdi>
                  </td>
                  <td>
                    <bdi>{`${row.child_first} ${row.child_last}`}</bdi>
                  </td>
                  <td>{row.birthdate}</td>
                  <td data-testid={`import-state-${index}`}>
                    {t(locale, `people.import.row.${states[index] ?? 'pending'}`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button
            disabled={running || states.every((state) => state === 'created')}
            onClick={() => void importAll()}
            data-testid="import-run"
          >
            {t(locale, 'people.import.run')}
          </Button>
        </>
      ) : null}
    </section>
  )
}
