// Dashboard artboard 4b — קבוצות ומחזורים: תפוסה, טווח חגורות ולו״ז.
//
// **Two of those three columns belong to milestones that have not run.** Belt ranges are
// M7's (`belt_rank` is a W4 contract model) and capacity is M3's (the roster). They ship as
// stated gaps rather than as empty cells or invented numbers — the discipline
// `apps/parent/src/features/home/ParentHome.tsx` set for artboard 1a: a manager who opens
// this before those milestones should read when the column arrives, not see a blank that
// looks broken.
//
// The schedule column is this lane's, and so is the fourth thing on the row: **C12's count
// of students left with no training day**, surfaced where a manager browses groups rather
// than only inside a change dialog. It comes from `putSchedule(..., apply: false)` with the
// group's CURRENT rules — a preview that changes nothing and reports the present state —
// and a test asserts every call this screen makes carries `apply: false`, because a browse
// that writes is the worst possible bug on a read-only screen.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { EmptyState, Table } from '@studio/ui'
import { formatDateInStudioZone, formatTimeInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { GroupSummary, ScheduleClient, ScheduleRule, SessionRow } from './client'

interface GroupFacts {
  rules: ScheduleRule[]
  next: SessionRow | null
  unscheduled: number
}



const laterStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
}

const warnStyle: CSSProperties = { color: 'var(--danger)' }

function ruleLabel(rule: ScheduleRule, locale: Locale): string {
  return `${t(locale, `schedule.weekday.${rule.weekday}`)} ${rule.start_time.slice(
    0,
    5,
  )}–${rule.end_time.slice(0, 5)}`
}

export function GroupsAndCycles({
  locale,
  client,
  groups,
  today,
  hrefForGroup,
}: {
  locale: Locale
  client: ScheduleClient
  groups: GroupSummary[]
  /** An ISO instant. A prop, not `new Date()` — the "next session" cell depends on it. */
  today: string
  /**
   * Where a group's own page lives, if it has one. Optional so the table renders standalone
   * in a test and in any future screen that has nowhere to send the reader — a link to
   * nothing is worse than plain text.
   */
  hrefForGroup?: (groupId: string) => string
}) {
  const [facts, setFacts] = useState<Record<string, GroupFacts>>({})
  const groupIds = useMemo(() => groups.map((group) => group.id).join(','), [groups])

  useEffect(() => {
    let live = true
    void (async () => {
      const years = await client.listTrainingYears()
      const active = years.find((candidate) => candidate.status === 'active')
      if (!active || !live) return

      const collected: Record<string, GroupFacts> = {}
      for (const group of groups) {
        const [rules, sessions] = await Promise.all([
          client.getSchedule(group.id),
          client.listSessions({
            from: active.starts_on,
            to: active.ends_on,
            groupId: group.id,
          }),
        ])
        const upcoming = sessions
          .filter((session) => session.status === 'scheduled' && session.starts_at > today)
          .sort((left, right) => left.starts_at.localeCompare(right.starts_at))
        // The group's own rules, previewed: reports the present state and writes nothing.
        const preview = await client.putSchedule(group.id, {
          rules,
          effective_from: active.starts_on,
          apply: false,
        })
        collected[group.id] = {
          rules,
          next: upcoming[0] ?? null,
          unscheduled: preview.students_left_unscheduled,
        }
      }
      if (live) setFacts(collected)
    })()
    return () => {
      live = false
    }
    // `groups` is in the list because the body iterates it and exhaustive-deps is right to
    // insist. `groupIds` is here too as the value that actually changes when the SET of
    // groups does — but neither buys anything unless the caller passes a stable array and a
    // stable `today`, which is why `ScheduleSection` memoizes the one and `useToday`
    // stabilises the other. An earlier version of this comment claimed `groupIds` alone was
    // the mitigation; it was not, and the effect re-ran on every parent render.
  }, [client, groupIds, groups, today])

  if (groups.length === 0) {
    return <EmptyState title={t(locale, 'schedule.groups.empty')} />
  }

  return (
    <section aria-labelledby="groups-title">
      <h2 id="groups-title">{t(locale, 'schedule.groups.title')}</h2>
      {/* F1b — widths, caption, scroll container and the card fallback come from the
          primitive. */}
      <Table
        caption={t(locale, 'schedule.groups.caption')}
        columns={[
          {
            id: 'group',
            header: t(locale, 'schedule.groups.title'),
            width: '12rem',
            cell: (group) => (
              <>
                {hrefForGroup ? <a href={hrefForGroup(group.id)}>{group.name}</a> : group.name}
                <div style={laterStyle}>{group.className}</div>
              </>
            ),
          },
          {
            id: 'schedule',
            header: t(locale, 'schedule.groups.weeklySchedule'),
            width: '14rem',
            cell: (group) => {
              const fact = facts[group.id]
              return (
                <span data-testid={`schedule-${group.id}`}>
                  {fact && fact.rules.length > 0
                    ? fact.rules.map((rule) => (
                        <div key={rule.id ?? ruleLabel(rule, locale)}>{ruleLabel(rule, locale)}</div>
                      ))
                    : t(locale, 'schedule.rules.empty')}
                </span>
              )
            },
          },
          {
            id: 'next',
            header: t(locale, 'schedule.groups.nextSession'),
            width: '12rem',
            cell: (group) => {
              const fact = facts[group.id]
              return (
                <span data-testid={`next-${group.id}`}>
                  {fact?.next
                    ? `${formatDateInStudioZone(fact.next.starts_at, locale)} · ${formatTimeInStudioZone(
                        fact.next.starts_at,
                        locale,
                      )}`
                    : t(locale, 'schedule.groups.noNextSession')}
                </span>
              )
            },
          },
          {
            id: 'unscheduled',
            header: t(locale, 'schedule.groups.unscheduledStudents'),
            width: '8rem',
            cell: (group) => {
              const fact = facts[group.id]
              return (
                <span
                  data-testid={`unscheduled-${group.id}`}
                  style={fact && fact.unscheduled > 0 ? warnStyle : undefined}
                >
                  {fact?.unscheduled ?? 0}
                </span>
              )
            },
          },
          {
            id: 'session',
            header: t(locale, 'schedule.session.title'),
            width: '12rem',
            cell: () => (
              <>
                {/* M7 and M3. Stated, not blank — see the module header. */}
                <div style={laterStyle}>{t(locale, 'schedule.groups.beltRangeComesLater')}</div>
                <div style={laterStyle}>{t(locale, 'schedule.groups.capacityComesLater')}</div>
              </>
            ),
          },
        ]}
        rowKey={(group) => group.id}
        rows={groups}
      />
    </section>
  )
}
