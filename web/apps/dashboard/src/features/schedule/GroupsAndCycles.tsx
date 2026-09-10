// Dashboard artboard 4b — קבוצות ומחזורים: לו״ז ומחזורים.
//
// Ported from the prototype's `ProgramsView` group grid (checkpoint 6 of 19). A table of
// four columns becomes a grid of cards, because the four facts a manager reads here are
// not a comparison across rows — they are four facts about one group, and a card is where
// four facts about one thing belong.
//
// **The occupancy bar the prototype draws is NOT here, and that is D2.** Group capacity was
// cut from the product on 2026-08-27 (a group has no cap; 7d's 42/54 is an EVENT cap), and
// the owner confirmed it again on 2026-09-10: no capacity column, no occupancy bar, no
// `14/15`. The slot the bar occupies in the prototype is taken by the count this screen
// already computes and the prototype has no equivalent of — **C12's students left with no
// training day** — which is the real capacity pressure a manager can act on.
//
// **The belt-range column is a stated gap, not a column.** Belt ranges are M7's
// (`belt_rank` is a W4 contract model): a manager who opens this before that milestone
// should read when the range arrives, not see a `—` in every card (B3.3). The one sentence
// lives in `PageHeader`'s subtitle (`schedule.groups.beltRangeLater`).
//
// The unscheduled count comes from `putSchedule(..., apply: false)` with the group's
// CURRENT rules — a preview that changes nothing and reports the present state — and a test
// asserts every call this screen makes carries `apply: false`, because a browse that writes
// is the worst possible bug on a read-only screen.
//
// The coach and the room are the NEXT SESSION's, not the group's, and the card says so in
// the label. The group's own staff live behind `GET /api/v1/groups/{id}/staff`, and asking
// for them would add a fourth request per group to a loop that already makes three — the
// same N+1 shape §3.17 flags as a defect on the rollover screen. The next session is
// already fetched and already carries both.
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, EmptyState, Icon, PageHeader, RowActions, StatusChip, TextField } from '@studio/ui'
import { apiFetch, fill, formatDateInStudioZone, formatTimeInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { GroupSummary, ScheduleClient, ScheduleRule, SessionRow } from './client'

interface GroupFacts {
  rules: ScheduleRule[]
  next: SessionRow | null
  unscheduled: number
}

function ruleLabel(rule: ScheduleRule, locale: Locale): string {
  return `${t(locale, `schedule.weekday.${rule.weekday}`)} ${rule.start_time.slice(
    0,
    5,
  )}–${rule.end_time.slice(0, 5)}`
}

/** The lead coach of a session, or the first assistant if a group runs without one. A
 *  substitute is named rather than hidden — "who is actually taking this" is the question
 *  the card answers. */
function coachOf(session: SessionRow): string | null {
  const lead = session.staff.find((member) => member.role === 'lead_coach')
  return (lead ?? session.staff[0])?.display_name ?? null
}

/** One labelled fact inside a card's well. `<dt>`/`<dd>` rather than two spans: the label
 *  and its value are a pair, and a screen reader that can say so should. */
function Fact({
  label,
  children,
  testId,
  tone,
}: {
  label: string
  children: ReactNode
  testId?: string
  tone?: 'danger'
}) {
  return (
    <div className="group-card__fact" data-tone={tone}>
      <dt>{label}</dt>
      <dd data-testid={testId}>{children}</dd>
    </div>
  )
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
  /** An ISO instant. A prop, not `new Date()` — the "next session" fact depends on it. */
  today: string
  /**
   * Where a group's own page lives, if it has one. Optional so the grid renders standalone
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
  // D1 — the prototype's five discipline pills become class chips that filter for real.
  // The club has two classes today and expects more classes AND more studios, so this is
  // the affordance that has to scale, not a hardcoded row of sports.
  const [filterClassId, setFilterClassId] = useState('')

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

  // The chips are built from the groups on screen rather than from `GET /api/v1/classes`,
  // so a class with no groups never offers a chip that filters to nothing.
  const classChips = useMemo(() => {
    const seen = new Map<string, string>()
    for (const group of groups) if (group.classId) seen.set(group.classId, group.className)
    return [...seen].map(([id, name]) => ({ id, name }))
  }, [groups])

  const shown = useMemo(
    () => (filterClassId ? groups.filter((group) => group.classId === filterClassId) : groups),
    [filterClassId, groups],
  )

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
              // list — an affordance nobody has a reason to try, so "create a group"
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
  // sentence there. Line two is B3.3's stated gap, at caption weight so it reads as a
  // footnote about a missing fact rather than a second description.
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

      {/* One class is not a choice — the chips appear only when there is something to
          choose between, the same rule `StudentsScreen` follows. */}
      {classChips.length > 1 ? (
        <div
          aria-label={t(locale, 'schedule.groups.filterClass')}
          className="groups-class-tabs"
          data-testid="groups-class-tabs"
          role="group"
        >
          <button
            aria-pressed={filterClassId === ''}
            data-testid="groups-class-tab-all"
            onClick={() => setFilterClassId('')}
            type="button"
          >
            {t(locale, 'schedule.groups.filterClassAny')}
          </button>
          {classChips.map((klass) => (
            <button
              aria-pressed={filterClassId === klass.id}
              data-testid={`groups-class-tab-${klass.id}`}
              key={klass.id}
              onClick={() => setFilterClassId(klass.id)}
              type="button"
            >
              {klass.name}
            </button>
          ))}
        </div>
      ) : null}

      {/* The list carries the accessible name the `<table>` used to carry as its caption —
          a grid of cards is still one named collection, and losing that name on the way
          from table to cards would be exactly the kind of quiet loss §0 forbids. */}
      <ul
        aria-label={t(locale, 'schedule.groups.caption')}
        className="groups-grid"
        data-testid="groups-grid"
      >
        {shown.map((group) => {
          const fact = facts[group.id]
          const next = fact?.next ?? null
          const coach = next ? coachOf(next) : null
          const room = next?.location_name ?? null
          const unscheduled = fact?.unscheduled ?? 0
          return (
            <li className="group-card" data-testid={`group-card-${group.id}`} key={group.id}>
              <div className="group-card__head">
                <span aria-hidden="true" className="group-card__badge">
                  <Icon name="groups" />
                </span>
                <span className="group-card__titles">
                  {/* The class name reads as the card's eyebrow, which is where the
                      prototype puts the discipline. Ours is a real class, and D1 makes it
                      the thing the chips above filter on. */}
                  <span className="group-card__eyebrow">{group.className}</span>
                  {/* B3.1 — the name link IS the door to the schedule editor, styled as a
                      link so it looks like one rather than gaining a second button that
                      says the same thing. */}
                  {hrefForGroup ? (
                    <a className="group-card__name" href={hrefForGroup(group.id)}>
                      {group.name}
                    </a>
                  ) : (
                    <span className="group-card__name">{group.name}</span>
                  )}
                </span>
                {/* An archived group is stated in words, never by a dimmer card alone. */}
                <StatusChip
                  label={t(
                    locale,
                    group.isActive ? 'schedule.groups.active' : 'schedule.groups.archived',
                  )}
                  status={group.isActive ? 'paid' : 'cancelled'}
                />
                {/* B3.4 — `שינוי שם` and `העברה לארכיון` / `החזרה מהארכיון` behind one `⋯`,
                    instead of two ghost buttons stacked into a ~140px row.

                    In the HEAD, which is where this port leaves the prototype. The
                    prototype's card foot holds two full-width action buttons; ours would
                    hold one `⋯` under a rule, which is more chrome than the control it
                    frames. The head already carries the card's other per-card affordance
                    (the state chip), and the menu is named after the group, so it reads as
                    that card's without a rule to say so. */}
                {onChanged && renaming !== group.id ? (
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
                ) : null}
              </div>

              <dl className="group-card__well">
                <Fact
                  label={t(locale, 'schedule.groups.weeklySchedule')}
                  testId={`schedule-${group.id}`}
                >
                  {fact && fact.rules.length > 0
                    ? fact.rules.map((rule) => (
                        <div key={rule.id ?? ruleLabel(rule, locale)}>{ruleLabel(rule, locale)}</div>
                      ))
                    : t(locale, 'schedule.rules.empty')}
                </Fact>

                <Fact label={t(locale, 'schedule.groups.nextSession')} testId={`next-${group.id}`}>
                  {next
                    ? `${formatDateInStudioZone(next.starts_at, locale)} · ${formatTimeInStudioZone(
                        next.starts_at,
                        locale,
                      )}`
                    : t(locale, 'schedule.groups.noNextSession')}
                </Fact>

                {/* Only when there IS a next session to describe — the label names whose
                    coach and room these are, so the card never implies the group has one
                    fixed pair when a substitute is taking Tuesday. */}
                {next && (coach || room) ? (
                  <Fact
                    label={t(locale, 'schedule.groups.nextCoachRoom')}
                    testId={`next-where-${group.id}`}
                  >
                    {[coach, room].filter(Boolean).join(' · ')}
                  </Fact>
                ) : null}

                {/* D2's slot. Where the prototype draws an occupancy bar over a capacity we
                    do not store, this card puts the number a manager can actually act on.
                    `--danger` when above zero, with the label beside it — never colour
                    alone. */}
                <Fact
                  label={t(locale, 'schedule.groups.unscheduledStudents')}
                  testId={`unscheduled-${group.id}`}
                  tone={unscheduled > 0 ? 'danger' : undefined}
                >
                  {unscheduled}
                </Fact>
              </dl>

              {/* The foot exists only while a rename is open. An empty rule under every
                  card is chrome that frames nothing. */}
              {onChanged && renaming === group.id ? (
                <div className="group-card__foot">
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
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
