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
import { Button, EmptyState, Table, TextField } from '@studio/ui'
import { apiFetch, formatDateInStudioZone, formatTimeInStudioZone } from '@studio/core'
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
  onChanged,
}: {
  locale: Locale
  client: ScheduleClient
  groups: GroupSummary[]
  /** F4 — the write half. Called after a create / rename / retire so the owner of the
   *  groups list re-fetches it. Absent in a purely read-only mount. */
  onChanged?: () => void
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
  // F4 — the write half's own state.
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newClassId, setNewClassId] = useState('')
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([])
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')
  const [writeFailed, setWriteFailed] = useState(false)
  // F8 — 4b's belt range, measured from enrolled students' current belts.
  const [beltRanges, setBeltRanges] = useState<
    Record<string, { min_name: string; max_name: string }>
  >({})

  useEffect(() => {
    let alive = true
    void apiFetch('/api/v1/belt-ranges/by-group')
      .then(async (r) =>
        r.ok
          ? ((await r.json()) as { items: { group_id: string; min_name: string; max_name: string }[] })
              .items
          : [],
      )
      .then((rows) => {
        if (alive) setBeltRanges(Object.fromEntries(rows.map((row) => [row.group_id, row])))
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!onChanged) return
    let alive = true
    void apiFetch('/api/v1/classes')
      .then(async (r) => (r.ok ? ((await r.json()) as { items: { id: string; name: string }[] }).items : []))
      .then((rows) => alive && setClasses(rows))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [onChanged])

  const patchGroup = (groupId: string, body: Record<string, unknown>) => {
    setWriteFailed(false)
    void apiFetch(`/api/v1/groups/${groupId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((response) => {
      if (!response.ok) {
        setWriteFailed(true)
        return
      }
      setRenaming(null)
      onChanged?.()
    })
  }
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

  const createForm = onChanged ? (
    creating ? (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'end' }}>
        <TextField
          label={t(locale, 'schedule.groups.form.name')}
          onChange={(event) => setNewName(event.target.value)}
          value={newName}
        />
        <label>
          {t(locale, 'schedule.groups.form.class')}
          <select
            data-testid="new-group-class"
            onChange={(event) => setNewClassId(event.target.value)}
            value={newClassId}
          >
            <option value="">—</option>
            {classes.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {klass.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          data-testid="new-group-submit"
          disabled={!newName.trim() || !newClassId}
          onClick={() => {
            setWriteFailed(false)
            void apiFetch('/api/v1/groups', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ class_id: newClassId, name: newName.trim() }),
            }).then(async (response) => {
              if (!response.ok) {
                setWriteFailed(true)
                return
              }
              setCreating(false)
              setNewName('')
              onChanged()
              // Fix 3 (2026-08-28): land the manager INSIDE the new group's schedule
              // page, where the weekly days-and-hours editor lives. The form used to
              // just close, and the only way in was clicking the group's name in the
              // table — an affordance nobody has a reason to try, so "create a group"
              // read as "you cannot set its schedule".
              const created = (await response.json()) as { id: string }
              if (hrefForGroup) globalThis.location.hash = hrefForGroup(created.id)
            })
          }}
        >
          {t(locale, 'schedule.groups.form.submit')}
        </Button>
      </div>
    ) : (
      <Button data-testid="new-group-open" onClick={() => setCreating(true)} variant="secondary">
        {t(locale, 'schedule.groups.create')}
      </Button>
    )
  ) : null

  if (groups.length === 0) {
    return (
      <section aria-labelledby="groups-title">
        <h2 id="groups-title">{t(locale, 'schedule.groups.title')}</h2>
        {createForm}
        <EmptyState title={t(locale, 'schedule.groups.empty')} />
      </section>
    )
  }

  return (
    <section aria-labelledby="groups-title">
      <h2 id="groups-title">{t(locale, 'schedule.groups.title')}</h2>
      {createForm}
      {writeFailed ? (
        <p data-testid="groups-write-failed">{t(locale, 'common.loadFailed.body')}</p>
      ) : null}
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
                {hrefForGroup ? (
                  <>
                    <a href={hrefForGroup(group.id)}>{group.name}</a>{' '}
                    {/* The name-link exists but does not LOOK like the door to the
                        schedule editor; this says it in words. */}
                    <a
                      className="studio-btn"
                      data-variant="ghost"
                      data-testid={`group-schedule-link-${group.id}`}
                      href={hrefForGroup(group.id)}
                    >
                      {t(locale, 'schedule.groups.openSchedule')}
                    </a>
                  </>
                ) : (
                  group.name
                )}
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
            cell: (group) => {
              // F8 — the belt range is measured now. Capacity is DELIBERATELY absent:
              // the 2026-08-27 decision cut group capacity from the product entirely
              // (a group has no cap; 7d's 42/54 is an EVENT cap), so the promise is
              // deleted rather than kept.
              const range = beltRanges[group.id]
              return range ? (
                <span data-testid={`belt-range-${group.id}`}>
                  {range.min_name === range.max_name
                    ? range.min_name
                    : `${range.min_name} – ${range.max_name}`}
                </span>
              ) : (
                <span style={laterStyle}>—</span>
              )
            },
          },
          ...(onChanged
            ? [
                {
                  id: 'actions',
                  header: t(locale, 'schedule.groups.create'),
                  width: '14rem',
                  cell: (group: GroupSummary) =>
                    renaming === group.id ? (
                      <span style={{ display: 'flex', gap: 'var(--space-1)', alignItems: 'end' }}>
                        <TextField
                          label={t(locale, 'schedule.groups.form.name')}
                          onChange={(event) => setRenameTo(event.target.value)}
                          value={renameTo}
                        />
                        <Button
                          data-testid={`rename-save-${group.id}`}
                          disabled={!renameTo.trim()}
                          onClick={() => patchGroup(group.id, { name: renameTo.trim() })}
                        >
                          {t(locale, 'schedule.groups.renameSave')}
                        </Button>
                      </span>
                    ) : (
                      <span style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
                        <Button
                          data-testid={`rename-${group.id}`}
                          onClick={() => {
                            setRenaming(group.id)
                            setRenameTo(group.name)
                          }}
                          variant="ghost"
                        >
                          {t(locale, 'schedule.groups.rename')}
                        </Button>
                        {group.isActive ? (
                          <Button
                            data-testid={`retire-${group.id}`}
                            onClick={() => patchGroup(group.id, { is_active: false })}
                            variant="ghost"
                          >
                            {t(locale, 'schedule.groups.retire')}
                          </Button>
                        ) : (
                          <Button
                            data-testid={`revive-${group.id}`}
                            onClick={() => patchGroup(group.id, { is_active: true })}
                            variant="ghost"
                          >
                            {t(locale, 'schedule.groups.revive')}
                          </Button>
                        )}
                      </span>
                    ),
                },
              ]
            : [])]}
        rowKey={(group) => group.id}
        rows={groups}
      />
    </section>
  )
}
