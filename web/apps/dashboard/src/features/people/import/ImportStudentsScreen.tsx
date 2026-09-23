// §5.4(a) at volume — ייבוא חניכים מקובץ. The door a club walks through when it arrives
// with a hundred families in a spreadsheet, which is the case the by-hand screen beside it
// was never for.
//
// **What this replaced (owner review, 2026-09-18).** The 2026-08-30 import was a CSV panel
// at the foot of הוספת חניכים: seven English headers, one sample row, a native file input,
// and a table that said "נכשל" with no reason. It could not read the file a Hebrew Excel
// actually saves (Windows-1255, `12/04/2018`), it created leads only — a hundred imported
// trainees all "טרם שויך", each to be converted by hand — and it knew nothing of adults,
// duplicates or the family a row belongs to.
//
// **Two steps, one screen.** The owner cut the third: review and import were two screens
// for one job. Step 1 is the file — a template the manager downloads and writes in (one
// sheet; the four choice columns refuse anything not on the club's own lists) and a drop
// zone. Step 2 is the table: every row from the file grouped by family, every cell
// editable in place, every problem named on its row with the fix beside it, and one
// button. Pressing it runs the import on this same screen; each row then shows its
// outcome, and a row that was never fixed stays editable to be fixed and imported from
// the same place.
//
// **Nothing here writes on its own.** The runner makes exactly the three calls the by-hand
// screen makes (create → convert → belt) and the server sends each family's invitation on
// create as it always has, so there is no second create path to drift and no link for a
// manager to copy and paste. Families finish the wizard themselves, from the email.
//
// The visual language is הוספת חניכים's: the numbered step strip, the tile, the chips, the
// same tokens. A screen that looked like a different product in the middle of the dashboard
// would be the wrong kind of new.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { Button, Icon } from '@studio/ui'
import { fill } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { DashboardPeopleClient } from '../peopleClient'
import type { ColumnKey } from './columns'
import { IMPORT_COLUMNS, mandatoryOf } from './columns'
import type { ParseError } from './parse'
import { parseImportFile } from './parse'
import type { Draft, Family, Lists, Payment, Problem } from './review'
import { beltIdInGroup, beltsForGroup, draftsFromRows, familiesOf, problemsOf } from './review'
import type { FamilyOutcome, ImportResult, InvitationOutcome, RowOutcome, RowState } from './run'
import { runImport } from './run'
import { buildTemplate } from './template'
import '../people.css'

type Props = {
  locale: Locale
  client: DashboardPeopleClient
  onImported?: () => void
}

type FileError = ParseError | 'unsupported'

const today = () => new Date().toISOString().slice(0, 10)
//: `none` first, because "not yet" is the commonest answer for a club mid-season and the
//: manager should not have to hunt past three methods to say it.
const PAYMENTS: readonly Exclude<Payment, ''>[] = ['none', 'cash', 'cheque', 'standing_order']

/** A choice cell shows what the FILE said when nothing matched — and that display must not
 *  sit on the EMPTY value, or the empty choice becomes unreachable. A `<select>` fires no
 *  change event when you pick the option that is already selected, so with the two sharing
 *  a value there was no way to answer "no group" or "not paid yet" once the file had
 *  written something unmatched. For קבוצה/חגורה/מסלול that only hid a legitimate answer;
 *  for הסדר תשלום it was a dead end, because the row's own advice for a card is "leave it
 *  empty" and empty was the one thing the manager could not choose (found 2026-09-23 by
 *  filling a file with bad data and looking at the screen).
 *
 *  So the unmatched display gets a value of its own, and the real empty option is always
 *  rendered beside it. */
const UNMATCHED = '__unmatched__'
const unmatchedValue = (id: string, fromFile: string) => id || (fromFile ? UNMATCHED : '')
const chosen = (value: string) => (value === UNMATCHED ? '' : value)

/** Choosing a group, and what it does to the belt beside it. The ladder hangs off the
 *  class, so the belt must be re-asked — but of the LISTS, not of the manager: the row
 *  carries the belt by name (the file's word when it did not match, the resolved belt's own
 *  name when it did), and whatever the new ladder still has is kept. */
function regroup(draft: Draft, lists: Lists, groupId: string): Partial<Draft> {
  const carried =
    draft.belt_name ||
    beltsForGroup(lists, draft.group_id).find((belt) => belt.id === draft.belt_rank_id)?.name ||
    ''
  const resolved = beltIdInGroup(lists, groupId, carried)
  return {
    group_id: groupId,
    group_name: '',
    belt_rank_id: resolved,
    belt_name: resolved ? '' : carried,
  }
}

// ── styles ──────────────────────────────────────────────────────────────────────────
// Inline objects, for the reason the add-students screen already gives: every value is a
// token, so `data-surface="studio-os"` and dark mode both come out right without this file
// naming a colour of its own.
const column: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }
const card: CSSProperties = {
  background: 'var(--surface-raised)',
  border: '1px solid var(--border)',
  borderRadius: '11px',
  padding: 'var(--space-4)',
}
const rowBetween: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  flexWrap: 'wrap',
}
const chipBase: CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: '999px',
  border: '1px solid transparent',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  whiteSpace: 'nowrap',
  lineHeight: 1.5,
}
const tile: CSSProperties = {
  inlineSize: '44px',
  blockSize: '44px',
  borderRadius: '10px',
  background: 'var(--emphasis-tint)',
  color: 'var(--accent)',
  display: 'grid',
  placeItems: 'center',
  flex: 'none',
}
const hint: CSSProperties = { margin: 0, fontSize: '12px', color: 'var(--text-muted)' }
const h3: CSSProperties = { margin: 0, fontSize: '15px', fontWeight: 700 }
const cellInput: CSSProperties = {
  inlineSize: '100%',
  boxSizing: 'border-box',
  minBlockSize: '32px',
  paddingBlock: '4px',
  paddingInline: '8px',
  fontSize: '13px',
  borderRadius: '2px',
}
const iconButton: CSSProperties = {
  inlineSize: '32px',
  blockSize: '32px',
  display: 'grid',
  placeItems: 'center',
  border: '1px solid transparent',
  borderRadius: '6px',
  background: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
}

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info'
const TONES: Record<Tone, CSSProperties> = {
  neutral: { background: 'var(--ground)', color: 'var(--text-secondary)', borderColor: 'var(--border)' },
  ok: { background: 'var(--paid-tint)', color: 'var(--paid)', borderColor: 'var(--paid)' },
  warn: { background: 'var(--pending-tint)', color: 'var(--pending)', borderColor: 'var(--pending)' },
  danger: { background: 'var(--danger-tint)', color: 'var(--danger)', borderColor: 'var(--danger)' },
  info: { background: 'var(--cancelled-tint)', color: 'var(--cancelled)', borderColor: 'var(--cancelled)' },
}

function Chip({ tone, icon, children, testId, wrap }: { tone: Tone; icon?: 'check' | 'warning' | 'mail' | 'documents'; children: ReactNode; testId?: string; wrap?: boolean }) {
  return (
    <span style={{ ...chipBase, ...TONES[tone], ...(wrap ? { whiteSpace: 'normal', lineHeight: 1.35, paddingBlock: '3px' } : {}) }} data-testid={testId}>
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  )
}

/** The three glyphs the shared set does not carry, drawn in its grammar (24-box, 1.7px
 *  round strokes, currentColor) so they sit beside the others without a seam. */
function Glyph({ name, size = 18 }: { name: 'upload' | 'download' | 'sheet'; size?: number }) {
  const paths = {
    upload: (
      <>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      </>
    ),
    download: (
      <>
        <path d="M12 4v12" />
        <path d="m7 11 5 5 5-5" />
        <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </>
    ),
    sheet: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18" />
        <path d="M3 15h18" />
        <path d="M9 4v16" />
      </>
    ),
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flex: 'none' }}>
      {paths[name]}
    </svg>
  )
}

/** The numbered strip from the add-students screen, two steps wide. `lead` picks the
 *  sentence under the title: the review step reads differently after the button. */
function StepStrip({ locale, current, lead }: { locale: Locale; current: 1 | 2; lead: 'file' | 'review' | 'done' }) {
  const steps = [
    { n: 1 as const, title: t(locale, 'people.import.step1'), note: t(locale, 'people.import.step1Note') },
    { n: 2 as const, title: t(locale, 'people.import.step2'), note: t(locale, 'people.import.step2Note') },
  ]
  const done = lead === 'done'
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={rowBetween}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--fg)' }}>{t(locale, 'people.import.title')}</h1>
          <p style={{ ...hint, marginBlockStart: '2px' }}>{t(locale, `people.import.lead.${lead}`)}</p>
        </div>
        <span style={{ ...chipBase, ...TONES.neutral }} data-testid="import-step-of">
          {fill(t(locale, 'people.import.stepOf'), { n: current, total: 2 })}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))', gap: 'var(--space-2)' }}>
        {steps.map((step) => {
          const active = step.n === current && !done
          const finished = step.n < current || done
          return (
            <div
              key={step.n}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: '10px 12px',
                borderRadius: '10px',
                background: active ? 'var(--emphasis)' : 'var(--emphasis-tint)',
                color: active ? 'var(--on-emphasis)' : 'var(--accent)',
                border: active ? '1px solid transparent' : '1px solid var(--border)',
              }}
            >
              <span
                aria-hidden
                style={{
                  inlineSize: '24px',
                  blockSize: '24px',
                  borderRadius: '999px',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '11px',
                  fontWeight: 700,
                  flex: 'none',
                  background: active ? 'var(--surface-raised)' : 'transparent',
                  color: active ? 'var(--accent)' : 'inherit',
                  border: active ? 'none' : '1px solid currentColor',
                }}
              >
                {finished ? <Icon name="check" size={14} /> : step.n}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
                <span style={{ fontSize: '13px', fontWeight: 700 }}>{step.title}</span>
                <span style={{ fontSize: '11px', opacity: 0.85 }}>{step.note}</span>
              </span>
            </div>
          )
        })}
      </div>
      <div aria-hidden style={{ blockSize: '6px', borderRadius: '999px', background: 'var(--ground)', overflow: 'hidden' }}>
        <div style={{ blockSize: '100%', inlineSize: `${done ? 100 : current * 50}%`, background: 'var(--emphasis)' }} />
      </div>
    </div>
  )
}

/** A blob handed to the browser, not a data: URI — the deployed CSP refuses data:
 *  navigations, which read as "the link fails" (owner, 2026-08-30). */
function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

// ── the studio's lists ──────────────────────────────────────────────────────────────
/** Groups, active plans, the belt ladder of every class a group belongs to, and every
 *  student already in the club — loaded once, so the template can be built from them and
 *  the review can check against them. */
function useLists(client: DashboardPeopleClient): Lists | null {
  const [lists, setLists] = useState<Lists | null>(null)
  useEffect(() => {
    let alive = true
    void (async () => {
      const [groupsPage, plansPage] = await Promise.all([
        client.groups().catch(() => ({ items: [] })),
        client.pricePlans().catch(() => ({ items: [] })),
      ])
      // Base groups only (owner, 2026-09-18): the file assigns each trainee the ONE group
      // a plan always includes. Extras and private lessons are chosen in the app later,
      // and a retired group is not offered to anyone new.
      const groups = groupsPage.items.filter((group) => group.is_active !== false && (group.kind ?? 'base') === 'base')
      const classIds = [...new Set(groups.map((group) => group.class_id).filter((id): id is string => Boolean(id)))]
      const ladders = await Promise.all(
        classIds.map((classId) => client.beltRanks(classId).then((page) => [classId, page.items] as const).catch(() => [classId, []] as const)),
      )
      const existing: { first_name: string; last_name: string; birthdate: string | null; guardian_display_names?: string[] }[] = []
      let after: string | undefined
      // Every page, not the first: a duplicate on page three is still a duplicate.
      for (let guard = 0; guard < 50; guard++) {
        const page = await client.students({ after, limit: '200' }).catch(() => null)
        if (!page) break
        existing.push(...page.items)
        if (!page.has_more || !page.next_cursor) break
        after = page.next_cursor
      }
      if (!alive) return
      setLists({
        groups,
        beltsByClass: Object.fromEntries(ladders),
        // Closed plans are last year's price and must never be offered to a child joining
        // today — the same filter the by-hand screen applies.
        plans: plansPage.items.filter((plan) => plan.active_to === null),
        existing,
      })
    })()
    return () => {
      alive = false
    }
  }, [client])
  return lists
}

// ── the screen ──────────────────────────────────────────────────────────────────────
export function ImportStudentsScreen({ locale, client, onImported }: Props) {
  const lists = useLists(client)
  const [phase, setPhase] = useState<'file' | 'review'>('file')
  const [fileName, setFileName] = useState('')
  const [fileError, setFileError] = useState<FileError | null>(null)
  const [reading, setReading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [filter, setFilter] = useState<'all' | 'problems'>('all')
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({})
  const [result, setResult] = useState<ImportResult | null>(null)
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null)
  const [editingFamily, setEditingFamily] = useState<string | null>(null)
  const [resends, setResends] = useState<Record<string, 'sending' | 'sent' | 'failed'>>({})
  const fileRef = useRef<HTMLInputElement | null>(null)
  const day = today()

  const emptyLists: Lists = useMemo(() => ({ groups: [], beltsByClass: {}, plans: [], existing: [] }), [])
  const known = lists ?? emptyLists

  const families = useMemo(() => familiesOf(drafts), [drafts])
  const problems = useMemo(() => new Map(drafts.map((draft) => [draft.id, problemsOf(draft, known, day)])), [drafts, known, day])
  const added = (draft: Draft) => rowStates[draft.id] === 'added'
  const pending = drafts.filter((draft) => !added(draft))
  const ready = pending.filter((draft) => problems.get(draft.id)!.length === 0)
  const withProblems = pending.filter((draft) => problems.get(draft.id)!.length > 0)
  const imported = result !== null

  // ── step 1 ────────────────────────────────────────────────────────────────────────
  const download = async () => {
    setDownloading(true)
    try {
      const belts = [...new Set(Object.values(known.beltsByClass).flat().map((belt) => belt.name))]
      const blob = await buildTemplate(
        {
          groups: known.groups.map((group) => group.name),
          belts,
          plans: known.plans.map((plan) => plan.name),
          payments: PAYMENTS.map((payment) => t(locale, `people.import.payment.${payment}`)),
        },
        {
          sheetName: t(locale, 'people.import.template.sheet'),
          prompts: Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.key, t(locale, `people.import.tpl.prompt.${c.key}`)])) as Record<ColumnKey, string>,
          listErrorTitle: t(locale, 'people.import.tpl.listErrorTitle'),
          listError: t(locale, 'people.import.tpl.listError'),
          dateErrorTitle: t(locale, 'people.import.tpl.dateErrorTitle'),
          dateError: t(locale, 'people.import.tpl.dateError'),
          required: t(locale, 'people.import.tpl.required'),
          contactRequired: t(locale, 'people.import.tpl.contactRequired'),
        },
      )
      downloadBlob(blob, t(locale, 'people.import.template.fileName'))
    } finally {
      setDownloading(false)
    }
  }

  const load = async (file: File) => {
    setFileError(null)
    if (!/\.(xlsx|csv)$/i.test(file.name) && file.type !== 'text/csv') {
      setFileError('unsupported')
      return
    }
    setReading(true)
    const parsed = await parseImportFile(file)
    setReading(false)
    if (!parsed.ok) {
      setFileError(parsed.error)
      return
    }
    setFileName(file.name)
    setDrafts(draftsFromRows(parsed.rows, known))
    setRowStates({})
    setResult(null)
    setFilter('all')
    setPhase('review')
  }

  // ── step 2 ────────────────────────────────────────────────────────────────────────
  const patchDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((current) => current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)))
  const removeDraft = (id: string) => setDrafts((current) => current.filter((draft) => draft.id !== id))
  const patchFamily = (family: Family, patch: Partial<Pick<Draft, 'parent_first' | 'parent_last' | 'email' | 'phone'>>) => {
    const ids = new Set(family.members.map((member) => member.id))
    setDrafts((current) => current.map((draft) => (ids.has(draft.id) ? { ...draft, ...patch } : draft)))
  }

  const run = async () => {
    if (ready.length === 0) return
    const readyIds = new Set(ready.map((draft) => draft.id))
    const toSend = families
      .map((family) => ({ ...family, members: family.members.filter((member) => readyIds.has(member.id)) }))
      .filter((family) => family.members.length > 0)
    setRunning({ done: 0, total: ready.length })
    let done = 0
    const outcome = await runImport(toSend, client, {
      today: day,
      beltNote: t('he', 'people.import.beltNote'),
      onRow: (id, state) => {
        setRowStates((current) => ({ ...current, [id]: state }))
        if (state !== 'sending') setRunning({ done: ++done, total: ready.length })
      },
    })
    setResult((previous) =>
      previous
        ? { rows: new Map([...previous.rows, ...outcome.rows]), families: new Map([...previous.families, ...outcome.families]) }
        : outcome,
    )
    setRunning(null)
    onImported?.()
  }

  const resend = async (family: Family, studentId: string) => {
    setResends((current) => ({ ...current, [family.key]: 'sending' }))
    try {
      const response = await client.resendInvitation(studentId)
      setResends((current) => ({ ...current, [family.key]: response.ok ? 'sent' : 'failed' }))
    } catch {
      setResends((current) => ({ ...current, [family.key]: 'failed' }))
    }
  }

  // ── render ────────────────────────────────────────────────────────────────────────
  if (phase === 'file') {
    return (
      <section style={column} aria-labelledby="import-title" data-testid="import-screen">
        <StepStrip locale={locale} current={1} lead="file" />
        <FileStep
          locale={locale}
          error={fileError}
          reading={reading}
          downloading={downloading}
          fileRef={fileRef}
          onDownload={() => void download()}
          onFile={(file) => void load(file)}
        />
      </section>
    )
  }

  const addedCount = drafts.filter(added).length
  const familyOutcomes = result?.families ?? new Map<string, FamilyOutcome>()
  const familiesAdded = families.filter((family) => family.members.some(added)).length
  // No `sent` and no `mailFailed` any more: the import never asks the server to send, so
  // the only outcomes it can produce are a credential waiting (`held`) and a guardian who
  // already has an account (`not_needed`). What replaced the mail counters is the count of
  // invitations now sitting ready, which is what the manager comes back for.
  const invitesHeld = [...familyOutcomes.values()].filter((outcome) => outcome.invitation === 'held').length
  const invitesNotNeeded = [...familyOutcomes.values()].filter((outcome) => outcome.invitation === 'not_needed').length

  const shown = filter === 'problems' ? families.filter((family) => family.members.some((member) => withProblems.includes(member))) : families
  const runLabel =
    running !== null
      ? fill(t(locale, 'people.import.running'), { done: running.done, total: running.total })
      : imported
        ? fill(t(locale, 'people.import.done.runLeft'), { n: ready.length })
        : ready.length === 1
          ? t(locale, 'people.import.runOne')
          : fill(t(locale, 'people.import.run'), { n: ready.length })

  return (
    <section style={column} aria-labelledby="import-title" data-testid="import-screen">
      <StepStrip locale={locale} current={2} lead={imported ? 'done' : 'review'} />

      {imported ? (
        <div style={{ ...card, background: 'var(--emphasis-tint)', borderColor: 'var(--emphasis)', display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }} data-testid="import-done">
          <span style={{ ...tile, background: 'var(--emphasis)', color: 'var(--on-emphasis)' }}>
            <Icon name="check" size={22} />
          </span>
          <div style={{ flex: 1, minInlineSize: '16rem' }}>
            <div style={{ fontSize: '18px', fontWeight: 700 }}>{fill(t(locale, 'people.import.done.title'), { trainees: addedCount, families: familiesAdded })}</div>
            <div style={{ ...hint, color: 'var(--text-secondary)', marginBlockStart: '2px' }}>
              {[
                invitesHeld > 0 ? fill(t(locale, 'people.import.done.held'), { n: invitesHeld }) : null,
                invitesNotNeeded > 0 ? fill(t(locale, 'people.import.done.notNeeded'), { n: invitesNotNeeded }) : null,
                withProblems.length > 0 ? fill(t(locale, 'people.import.done.left'), { n: withProblems.length }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
            <div style={{ ...hint, marginBlockStart: '6px', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--accent)', marginBlockStart: '1px' }}><Icon name="mail" size={14} /></span>
              <span>{t(locale, 'people.import.done.note')}</span>
            </div>
          </div>
          <a className="studio-btn" data-variant="primary" href="#/students" data-testid="import-finish">
            {t(locale, 'people.import.done.finish')}
          </a>
        </div>
      ) : null}

      <div style={rowBetween}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span style={{ ...chipBase, ...TONES.neutral, fontSize: '12px', padding: '6px 10px', fontWeight: 500 }} data-testid="import-file-chip">
            <Glyph name="sheet" size={14} />
            <bdi>{fileName}</bdi>
            {' · '}
            {fill(t(locale, 'people.import.file.rows'), { n: drafts.length })}
          </span>
          {imported ? null : (
            <Button variant="ghost" onClick={() => setPhase('file')} data-testid="import-replace" style={{ minBlockSize: '32px', padding: '6px 12px', fontSize: '13px' }}>
              {t(locale, 'people.import.file.replace')}
            </Button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--space-2)', inlineSize: 'min(560px, 100%)' }} data-testid="import-stats">
          {imported ? (
            <>
              <Stat n={familiesAdded} label={t(locale, 'people.import.stat.families')} color="var(--emphasis)" />
              <Stat n={addedCount} label={t(locale, 'people.import.stat.added')} color="var(--paid)" />
              <Stat n={invitesHeld} label={t(locale, 'people.import.stat.held')} color="var(--emphasis)" />
              <Stat n={withProblems.length} label={t(locale, 'people.import.stat.problems')} color="var(--pending)" />
            </>
          ) : (
            <>
              <Stat n={families.length} label={t(locale, 'people.import.stat.families')} color="var(--emphasis)" />
              <Stat n={drafts.length} label={t(locale, 'people.import.stat.trainees')} color="var(--emphasis)" />
              <Stat n={ready.length} label={t(locale, 'people.import.stat.ready')} color="var(--paid)" />
              <Stat n={withProblems.length} label={t(locale, 'people.import.stat.problems')} color="var(--pending)" />
            </>
          )}
        </div>
      </div>

      <div style={rowBetween}>
        <div role="group" aria-label={t(locale, 'people.import.filter.all')} style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: '999px', padding: '3px', background: 'var(--surface-raised)', gap: '2px' }}>
          {(['all', 'problems'] as const).map((key) => {
            const active = filter === key
            const count = key === 'all' ? drafts.length : withProblems.length
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(key)}
                data-testid={`import-filter-${key}`}
                style={{
                  font: 'inherit',
                  fontSize: '13px',
                  fontWeight: active ? 600 : 400,
                  padding: '6px 14px',
                  borderRadius: '999px',
                  border: 'none',
                  cursor: 'pointer',
                  background: active ? 'var(--emphasis)' : 'transparent',
                  color: active ? 'var(--on-emphasis)' : 'var(--text-secondary)',
                }}
              >
                {t(locale, `people.import.filter.${key}`)} · {count}
              </button>
            )
          })}
        </div>
        <span style={hint}>{t(locale, 'people.import.review.hint')}</span>
      </div>

      {shown.map((family) => (
        <FamilyCard
          key={family.key}
          locale={locale}
          family={family}
          lists={known}
          problems={problems}
          rowStates={rowStates}
          result={result}
          resend={resends[family.key]}
          editing={editingFamily === family.key}
          onEdit={(open) => setEditingFamily(open ? family.key : null)}
          onPatchFamily={(patch) => patchFamily(family, patch)}
          onPatchDraft={patchDraft}
          onRemove={removeDraft}
          onResend={(studentId) => void resend(family, studentId)}
        />
      ))}

      <div style={{ ...card, ...rowBetween, boxShadow: '0 8px 24px rgb(16 19 25 / 8%)' }} data-testid="import-footer">
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', maxInlineSize: '600px' }}>
          {ready.length === 0 && !imported ? (
            <strong style={{ color: 'var(--fg)' }}>{t(locale, 'people.import.footer.none')}</strong>
          ) : (
            <>
              <strong style={{ color: 'var(--fg)' }}>{fill(t(locale, 'people.import.footer.summary'), { ready: ready.length, problems: withProblems.length })}</strong>{' '}
              {t(locale, 'people.import.footer.hint')}
            </>
          )}
        </div>
        {ready.length > 0 || running ? (
          <Button onClick={() => void run()} disabled={running !== null || ready.length === 0} data-testid="import-run">
            <Glyph name="upload" size={18} />
            {runLabel}
          </Button>
        ) : imported ? (
          <a className="studio-btn" data-variant="ghost" href="#/students/import" onClick={() => { setPhase('file'); setDrafts([]); setResult(null); setRowStates({}) }} data-testid="import-again">
            {t(locale, 'people.import.done.again')}
          </a>
        ) : null}
      </div>
    </section>
  )
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div style={{ ...card, padding: '10px 12px', borderBlockStart: `3px solid ${color}` }}>
      <div style={{ fontSize: '22px', fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{n}</div>
      <div style={{ ...hint, fontSize: '11px', marginBlockStart: '2px' }}>{label}</div>
    </div>
  )
}

// ── step 1: the file ────────────────────────────────────────────────────────────────
const EXAMPLE_ROWS: readonly (readonly string[])[] = [
  ['דנה', 'כהן', '12/04/2018', 'רות', 'כהן', 'ruth@example.com', '050-1234567', 'ג׳ודו ילדים א׳', 'צהוב', 'מנוי חודשי', 'הוראת קבע'],
  ['יוסי', 'כהן', '03/01/2020', 'רות', 'כהן', 'ruth@example.com', '050-1234567', 'ג׳ודו ילדים א׳', 'לבן', 'מנוי חודשי', 'הוראת קבע'],
  ['עומר', 'לוי', '30/11/1999', '', '', 'omer@example.com', '054-7654321', 'בוגרים', 'כחול', 'מנוי חודשי', ''],
  ['מיה', 'אברהם', '', 'דנה', 'אברהם', 'dana.a@example.com', '', '', '', '', ''],
]
const EXAMPLE_VALUES: Record<ColumnKey, string> = {
  first_name: 'דנה',
  last_name: 'כהן',
  birthdate: '12/04/2018',
  parent_first: 'רות',
  parent_last: 'כהן',
  email: 'ruth@example.com',
  phone: '050-1234567',
  group: 'ג׳ודו ילדים א׳',
  belt: 'צהוב',
  plan: 'מנוי חודשי',
  payment: 'הוראת קבע',
}

function FileStep({
  locale,
  error,
  reading,
  downloading,
  fileRef,
  onDownload,
  onFile,
}: {
  locale: Locale
  error: FileError | null
  reading: boolean
  downloading: boolean
  fileRef: RefObject<HTMLInputElement | null>
  onDownload: () => void
  onFile: (file: File) => void
}) {
  const [dragging, setDragging] = useState(false)
  const steps = [1, 2, 3] as const
  const th: CSSProperties = { fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'start', padding: '8px 12px', borderBlockEnd: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const td: CSSProperties = { padding: '9px 12px', borderBlockEnd: '1px solid var(--disabled-surface)', verticalAlign: 'middle', fontSize: '13px' }
  const sheetCell: CSSProperties = { border: '1px solid var(--border)', padding: '5px 6px', whiteSpace: 'nowrap', fontSize: '12px' }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))', gap: 'var(--space-3)' }}>
        {steps.map((n) => (
          <div key={n} style={{ ...card, display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', padding: '14px 16px' }}>
            <span aria-hidden style={{ inlineSize: '28px', blockSize: '28px', borderRadius: '999px', background: 'var(--emphasis)', color: 'var(--on-emphasis)', display: 'grid', placeItems: 'center', fontSize: '13px', fontWeight: 700, flex: 'none' }}>{n}</span>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>{t(locale, `people.import.how${n}`)}</div>
              <div style={{ ...hint, color: 'var(--text-secondary)', marginBlockStart: '2px' }}>{t(locale, `people.import.how${n}Note`)}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))', gap: 'var(--space-4)' }}>
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <span style={tile}><Glyph name="sheet" size={22} /></span>
            <div>
              <h2 style={h3}>{t(locale, 'people.import.template.title')}</h2>
              <p style={hint}>{t(locale, 'people.import.template.hint')}</p>
            </div>
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            {(['lists', 'date', 'help'] as const).map((key) => (
              <li key={key} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--accent)', marginBlockStart: '2px' }}><Icon name="check" size={14} /></span>
                <span>
                  <strong style={{ color: 'var(--fg)' }}>{t(locale, `people.import.template.${key}`)}</strong> {t(locale, `people.import.template.${key}Note`)}
                </span>
              </li>
            ))}
          </ul>
          <div>
            <Button onClick={onDownload} disabled={downloading} data-testid="import-template">
              <Glyph name="download" size={18} />
              {downloading ? t(locale, 'people.import.template.downloading') : t(locale, 'people.import.template.download')}
            </Button>
          </div>
        </div>

        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <span style={tile}><Glyph name="upload" size={22} /></span>
            <div>
              <h2 style={h3}>{t(locale, 'people.import.upload.title')}</h2>
              <p style={hint}>{t(locale, 'people.import.upload.hint')}</p>
            </div>
          </div>
          <div
            data-testid="import-drop"
            onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              const file = event.dataTransfer.files?.[0]
              if (file) onFile(file)
            }}
            style={{
              border: `1.5px dashed ${dragging ? 'var(--emphasis)' : 'var(--border-strong)'}`,
              borderRadius: '11px',
              padding: '22px 16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              textAlign: 'center',
              background: dragging ? 'var(--emphasis-tint)' : 'var(--surface)',
            }}
          >
            <span style={{ color: 'var(--text-muted)' }}><Glyph name="upload" size={28} /></span>
            <span style={{ fontSize: '15px', fontWeight: 600 }}>{t(locale, 'people.import.upload.drop')}</span>
            <span style={hint}>{t(locale, 'people.import.upload.or')}</span>
            <label className="studio-btn" data-variant="ghost" style={{ cursor: 'pointer' }}>
              {reading ? t(locale, 'people.import.upload.reading') : t(locale, 'people.import.upload.pick')}
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="studio-visually-hidden"
                data-testid="import-file"
                aria-describedby={error ? 'import-file-error' : undefined}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) onFile(file)
                  event.target.value = ''
                }}
              />
            </label>
            <span style={hint}>{t(locale, 'people.import.upload.formats')}</span>
          </div>
          {error ? (
            <p id="import-file-error" role="alert" data-testid="import-parse-error" style={{ margin: 0, fontSize: '13px', color: 'var(--danger)' }}>
              {t(locale, `people.import.error.${error}`)}
            </p>
          ) : null}
        </div>
      </div>

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ ...rowBetween, padding: '14px 16px', borderBlockEnd: '1px solid var(--border)' }}>
          <h2 style={h3}>{t(locale, 'people.import.columns.title')}</h2>
          <span style={hint}>{t(locale, 'people.import.columns.summary')}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', inlineSize: '100%' }} data-testid="import-columns">
            <thead>
              <tr>
                <th scope="col" style={th}>{t(locale, 'people.import.columns.column')}</th>
                <th scope="col" style={th}>{t(locale, 'people.import.columns.required')}</th>
                <th scope="col" style={th}>{t(locale, 'people.import.columns.kind')}</th>
                <th scope="col" style={{ ...th, inlineSize: '45%' }}>{t(locale, 'people.import.columns.what')}</th>
                <th scope="col" style={th}>{t(locale, 'people.import.columns.example')}</th>
              </tr>
            </thead>
            <tbody>
              {IMPORT_COLUMNS.map((c) => (
                <tr key={c.key}>
                  <td style={{ ...td, fontWeight: 600 }}>{c.he}</td>
                  <td style={td}>{
                    mandatoryOf(c.key) === 'always'
                      ? <Chip tone="ok">{t(locale, 'people.import.columns.yes')}</Chip>
                      : mandatoryOf(c.key) === 'contact'
                        ? <Chip tone="info">{t(locale, 'people.import.columns.either')}</Chip>
                        : <span style={hint}>{t(locale, 'people.import.columns.no')}</span>
                  }</td>
                  <td style={td}>
                    {c.kind === 'list' ? (
                      <Chip tone="ok"><Icon name="chevronDown" size={12} />{t(locale, 'people.import.kind.list')}</Chip>
                    ) : (
                      <span style={hint}>{t(locale, `people.import.kind.${c.kind}`)}</span>
                    )}
                  </td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>{t(locale, `people.import.col.${c.key}`)}</td>
                  <td style={td}>{c.key === 'email' ? <bdi dir="ltr" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px' }}>{EXAMPLE_VALUES[c.key]}</bdi> : EXAMPLE_VALUES[c.key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={rowBetween}>
          <h2 style={h3}>{t(locale, 'people.import.example.title')}</h2>
          <span style={hint}>{t(locale, 'people.import.example.note')}</span>
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', inlineSize: '100%' }} data-testid="import-example">
            <caption className="studio-visually-hidden">{t(locale, 'people.import.example.title')}</caption>
            <thead>
              <tr>
                <td aria-hidden style={{ ...sheetCell, background: 'var(--surface)', inlineSize: '24px' }} />
                {IMPORT_COLUMNS.map((c) => (
                  <th key={c.key} scope="col" style={{ ...sheetCell, background: 'var(--ground)', fontWeight: 600, textAlign: 'start' }}>
                    {c.he}
                    {c.kind === 'list' ? <span aria-hidden style={{ color: 'var(--text-muted)', marginInlineStart: '3px', verticalAlign: 'middle', display: 'inline-flex' }}><Icon name="chevronDown" size={10} /></span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EXAMPLE_ROWS.map((cells, r) => (
                <tr key={r}>
                  <td style={{ ...sheetCell, background: 'var(--surface)', color: 'var(--text-muted)', textAlign: 'center', fontSize: '11px' }}>{r + 2}</td>
                  {cells.map((value, i) => (
                    <td key={i} style={{ ...sheetCell, color: value ? undefined : 'var(--border-strong)', ...(value.includes('@') ? { direction: 'ltr', textAlign: 'end', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '11px' } : {}) }}>
                      {value || '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <a href="#/students" style={{ fontSize: '13px', color: 'var(--accent)' }} data-testid="import-back">
          {t(locale, 'people.import.back')}
        </a>
      </div>
    </>
  )
}

// ── step 2: one family ──────────────────────────────────────────────────────────────
function FamilyCard({
  locale,
  family,
  lists,
  problems,
  rowStates,
  result,
  resend,
  editing,
  onEdit,
  onPatchFamily,
  onPatchDraft,
  onRemove,
  onResend,
}: {
  locale: Locale
  family: Family
  lists: Lists
  problems: Map<string, Problem[]>
  rowStates: Record<string, RowState>
  result: ImportResult | null
  resend: 'sending' | 'sent' | 'failed' | undefined
  editing: boolean
  onEdit: (open: boolean) => void
  onPatchFamily: (patch: Partial<Pick<Draft, 'parent_first' | 'parent_last' | 'email' | 'phone'>>) => void
  onPatchDraft: (id: string, patch: Partial<Draft>) => void
  onRemove: (id: string) => void
  onResend: (studentId: string) => void
}) {
  const outcome = result?.families.get(family.key)
  const anyAdded = family.members.some((member) => rowStates[member.id] === 'added')
  const surname = family.adult ? '' : (family.members[0]?.parent_last || family.members[0]?.last_name || '').trim()
  const title = family.adult
    ? `${family.members[0]?.first_name ?? ''} ${family.members[0]?.last_name ?? ''}`.trim()
    : surname
      ? fill(t(locale, 'people.import.family.named'), { name: surname })
      : t(locale, 'people.import.family.noParent')
  const subtitle = [
    family.adult ? null : family.parentName || t(locale, 'people.import.family.noParent'),
    family.email || t(locale, 'people.import.family.noEmail'),
    family.phone || null,
  ]
    .filter(Boolean)
    .join(' · ')
  const th: CSSProperties = { fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'start', padding: '8px 12px', borderBlockEnd: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const first = family.members[0]!
  // Deliberately no mail icon on `held`: the row must not read as "an email went out",
  // which is the single thing this import promises never happened.
  const invitationChip = (kind: InvitationOutcome) => {
    const tone: Tone = kind === 'not_needed' ? 'info' : 'neutral'
    return <Chip tone={tone} testId={`import-invite-${family.key}`}>{t(locale, `people.import.invite.${kind}`)}</Chip>
  }

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }} data-testid={`import-family-${family.key}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '10px 16px', borderBlockEnd: '1px solid var(--border)', background: 'var(--surface)', flexWrap: 'wrap' }}>
        <span style={{ ...tile, inlineSize: '36px', blockSize: '36px' }}><Icon name="students" size={18} /></span>
        <div style={{ flex: 1, minInlineSize: '14rem' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <bdi>{title}</bdi>
            {family.adult ? <Chip tone="neutral">{t(locale, 'people.import.family.adult')}</Chip> : null}
          </div>
          {editing ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))', gap: '8px', marginBlockStart: '8px' }} data-testid="import-family-edit">
              {/* Offered for an "adult" too: a blank parent is how the file says adult, and
                  filling these in is how a child who arrived without one gets theirs. */}
              <input className="studio-field__input" style={cellInput} aria-label={t(locale, 'people.import.family.parentFirst')} placeholder={t(locale, 'people.import.family.parentFirst')} value={first.parent_first} onChange={(e) => onPatchFamily({ parent_first: e.target.value })} data-testid="import-edit-parent-first" />
              <input className="studio-field__input" style={cellInput} aria-label={t(locale, 'people.import.family.parentLast')} placeholder={t(locale, 'people.import.family.parentLast')} value={first.parent_last} onChange={(e) => onPatchFamily({ parent_last: e.target.value })} />
              <input className="studio-field__input" style={{ ...cellInput, direction: 'ltr' }} type="email" aria-label={t(locale, 'people.import.family.email')} value={first.email} onChange={(e) => onPatchFamily({ email: e.target.value })} data-testid="import-edit-email" />
              <input className="studio-field__input" style={{ ...cellInput, direction: 'ltr' }} type="tel" aria-label={t(locale, 'people.import.family.phone')} value={first.phone} onChange={(e) => onPatchFamily({ phone: e.target.value })} />
            </div>
          ) : (
            <div style={hint}><bdi>{subtitle}</bdi></div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          {outcome ? (
            <>
              {invitationChip(outcome.invitation)}
              {/* Only when there is an address to send to. `reinvite_guardian` refuses a
                  guardian with no email, so offering the button to a family the file
                  reached by phone alone is a click that can only 422 — the same dead end
                  the students screen's invite filter exists to avoid. */}
              {outcome.invitation === 'held' && outcome.studentId && family.email ? (
                <Button variant="ghost" onClick={() => onResend(outcome.studentId!)} disabled={resend === 'sending' || resend === 'sent'} data-testid={`import-resend-${family.key}`} style={{ minBlockSize: '32px', padding: '6px 12px', fontSize: '13px' }}>
                  {resend === 'sent' ? t(locale, 'people.import.invite.sentNow') : resend === 'failed' ? t(locale, 'people.import.invite.sendFailed') : t(locale, 'people.import.invite.sendNow')}
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <Chip tone="neutral">{family.members.length === 1 ? t(locale, 'people.import.family.one') : fill(t(locale, 'people.import.family.many'), { n: family.members.length })}</Chip>
              {family.email ? <Chip tone="neutral">{t(locale, 'people.import.family.invitation')}</Chip> : null}
            </>
          )}
          {anyAdded ? null : (
            <button type="button" style={iconButton} aria-label={editing ? t(locale, 'people.import.family.editDone') : t(locale, 'people.import.family.edit')} aria-pressed={editing} onClick={() => onEdit(!editing)} data-testid={`import-edit-family-${family.key}`}>
              <Icon name={editing ? 'check' : 'edit'} size={16} />
            </button>
          )}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', inlineSize: '100%' }}>
          <thead>
            <tr>
              <th scope="col" style={{ ...th, inlineSize: '20%' }}>{t(locale, 'people.import.th.trainee')}</th>
              <th scope="col" style={{ ...th, inlineSize: '11%' }}>{t(locale, 'people.import.th.birthdate')}</th>
              <th scope="col" style={{ ...th, inlineSize: '14%' }}>{t(locale, 'people.import.th.group')}</th>
              <th scope="col" style={{ ...th, inlineSize: '9%' }}>{t(locale, 'people.import.th.belt')}</th>
              <th scope="col" style={{ ...th, inlineSize: '12%' }}>{t(locale, 'people.import.th.plan')}</th>
              <th scope="col" style={{ ...th, inlineSize: '12%' }}>{t(locale, 'people.import.th.payment')}</th>
              <th scope="col" style={th}>{t(locale, 'people.import.th.state')}</th>
              <th scope="col" style={{ ...th, inlineSize: '40px' }}><span className="studio-visually-hidden">{t(locale, 'people.import.row.delete')}</span></th>
            </tr>
          </thead>
          <tbody>
            {family.members.map((draft) => (
              <DraftRow
                key={draft.id}
                locale={locale}
                draft={draft}
                lists={lists}
                problems={problems.get(draft.id) ?? []}
                state={rowStates[draft.id]}
                outcome={result?.rows.get(draft.id)}
                onPatch={(patch) => onPatchDraft(draft.id, patch)}
                onRemove={() => onRemove(draft.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DraftRow({
  locale,
  draft,
  lists,
  problems,
  state,
  outcome,
  onPatch,
  onRemove,
}: {
  locale: Locale
  draft: Draft
  lists: Lists
  problems: Problem[]
  state: RowState | undefined
  outcome: RowOutcome | undefined
  onPatch: (patch: Partial<Draft>) => void
  onRemove: () => void
}) {
  const td: CSSProperties = { padding: '6px 12px', borderBlockEnd: '1px solid var(--disabled-surface)', verticalAlign: 'middle', fontSize: '13px' }
  const settled = state === 'added'
  const stateId = `import-state-${draft.id}`
  const belts = beltsForGroup(lists, draft.group_id)
  const problemTone = (problem: Problem): Tone => (problem === 'duplicate' ? 'info' : problem === 'unknown_group' || problem === 'unknown_belt' || problem === 'unknown_plan' || problem === 'bad_payment' || problem === 'belt_without_group' ? 'warn' : 'danger')
  const flagged = (key: 'group' | 'belt' | 'plan' | 'payment' | 'birthdate'): CSSProperties => {
    const hit =
      (key === 'group' && problems.includes('unknown_group')) ||
      (key === 'belt' && (problems.includes('unknown_belt') || problems.includes('belt_without_group'))) ||
      (key === 'plan' && problems.includes('unknown_plan')) ||
      (key === 'payment' && (problems.includes('bad_payment') || problems.includes('card_payment'))) ||
      (key === 'birthdate' && problems.includes('bad_birthdate'))
    return hit ? { borderColor: 'var(--pending)', background: 'var(--pending-tint)' } : {}
  }
  const display = (value: string) => value || <span style={{ color: 'var(--border-strong)' }}>{t(locale, 'people.import.ph.none')}</span>
  const groupName = lists.groups.find((group) => group.id === draft.group_id)?.name ?? ''
  const beltName = belts.find((belt) => belt.id === draft.belt_rank_id)?.name ?? ''
  const planName = lists.plans.find((plan) => plan.id === draft.plan_id)?.name ?? ''
  const paymentName = draft.payment ? t(locale, `people.import.payment.${draft.payment}`) : ''

  let stateCell: ReactNode
  if (state === 'sending') stateCell = <Chip tone="neutral">{t(locale, 'people.import.state.sending')}</Chip>
  else if (settled && outcome) {
    stateCell =
      outcome.problem === 'convert' ? (
        <Chip tone="warn" icon="warning" wrap>{t(locale, 'people.import.state.convertFailed')}</Chip>
      ) : outcome.problem === 'belt' ? (
        <Chip tone="warn" icon="warning" wrap>{t(locale, 'people.import.state.beltFailed')}</Chip>
      ) : (
        <Chip tone="ok" icon="check">{t(locale, 'people.import.state.added')}</Chip>
      )
  } else if (problems.length > 0) {
    stateCell = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
        {problems.map((problem) => (
          <span key={problem} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip tone={problemTone(problem)} icon={problem === 'duplicate' ? undefined : 'warning'} wrap>{t(locale, `people.import.problem.${problem}`)}</Chip>
            {problem === 'duplicate' ? (
              <button type="button" onClick={() => onPatch({ force: true })} data-testid={`import-force-${draft.id}`} style={{ font: 'inherit', fontSize: '12px', color: 'var(--accent)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                {t(locale, 'people.import.row.force')}
              </button>
            ) : null}
          </span>
        ))}
      </div>
    )
  } else if (state === 'failed' || outcome?.problem === 'create') {
    stateCell = <Chip tone="danger" icon="warning" wrap>{t(locale, 'people.import.state.createFailed')}</Chip>
  } else {
    stateCell = <Chip tone="ok" icon="check">{t(locale, 'people.import.state.ready')}</Chip>
  }

  if (settled) {
    return (
      <tr data-testid={`import-row-${draft.id}`} data-line={draft.line}>
        <td style={{ ...td, fontWeight: 600 }}><bdi>{`${draft.first_name} ${draft.last_name}`.trim()}</bdi></td>
        <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{display(showDate(draft.birthdate))}</td>
        <td style={td}>{display(groupName)}</td>
        <td style={td}>{display(beltName)}</td>
        <td style={td}>{display(planName)}</td>
        <td style={td}>{display(paymentName)}</td>
        <td style={td} id={stateId} data-testid={stateId}>{stateCell}</td>
        <td style={td} />
      </tr>
    )
  }

  const lineLabel = fill(t(locale, 'people.import.th.line'), { n: draft.line })
  return (
    <tr data-testid={`import-row-${draft.id}`} data-line={draft.line}>
      <td style={td}>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input className="studio-field__input" style={cellInput} aria-label={`${t(locale, 'people.import.th.firstName')} · ${lineLabel}`} aria-describedby={stateId} value={draft.first_name} onChange={(e) => onPatch({ first_name: e.target.value })} data-testid={`import-first-${draft.id}`} />
          <input className="studio-field__input" style={cellInput} aria-label={`${t(locale, 'people.import.th.lastName')} · ${lineLabel}`} value={draft.last_name} onChange={(e) => onPatch({ last_name: e.target.value })} />
        </div>
      </td>
      <td style={td}>
        <input
          className="studio-field__input"
          type="date"
          style={{ ...cellInput, ...flagged('birthdate') }}
          aria-label={`${t(locale, 'people.import.th.birthdate')} · ${lineLabel}`}
          value={/^\d{4}-\d{2}-\d{2}$/.test(draft.birthdate) ? draft.birthdate : ''}
          onChange={(e) => onPatch({ birthdate: e.target.value })}
          data-testid={`import-birthdate-${draft.id}`}
        />
      </td>
      <td style={td}>
        <select className="studio-field__input studio-field__input--select" style={{ ...cellInput, ...flagged('group') }} aria-label={`${t(locale, 'people.import.th.group')} · ${lineLabel}`} value={unmatchedValue(draft.group_id, draft.group_name)} onChange={(e) => onPatch(regroup(draft, lists, chosen(e.target.value)))} data-testid={`import-group-${draft.id}`}>
          {draft.group_name && !draft.group_id ? (
            <option value={UNMATCHED}>{fill(t(locale, 'people.import.ph.wasWritten'), { text: draft.group_name })}</option>
          ) : null}
          <option value="">{t(locale, 'people.import.ph.noGroup')}</option>
          {lists.groups.map((group) => (
            <option key={group.id} value={group.id}>{group.name}</option>
          ))}
        </select>
      </td>
      <td style={td}>
        <select className="studio-field__input studio-field__input--select" style={{ ...cellInput, ...flagged('belt') }} aria-label={`${t(locale, 'people.import.th.belt')} · ${lineLabel}`} value={unmatchedValue(draft.belt_rank_id, draft.belt_name)} onChange={(e) => onPatch({ belt_rank_id: chosen(e.target.value), belt_name: '' })} disabled={belts.length === 0} data-testid={`import-belt-${draft.id}`}>
          {draft.belt_name && !draft.belt_rank_id ? (
            <option value={UNMATCHED}>{fill(t(locale, 'people.import.ph.wasWritten'), { text: draft.belt_name })}</option>
          ) : null}
          <option value="">{t(locale, 'people.import.ph.none')}</option>
          {belts.map((belt) => (
            <option key={belt.id} value={belt.id}>{belt.name}</option>
          ))}
        </select>
      </td>
      <td style={td}>
        <select className="studio-field__input studio-field__input--select" style={{ ...cellInput, ...flagged('plan') }} aria-label={`${t(locale, 'people.import.th.plan')} · ${lineLabel}`} value={unmatchedValue(draft.plan_id, draft.plan_name)} onChange={(e) => onPatch({ plan_id: chosen(e.target.value), plan_name: '' })} data-testid={`import-plan-${draft.id}`}>
          {draft.plan_name && !draft.plan_id ? (
            <option value={UNMATCHED}>{fill(t(locale, 'people.import.ph.wasWritten'), { text: draft.plan_name })}</option>
          ) : null}
          <option value="">{t(locale, 'people.import.ph.none')}</option>
          {lists.plans.map((plan) => (
            <option key={plan.id} value={plan.id}>{plan.name}</option>
          ))}
        </select>
      </td>
      <td style={td}>
        <select className="studio-field__input studio-field__input--select" style={{ ...cellInput, ...flagged('payment') }} aria-label={`${t(locale, 'people.import.th.payment')} · ${lineLabel}`} value={unmatchedValue(draft.payment, draft.payment_text)} onChange={(e) => onPatch({ payment: chosen(e.target.value) as Payment, payment_text: '' })} data-testid={`import-payment-${draft.id}`}>
          {draft.payment_text && !draft.payment ? (
            <option value={UNMATCHED}>{fill(t(locale, 'people.import.ph.wasWritten'), { text: draft.payment_text })}</option>
          ) : null}
          <option value="">{t(locale, 'people.import.ph.choose')}</option>
          {PAYMENTS.map((payment) => (
            <option key={payment} value={payment}>{t(locale, `people.import.payment.${payment}`)}</option>
          ))}
        </select>
      </td>
      <td style={td} id={stateId} data-testid={stateId}>{stateCell}</td>
      <td style={td}>
        <button type="button" style={iconButton} aria-label={`${t(locale, 'people.import.row.delete')} · ${lineLabel}`} onClick={onRemove} disabled={state === 'sending'} data-testid={`import-delete-${draft.id}`}>
          <Icon name="trash" size={16} />
        </button>
      </td>
    </tr>
  )
}

/** ISO → the day-first shape the file used. */
function showDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : ''
}
