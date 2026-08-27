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
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, EmptyState, StudentRow, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { GroupOut, StaffPeopleClient, StudentSummary } from './peopleClient'

const searchStyle: CSSProperties = {
  // §6.2's 44px rule — a thumb, one-handed, on a mat.
  minBlockSize: '44px',
}

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
}

const tabsStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  overflowX: 'auto',
  paddingBlock: 'var(--space-2)',
}

const tabStyle: CSSProperties = {
  minBlockSize: '44px',
  paddingInline: 'var(--space-3)',
  borderRadius: 'var(--radius-pill)',
  borderStyle: 'solid',
  borderWidth: 'var(--border-width-hairline)',
  borderColor: 'var(--border)',
  background: 'var(--surface)',
  whiteSpace: 'nowrap',
}

const activeTabStyle: CSSProperties = {
  ...tabStyle,
  background: 'var(--fg)',
  color: 'var(--on-fg)',
  borderColor: 'var(--fg)',
}

const groupHeaderStyle: CSSProperties = {
  fontSize: 'var(--text-label)',
  color: 'var(--text-secondary)',
  marginBlock: 'var(--space-3) var(--space-1)',
}

/**
 * §5.4a's statuses on `StatusChip`'s six tones.
 *
 * `ChipStatus` has no `trial` member and `@studio/ui` is not this lane's to change, so the
 * tone is the nearest honest one and the **label** carries the meaning — which is SC 1.4.1's
 * rule anyway: never colour alone.
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
  if (student.attendance_percent !== null && student.attendance_percent !== undefined) {
    parts.push(`${student.attendance_percent}%`)
  }
  return parts.join(' · ')
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
      .catch(() => live && setStudents([]))
    return () => {
      live = false
    }
  }, [client, groupTab, query])

  // 9h's warning banner — `2 חניכים עם הצהרת בריאות חסרה`. STATUS ONLY, never contents:
  // `health_status` is the derived flag the summary already carries, and nothing here
  // reaches for a declaration.
  const missingHealth = useMemo(
    () => (students ?? []).filter((student) => student.health_status === 'missing').length,
    [students],
  )

  // On the all-tab the list groups by class, headers carrying counts. A child in two
  // groups appears under both — that is the truthful answer, not a bug: each class list
  // is "who trains here".
  const sections = useMemo(() => {
    if (groupTab || students === null) return null
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
  }, [groupTab, locale, students])

  const renderRow = (student: StudentSummary) => (
    <li key={student.id}>
      <StudentRow
        name={`${student.first_name} ${student.last_name}`}
        groupLabel={metaLine(locale, student, now)}
        belt={{
          colorHex: student.current_belt_color_hex ?? 'transparent',
          label: student.current_belt_name ?? '',
        }}
        // §5.4a — 'student.status is surfaced everywhere a student is rendered, never
        // inferred from the absence of an enrollment.'
        status={{
          status: chipToneFor(student.status),
          label: t(locale, `people.status.${student.status}`),
        }}
        onSelect={onOpen ? () => onOpen(student.id) : undefined}
      />
    </li>
  )

  return (
    <section aria-labelledby="students-search-title" data-testid="students-search">
      <h1 id="students-search-title">{t(locale, 'people.student.plural')}</h1>
      <TextField
        label={t(locale, 'people.student.search')}
        placeholder={t(locale, 'people.search.placeholder')}
        value={query}
        style={searchStyle}
        onChange={(event) => setQuery(event.target.value)}
      />

      {groups.length > 0 ? (
        <div style={tabsStyle} role="group" aria-label={t(locale, 'people.student.plural')}>
          <button
            type="button"
            data-testid="class-tab-all"
            aria-pressed={groupTab === ''}
            style={groupTab === '' ? activeTabStyle : tabStyle}
            onClick={() => setGroupTab('')}
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
              style={groupTab === group.id ? activeTabStyle : tabStyle}
              onClick={() => setGroupTab(group.id)}
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

      {students === null ? null : students.length === 0 ? (
        // Two different situations, two different sentences: nothing matched what you
        // typed, versus the club has no students at all.
        <EmptyState
          title={t(locale, query ? 'people.student.emptyFiltered' : 'people.student.empty')}
        />
      ) : sections ? (
        sections.map(([groupName, rows]) => (
          <section key={groupName} aria-label={groupName}>
            <h2 style={groupHeaderStyle} data-testid="class-header">
              <bdi>{groupName}</bdi> · {rows.length}
            </h2>
            <ul style={listStyle}>{rows.map(renderRow)}</ul>
          </section>
        ))
      ) : (
        <ul style={listStyle}>{students.map(renderRow)}</ul>
      )}
    </section>
  )
}
