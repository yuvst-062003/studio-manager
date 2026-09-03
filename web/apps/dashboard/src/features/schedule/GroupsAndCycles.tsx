// Dashboard artboard 4b — קבוצות ומחזורים: לו״ז ומחזורים.
//
// **The belt-range column is a stated gap, not a column.** Belt ranges are M7's
// (`belt_rank` is a W4 contract model): a manager who opens this before that milestone
// should read when the range arrives, not see a column of dashes mislabelled `שיעור`
// (B3.3). The one sentence lives in `PageHeader`'s subtitle
// (`schedule.groups.beltRangeLater`) instead. Capacity is DELIBERATELY absent
// altogether: the 2026-08-27 decision cut group capacity from the product entirely (a
// group has no cap; 7d's 42/54 is an EVENT cap), so that promise is deleted rather than
// kept.
//
// The schedule column is this lane's, and so is the fourth thing on the row: **C12's count
// of students left with no training day**, surfaced where a manager browses groups rather
// than only inside a change dialog. It comes from `putSchedule(..., apply: false)` with the
// group's CURRENT rules — a preview that changes nothing and reports the present state —
// and a test asserts every call this screen makes carries `apply: false`, because a browse
// that writes is the worst possible bug on a read-only screen.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, EmptyState, PageHeader, RowActions, Table, TextField } from '@studio/ui'
import { apiFetch, fill, formatDateInStudioZone, formatTimeInStudioZone } from '@studio/core'
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

  // A4/A5 (B3.6) — one header row for every branch this section can return: the title,
  // the create button in the actions slot, and a two-line subtitle. `PageHeader.subtitle`
  // is typed `ReactNode`, not `string`, precisely so a screen can carry more than one
  // sentence there (its own docstring: "a range of dates has to arrive as `RangeText`").
  // Line one is the screen's own description (currently the loose `<p>` B3.6/A4 say
  // prints under the CREATE button instead of the title — dropping it would leave the
  // screen with no visible description at all, which neither B3.3 nor B3.6 asks for).
  // Line two is B3.3's stated gap, at caption weight so it reads as a footnote about a
  // missing column rather than a second description. `groups.caption` is ALSO `Table`'s
  // accessible name (A5 clips that copy out of the visual flow), so the same string
  // appears twice in the DOM but only once on screen.
  const header = (
    <PageHeader
      actions={createForm}
      subtitle={
        <>
          {t(locale, 'schedule.groups.caption')}
          <br />
          <span className="groups-table__subtitle-note">
            {t(locale, 'schedule.groups.beltRangeLater')}
          </span>
        </>
      }
      title={t(locale, 'schedule.groups.title')}
      titleId="groups-title"
    />
  )

  if (groups.length === 0) {
    return (
      <section aria-labelledby="groups-title">
        {header}
        <EmptyState title={t(locale, 'schedule.groups.empty')} />
      </section>
    )
  }

  return (
    <section aria-labelledby="groups-title">
      {header}
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
            // B3.2 — the identity column, headed by what it holds. Not `groups.title`:
            // that is the page title and the (hidden) table caption already, and a
            // 12rem column is not the place for it a third time.
            header: t(locale, 'schedule.groups.col.name'),
            width: '12rem',
            cell: (group) => (
              <>
                {/* B3.1 — the name link IS the door to the schedule editor. It used to
                    stand beside a second, `לו״ז שבועי`-labelled link-button because a
                    comment here said the name link "does not look like the door" — the
                    fix for a link that does not look like a link is to style the link,
                    not add a second one. `.groups-table__name` (schedule.css) gives it
                    the app's standard underline-on-hover affordance; the weekly-schedule
                    column right beside it already shows what is behind the door. */}
                {hrefForGroup ? (
                  <a className="groups-table__name" href={hrefForGroup(group.id)}>
                    {group.name}
                  </a>
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
            // B3.5 — shortened from `groups.unscheduledStudents`. `.groups-table__align-end`
            // (schedule.css) end-aligns BOTH the header and the count — a right-aligned
            // number under a start-aligned header floats away from the label that names
            // it — and `.groups-table__unscheduled` adds the tabular-numeral formatting
            // the count alone needs. The `--danger` tone for a non-zero count is unchanged.
            header: (
              <span className="groups-table__align-end">
                {t(locale, 'schedule.groups.col.unscheduledShort')}
              </span>
            ),
            width: '8rem',
            cell: (group) => {
              const fact = facts[group.id]
              return (
                <span
                  className="groups-table__align-end groups-table__unscheduled"
                  data-testid={`unscheduled-${group.id}`}
                  style={fact && fact.unscheduled > 0 ? warnStyle : undefined}
                >
                  {fact?.unscheduled ?? 0}
                </span>
              )
            },
          },
          // B3.3 — the belt-range column is cut. It was `schedule.session.title` (`שיעור`)
          // over a `—` in every row, because no group has belt data yet: a column empty
          // in every row and mislabelled in its header is worse than an absent one. The
          // stated gap that column used to carry now lives in `header`'s subtitle above,
          // as one sentence. It returns as `schedule.groups.col.beltRange` once
          // `belt_rank` has rows (Part F) — not built here.
          ...(onChanged
            ? [
                {
                  id: 'actions',
                  // A6 — headed by what the column holds, not by the create-group
                  // button's own label.
                  header: t(locale, 'schedule.groups.col.actions'),
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
                      // B3.4 — `שינוי שם` and `העברה לארכיון` / `החזרה מהארכיון` behind
                      // one `⋯`, instead of two ghost buttons stacked into a ~140px row.
                      <RowActions
                        actions={[
                          {
                            id: 'rename',
                            label: t(locale, 'schedule.groups.rename'),
                            onSelect: () => {
                              setRenaming(group.id)
                              setRenameTo(group.name)
                            },
                          },
                          group.isActive
                            ? {
                                id: 'retire',
                                label: t(locale, 'schedule.groups.retire'),
                                onSelect: () => patchGroup(group.id, { is_active: false }),
                              }
                            : {
                                id: 'revive',
                                label: t(locale, 'schedule.groups.revive'),
                                onSelect: () => patchGroup(group.id, { is_active: true }),
                              },
                        ]}
                        triggerLabel={fill(t(locale, 'schedule.groups.rowActions'), {
                          name: group.name,
                        })}
                      />
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
