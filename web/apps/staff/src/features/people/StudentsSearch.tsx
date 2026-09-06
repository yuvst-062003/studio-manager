// Staff artboard 9h — חניכים, the search tab.
//
// §6.2: built mobile-first for one-handed use on a mat — large tap targets, high contrast,
// works in bright light, no interaction requiring precision.
//
// **No money, anywhere.** §3.2's hard rule: "coaches never see money. No charge, payment,
// debt or price is reachable from any coach-scoped endpoint or screen." The endpoint behind
// this returns `StudentSummaryOut`, which has no financial field — invariant 3 is what keeps
// it that way, and this screen adds nothing.
//
// The class tabs re-ask the SERVER (`group_id`) rather than filtering client-side: §3.2
// scopes a coach to their own groups in the query, and a tab that filtered locally would
// have to re-implement that rule to be right.
//
// **2026-09-06, C4: the prototype's design.** Ported from
// `~/Downloads/staff-app/src/components/StudentsView.tsx` — class names matched, not
// approximated — inside the `.tw-scope` wrapper `StaffShell` already provides, the same
// house style `AccountScreen.tsx` set at C1. This pass changes how the screen LOOKS and adds
// one real behaviour the prototype only mocked: the sort toggle. Everything else below is
// unchanged from the structural build.
//
// **The prototype's grouping is not ported as drawn.** Its `StudentsView` groups by the
// first letter of the child's NAME. This screen already groups the all-tab by CLASS, with a
// child in two groups appearing under both (S8, below) — a deliberate, tested product
// decision, not a placeholder. Replacing it with alphabet-by-name would be a regression
// dressed as a restyle, so the class grouping stays the default and the addition is the
// sort toggle: flipped on, the list becomes one flat ranking by attendance, exactly as the
// prototype's own "לפי נוכחות" mode does.
//
// **Belt chips carry D7's ring by hand.** `StudentRow` (`@studio/ui`) used to compose
// `BeltBar` for this, which carries the ring for free. The prototype's pill (a small dot
// beside a label) is a different shape, so the ring is drawn on the dot itself —
// `boxShadow: inset 0 0 0 1px var(--belt-ring)` — the same technique `BeltBar` uses, so a
// white belt on a light ground does not sit at 1.08:1.
//
// **The chart is not built.** §9 — the prototype's `AttendanceTrendChart` draws seven
// months of invented numbers, and nothing computes a club-wide monthly trend.
import { useEffect, useMemo, useState } from 'react'
import { ArrowUpDown, ChevronLeft } from 'lucide-react'
import { Alert, EmptyState, LoadFailed, TextField } from '@studio/ui'
import { useNetworkMode } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { GroupOut, StaffPeopleClient, StudentSummary } from './peopleClient'

/**
 * §5.4a's statuses on `StatusChip`'s six tones — kept even though this screen no longer
 * composes `StatusChip` directly, because `StaffStudentCard` and the detail sheet still
 * read it as the one place the mapping is written down.
 */
export function chipToneFor(status: string): 'paid' | 'pending' | 'cancelled' | 'planned' {
  if (status === 'active') return 'paid'
  if (status === 'left' || status === 'lost') return 'cancelled'
  if (status === 'frozen') return 'planned'
  return 'pending'
}

/** Whole months between a `YYYY-MM-DD` date and an ISO instant — 9h's `5 חודשים`. */
export function tenureMonths(joinedOn: string, now: string): number {
  const from = new Date(`${joinedOn}T12:00:00Z`)
  const to = new Date(now)
  const months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  return Math.max(0, months)
}

function metaLine(locale: Locale, student: StudentSummary, now: string | undefined): string {
  const parts: string[] = []
  if (student.group_names && student.group_names.length > 0) {
    parts.push(student.group_names.join(' · '))
  } else {
    parts.push(t(locale, 'people.student.noGroup'))
  }
  if (student.joined_on && now) {
    parts.push(
      t(locale, 'people.tenure.months').replace(
        '{{count}}',
        String(tenureMonths(student.joined_on, now)),
      ),
    )
  }
  // Rendered NEUTRALLY, deliberately: the product settled that there is no exam
  // threshold (the 2d strip states so), so there is no line to colour this against.
  // Kept in the SAME string as the group and tenure — S8's own test reads this whole
  // line as one piece of text, and splitting the percentage into its own styled span
  // would ask a leaf node for a combined string it no longer holds.
  if (student.attendance_percent !== null && student.attendance_percent !== undefined) {
    parts.push(`${student.attendance_percent}%`)
  }
  return parts.join(' · ')
}

/** Sorted by attendance, descending, a student never marked pushed to the end rather than
 *  treated as a 0% the register never gave them. */
function byAttendanceDesc(students: StudentSummary[]): StudentSummary[] {
  return [...students].sort((a, b) => {
    const left = a.attendance_percent ?? -1
    const right = b.attendance_percent ?? -1
    return right - left
  })
}

export function StudentsSearch({
  locale,
  client,
  onOpen,
  now,
  viewerIsCoach = false,
}: {
  locale: Locale
  client: StaffPeopleClient
  onOpen?: (studentId: string) => void
  /** The app clock, for tenure. Optional so the meta line degrades rather than lying. */
  now?: string
  /** Labels the all-tab `הכיתות שלי` for a coach, whose server scope IS their classes. */
  viewerIsCoach?: boolean
}) {
  const [query, setQuery] = useState('')
  const [groupTab, setGroupTab] = useState('')
  const [groups, setGroups] = useState<GroupOut[]>([])
  const [students, setStudents] = useState<StudentSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  // The addition: the prototype's "לפי נוכחות" / "סדר א-ב" flip. Off by default, which is
  // the existing class-grouped view below — nothing changes for a caller that never touches it.
  const [sortByAttendance, setSortByAttendance] = useState(false)
  // S11 — a failed read distinguishes offline from broken (S5's network state).
  const networkMode = useNetworkMode()

  useEffect(() => {
    let live = true
    client
      .groups()
      .then((body) => live && setGroups(body.items.filter((group) => group.is_active)))
      .catch(() => live && setGroups([]))
    return () => {
      live = false
    }
  }, [client])

  useEffect(() => {
    let live = true
    client
      .search(query, groupTab || undefined)
      .then((body) => live && setStudents(body.items))
      // S11 — this used to render a failed read as an EMPTY list, which on a search
      // screen claims "no such child". A refusal to answer is not an answer of none.
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [client, groupTab, query, attempt])

  // 9h's warning banner — `2 חניכים עם הצהרת בריאות חסרה`. STATUS ONLY, never contents:
  // `health_status` is the derived flag the summary already carries, and nothing here
  // reaches for a declaration.
  const missingHealth = useMemo(
    () => (students ?? []).filter((student) => student.health_status === 'missing').length,
    [students],
  )

  // On the all-tab the list groups by class, headers carrying counts. A child in two
  // groups appears under both — that is the truthful answer, not a bug: each class list
  // is "who trains here". Suppressed the moment the sort is flipped: a ranking by
  // attendance is one flat list, the way the prototype's own "לפי נוכחות" mode draws it.
  const sections = useMemo(() => {
    if (sortByAttendance || groupTab || students === null) return null
    const byGroup = new Map<string, StudentSummary[]>()
    for (const student of students) {
      const names =
        student.group_names && student.group_names.length > 0
          ? student.group_names
          : [t(locale, 'people.student.noGroup')]
      for (const name of names) {
        const bucket = byGroup.get(name) ?? []
        bucket.push(student)
        byGroup.set(name, bucket)
      }
    }
    return [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [groupTab, locale, sortByAttendance, students])

  const flatList = useMemo(() => {
    if (students === null) return []
    return sortByAttendance ? byAttendanceDesc(students) : students
  }, [sortByAttendance, students])

  const renderRow = (student: StudentSummary) => (
    <li key={student.id}>
      <StudentCard locale={locale} now={now} onOpen={onOpen} student={student} />
    </li>
  )

  return (
    <section aria-labelledby="students-search-title" data-testid="students-search" className="flex flex-col gap-4 px-4 pt-4 pb-8">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <h1 id="students-search-title" className="text-2xl font-black text-slate-900 tracking-tight m-0 truncate">
            {t(locale, 'people.list.title')}
          </h1>
          {students !== null ? (
            <span className="shrink-0 bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-full">
              {t(locale, 'people.list.registeredCount').replace('{{count}}', String(students.length))}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          data-testid="sort-toggle"
          aria-pressed={sortByAttendance}
          onClick={() => setSortByAttendance((value) => !value)}
          className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors py-1.5 px-2.5 rounded-lg hover:bg-slate-100 active:scale-95"
        >
          <span>{t(locale, sortByAttendance ? 'people.list.sortAttendance' : 'people.list.sortAlpha')}</span>
          <ArrowUpDown aria-hidden="true" className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </header>

      {/* The prototype overlays a search icon inside the field. `TextField` (`@studio/ui`,
          off-limits to this lane) always renders a visible label above the input, so an
          icon centred on the whole field would float over the label rather than the input
          — dropped rather than guessed at with a magic offset that drifts the moment the
          label wraps or a locale's label is two lines. */}
      <TextField
        label={t(locale, 'people.student.search')}
        placeholder={t(locale, 'people.search.placeholder')}
        value={query}
        style={{ minBlockSize: '44px' }}
        onChange={(event) => setQuery(event.target.value)}
      />

      {groups.length > 0 ? (
        <div
          className="flex items-center gap-2 overflow-x-auto pb-1"
          role="group"
          aria-label={t(locale, 'people.student.plural')}
        >
          <button
            type="button"
            data-testid="class-tab-all"
            aria-pressed={groupTab === ''}
            onClick={() => setGroupTab('')}
            className={`shrink-0 min-h-11 px-4 py-1.5 rounded-full text-xs font-bold transition-transform active:scale-95 ${
              groupTab === ''
                ? 'bg-black text-white shadow-sm'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t(locale, viewerIsCoach ? 'people.tabs.myClasses' : 'people.tabs.allClasses').replace(
              '{{count}}',
              String(groups.length),
            )}
          </button>
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              data-testid={`class-tab-${group.id}`}
              aria-pressed={groupTab === group.id}
              onClick={() => setGroupTab(group.id)}
              className={`shrink-0 min-h-11 px-4 py-1.5 rounded-full text-xs font-bold transition-transform active:scale-95 ${
                groupTab === group.id
                  ? 'bg-black text-white shadow-sm'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {group.name}
            </button>
          ))}
        </div>
      ) : null}

      {missingHealth > 0 ? (
        <Alert iconLabel={t(locale, 'people.health.missingCount')} tone="pending">
          <span data-testid="health-missing-banner">
            {t(locale, 'people.health.missingCount').replace('{{count}}', String(missingHealth))}
          </span>
        </Alert>
      ) : null}

      {failed ? (
        <LoadFailed
          locale={locale}
          offline={networkMode !== 'online'}
          onRetry={() => {
            setFailed(false)
            setAttempt((n) => n + 1)
          }}
        />
      ) : students === null ? null : students.length === 0 ? (
        // Two different situations, two different sentences: nothing matched what you
        // typed, versus the club has no students at all.
        <EmptyState
          title={t(locale, query ? 'people.student.emptyFiltered' : 'people.student.empty')}
        />
      ) : sortByAttendance ? (
        <section aria-label={t(locale, 'people.list.sortAttendance')} className="flex flex-col gap-2.5">
          <h2 className="text-xs font-black text-slate-900 tracking-wider px-1 m-0">
            {t(locale, 'people.list.sortAttendance')}
          </h2>
          <ul className="list-none m-0 p-0 flex flex-col gap-2.5">{flatList.map(renderRow)}</ul>
        </section>
      ) : sections ? (
        sections.map(([groupName, rows]) => (
          <section key={groupName} aria-label={groupName} className="flex flex-col gap-2.5">
            <h2 className="text-xs font-black text-slate-900 tracking-wider px-1 m-0" data-testid="class-header">
              <bdi>{groupName}</bdi> · {rows.length}
            </h2>
            <ul className="list-none m-0 p-0 flex flex-col gap-2.5">{rows.map(renderRow)}</ul>
          </section>
        ))
      ) : (
        <ul className="list-none m-0 p-0 flex flex-col gap-2.5">{flatList.map(renderRow)}</ul>
      )}
    </section>
  )
}

/**
 * The prototype's row, restyled. A `<button>`, not a `<div onClick>` — the a11y rules this
 * app follows require an accessible name and a real interactive element on every control,
 * and a row that opens a card is a control.
 */
function StudentCard({
  student,
  locale,
  now,
  onOpen,
}: {
  student: StudentSummary
  locale: Locale
  now: string | undefined
  onOpen?: (studentId: string) => void
}) {
  const name = `${student.first_name} ${student.last_name}`
  return (
    <button
      type="button"
      onClick={onOpen ? () => onOpen(student.id) : undefined}
      disabled={!onOpen}
      className="w-full bg-white rounded-2xl p-4 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.06)] border border-slate-100 flex items-center justify-between gap-3 hover:border-slate-300 transition-all active:scale-[0.99] text-start disabled:active:scale-100"
    >
      <ChevronLeft aria-hidden="true" className="w-5 h-5 stroke-[2.5] text-slate-300 shrink-0" />

      <span className="flex flex-col items-end gap-1.5 min-w-0">
        <span className="flex items-center gap-2 min-w-0">
          {student.current_belt_color_hex ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border border-slate-200 bg-slate-50 shrink-0">
              <span
                aria-hidden="true"
                className="w-2 h-2 rounded-full"
                style={{
                  background: student.current_belt_color_hex,
                  boxShadow: 'inset 0 0 0 1px var(--belt-ring)',
                }}
              />
              <span>{student.current_belt_name}</span>
            </span>
          ) : null}
          <span className="text-base font-extrabold text-slate-900 truncate">
            <bdi>{name}</bdi>
          </span>
        </span>

        <span
          className={`flex items-center gap-2 text-xs min-w-0 ${
            (student.attendance_percent ?? 0) >= 80 ? 'text-emerald-700' : 'text-slate-500'
          }`}
        >
          {student.status !== 'active' ? (
            <>
              <span>{t(locale, `people.status.${student.status}`)}</span>
              <span aria-hidden="true" className="text-slate-300">•</span>
            </>
          ) : null}
          {/* One leaf node, deliberately — see `metaLine`'s own comment. */}
          <span className="truncate font-bold">{metaLine(locale, student, now)}</span>
        </span>
      </span>
    </button>
  )
}
