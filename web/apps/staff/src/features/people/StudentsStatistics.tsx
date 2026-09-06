// Staff 9h's statistics section — the owner's review reversed §9's "not built" call on
// the prototype's `~/Downloads/staff-app/src/components/AttendanceTrendChart.tsx`. That
// verdict was right about the PROTOTYPE'S data (seven months of invented numbers, drawn
// because nothing computes a club-wide monthly trend) and wrong as a decision: the section
// itself is wanted, built from figures that are actually true. See `StudentsSearch.tsx`'s
// own note on the same subject.
//
// **What is real and what is not.** The roster already fetches, per student,
// `attendance_percent` (present over MARKED sessions, `StudentSummaryOut`'s own words),
// `group_names` and `health_status` — a CURRENT snapshot. A month-by-month history is not
// available to a coach: `GET /attendance/report` is `ManagerOrOwner`-only, and a per-student
// history would be one request per child. So this draws no trend line and asks for no extra
// fetch — every number below is computed from the exact `students` array `StudentsSearch`
// already holds, whatever the current search/tab scope narrowed it to.
//
// **The chips are not a mirrored copy.** `selectedGroupId`/`onSelectGroup` are
// `StudentsSearch`'s own `groupTab`/`setGroupTab`, passed straight through — the same piece
// of state, not a `useEffect` kept in sync with it the way the prototype's own
// `selectedGroupFilter` prop was. Picking a chip here re-queries the roster exactly as
// picking the class tab above it does, so the two rows of chips cannot drift apart.
//
// **The chart's text equivalent.** Every bar's percentage is real, visible text next to it
// (`stats-bar-value-*`), not a number a hover or a tooltip alone reveals — a screen reader
// reads exactly what a sighted coach sees, in document order. The coloured fill is
// `aria-hidden`, because it repeats that same number and nothing more. The comparison is
// never colour-only either (SC 1.4.1): the selected bar also carries a bolder label, a
// bold-black value, and the same chip row already marks the active choice with text and a
// filled background, not a tint alone.
import { useState } from 'react'
import { BarChart3, ChevronDown, ChevronUp, TriangleAlert } from 'lucide-react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { GroupOut, StudentSummary } from './peopleClient'

/** The one cutoff already drawn on this screen: `StudentCard` below colours a row's
 *  attendance line emerald from 80% up. Reused rather than invented, so "needs attention"
 *  means the same thing here as the colour already means on every row. */
export const ATTENTION_THRESHOLD = 80

const STATS_COLLAPSED_KEY = 'studio.staff.students-stats-collapsed'

function readCollapsed(): boolean {
  try {
    return globalThis.localStorage?.getItem(STATS_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function persistCollapsed(value: boolean): void {
  try {
    if (value) globalThis.localStorage?.setItem(STATS_COLLAPSED_KEY, '1')
    else globalThis.localStorage?.removeItem(STATS_COLLAPSED_KEY)
  } catch {
    // Private browsing: the card simply re-expands next load, which beats crashing it.
  }
}

export type AttendanceAverage = { average: number | null; markedCount: number }

/** Present / (present + absent) over MARKED rows only — a student nobody has taken
 *  attendance for yet says nothing, so `null` rather than a false zero. */
export function averageAttendance(students: StudentSummary[]): AttendanceAverage {
  const marked = students.filter(
    (student): student is StudentSummary & { attendance_percent: number } =>
      student.attendance_percent !== null && student.attendance_percent !== undefined,
  )
  if (marked.length === 0) return { average: null, markedCount: 0 }
  const sum = marked.reduce((total, student) => total + student.attendance_percent, 0)
  return { average: Math.round(sum / marked.length), markedCount: marked.length }
}

export type GroupAttendanceBar = {
  key: string
  /** `null` marks the leading "כל המועדון" bar — the current-scope average, not a group. */
  groupId: string | null
  label: string | null
  value: number
  markedCount: number
}

/** One bar per ACTIVE group with at least one marked student, in the same order as the
 *  class tabs above, plus a leading whole-club bar. Matched by NAME against
 *  `StudentSummaryOut.group_names` — the same key `StudentsSearch`'s own all-tab grouping
 *  (S8) already uses, because the summary shape carries names and never group ids. A group
 *  with nobody marked yet draws no bar: an average over zero marked students is not a zero,
 *  it is nothing to report. */
export function attendanceBars(
  students: StudentSummary[],
  groups: Pick<GroupOut, 'id' | 'name'>[],
): GroupAttendanceBar[] {
  const bars: GroupAttendanceBar[] = []
  const club = averageAttendance(students)
  if (club.average !== null) {
    bars.push({ key: 'all', groupId: null, label: null, value: club.average, markedCount: club.markedCount })
  }

  const byName = new Map<string, StudentSummary[]>()
  for (const student of students) {
    for (const name of student.group_names ?? []) {
      const bucket = byName.get(name) ?? []
      bucket.push(student)
      byName.set(name, bucket)
    }
  }
  for (const group of groups) {
    const { average, markedCount } = averageAttendance(byName.get(group.name) ?? [])
    if (average === null) continue
    bars.push({ key: group.id, groupId: group.id, label: group.name, value: average, markedCount })
  }
  return bars
}

export type AttentionCounts = { belowThreshold: number; missingHealth: number; total: number }

/** Two different reasons a coach should look twice, counted separately and once
 *  together. A student who is both below the threshold AND missing a declaration is one
 *  student needing attention, not two — `total` is the union, never a sum that double-counts. */
export function studentsNeedingAttention(
  students: StudentSummary[],
  threshold: number,
): AttentionCounts {
  const below = new Set<string>()
  const missing = new Set<string>()
  for (const student of students) {
    if (
      student.attendance_percent !== null &&
      student.attendance_percent !== undefined &&
      student.attendance_percent < threshold
    ) {
      below.add(student.id)
    }
    if (student.health_status === 'missing') missing.add(student.id)
  }
  return {
    belowThreshold: below.size,
    missingHealth: missing.size,
    total: new Set([...below, ...missing]).size,
  }
}

function chipClass(active: boolean): string {
  return `shrink-0 min-h-11 px-3 py-1.5 rounded-full text-[11px] font-bold transition-transform active:scale-95 ${
    active
      ? 'bg-slate-900 text-white shadow-sm'
      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
  }`
}

export function StudentsStatistics({
  locale,
  students,
  groups,
  selectedGroupId,
  onSelectGroup,
}: {
  locale: Locale
  /** The SAME rows `StudentsSearch` just fetched — whatever the current search/tab scope
   *  is. No second fetch: a monthly history would need one request per child (see the file
   *  header), and this section draws only what is already on the wire. */
  students: StudentSummary[]
  /** The SAME active-group list the class tabs render, so a bar and a chip exist for
   *  every class the coach can already see. */
  groups: GroupOut[]
  /** `groupTab` from `StudentsSearch`, passed straight through — see the file header. */
  selectedGroupId: string
  onSelectGroup: (groupId: string) => void
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const club = averageAttendance(students)
  const bars = attendanceBars(students, groups)
  const attention = studentsNeedingAttention(students, ATTENTION_THRESHOLD)

  function toggle(): void {
    setCollapsed((value) => {
      const next = !value
      persistCollapsed(next)
      return next
    })
  }

  return (
    <section
      aria-labelledby="students-stats-title"
      data-testid="students-statistics"
      className="bg-white rounded-2xl p-4 border border-slate-200 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.06)] mb-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            aria-hidden="true"
            className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0"
          >
            <BarChart3 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 id="students-stats-title" className="text-sm font-black text-slate-900 leading-tight m-0 truncate">
              {t(locale, 'people.stats.title')}
            </h2>
            <p className="text-[11px] text-slate-500 font-medium m-0 truncate">
              {t(locale, 'people.stats.subtitle')}
            </p>
          </div>
        </div>
        <button
          type="button"
          data-testid="stats-collapse-toggle"
          aria-expanded={!collapsed}
          aria-controls="students-stats-body"
          aria-label={t(locale, collapsed ? 'people.stats.expand' : 'people.stats.collapse')}
          onClick={toggle}
          className="shrink-0 text-slate-500 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
        >
          {collapsed ? (
            <ChevronDown aria-hidden="true" className="w-4 h-4" />
          ) : (
            <ChevronUp aria-hidden="true" className="w-4 h-4" />
          )}
        </button>
      </div>

      {collapsed ? null : (
        <div id="students-stats-body" className="mt-3">
          {/* KPI strip — the prototype's shape (a value cell and a badge cell) kept, its
              CONTENT replaced: there is no delta cell, because a delta needs a prior
              month and none exists here. */}
          <div className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl p-2.5 mb-2 border border-slate-100">
            <div className="min-w-0">
              <span className="text-[11px] text-slate-500 block font-medium">
                {t(locale, 'people.stats.clubAverage')}
              </span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-xl font-black font-mono text-slate-900" data-testid="stats-club-average">
                  {club.average === null ? '—' : `${club.average}%`}
                </span>
                <span className="text-[11px] font-bold text-slate-500 font-mono">
                  {t(locale, 'people.stats.clubAverageOf').replace('{{count}}', String(club.markedCount))}
                </span>
              </div>
            </div>
            <div className="text-end border-s border-slate-200 ps-3 shrink-0">
              <span className="text-[11px] text-slate-500 block font-medium">
                {t(locale, 'people.stats.needAttention')}
              </span>
              <span
                className="text-base font-black font-mono text-rose-800 flex items-center gap-1 mt-0.5"
                data-testid="stats-need-attention-count"
              >
                <TriangleAlert aria-hidden="true" className="w-3.5 h-3.5 text-amber-500" />
                {attention.total}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 font-medium mb-3" data-testid="stats-need-attention-breakdown">
            {t(locale, 'people.stats.needAttentionBreakdown')
              .replace('{{below}}', String(attention.belowThreshold))
              .replace('{{threshold}}', String(ATTENTION_THRESHOLD))
              .replace('{{missing}}', String(attention.missingHealth))}
          </p>

          <div
            role="group"
            aria-label={t(locale, 'people.stats.chipsLabel')}
            className="flex items-center gap-1.5 mb-2.5 overflow-x-auto no-scrollbar pb-1"
          >
            <button
              type="button"
              data-testid="stats-chip-all"
              aria-pressed={selectedGroupId === ''}
              onClick={() => onSelectGroup('')}
              className={chipClass(selectedGroupId === '')}
            >
              {t(locale, 'people.stats.allGroups')}
            </button>
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                data-testid={`stats-chip-${group.id}`}
                aria-pressed={selectedGroupId === group.id}
                onClick={() => onSelectGroup(group.id)}
                className={chipClass(selectedGroupId === group.id)}
              >
                {group.name}
              </button>
            ))}
          </div>

          {bars.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4" data-testid="stats-no-data">
              {t(locale, 'people.stats.noData')}
            </p>
          ) : (
            <ul
              className="list-none m-0 p-0 flex flex-col gap-2"
              aria-label={t(locale, 'people.stats.chartLabel')}
              data-testid="stats-bar-chart"
            >
              {bars.map((bar) => {
                const isSelected =
                  selectedGroupId === '' ? bar.groupId === null : bar.groupId === selectedGroupId
                const label = bar.groupId === null ? t(locale, 'people.stats.allGroups') : bar.label
                return (
                  <li key={bar.key} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-[11px] font-bold text-slate-600 truncate">
                      <bdi>{label}</bdi>
                    </span>
                    <span className="relative flex-1 h-5 rounded-md bg-slate-100 overflow-hidden">
                      {/* Decorative: the visible, readable value is the text cell below,
                          not this fill — see the file header's note on the text equivalent. */}
                      <span
                        aria-hidden="true"
                        className={`absolute inset-y-0 start-0 rounded-md ${
                          isSelected ? 'bg-blue-700' : 'bg-blue-500'
                        }`}
                        style={{ width: `${Math.max(bar.value, 3)}%` }}
                      />
                    </span>
                    <span
                      className={`w-12 shrink-0 text-end text-xs font-mono ${
                        isSelected ? 'font-black text-blue-700' : 'font-bold text-slate-600'
                      }`}
                      data-testid={`stats-bar-value-${bar.key}`}
                    >
                      {bar.value}%
                    </span>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500" data-testid="stats-footer">
            {t(locale, 'people.stats.footer')}
          </div>
        </div>
      )}
    </section>
  )
}
