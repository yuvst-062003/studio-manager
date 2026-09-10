// `#/classes` — חוגים. The screen checkpoint 6 should have been.
//
// The first pass built a flat grid of every GROUP in the club with class chips filtering
// it. The owner corrected it against the prototype: classes come first, and a class is
// what you open to find its groups. `ProgramsView`'s **curriculum** tab is that screen —
// one card per program with its eyebrow, name, description, status badge and its belt
// ladder — and its groups tab is what sits one level down.
//
// The two ways in differ, and the owner named both:
//
//   * **an existing class opens a small popup** to correct its name, description or
//     colour — `ClassEditDialog`, and `PATCH /api/v1/classes/{id}`, which did not exist
//     until this checkpoint;
//   * **a new class opens the seven-step wizard** — §3.21, its own checkpoint. Until that
//     lands the create button opens the same small popup against `POST /classes`, which
//     is less than the wizard and is not a dead end; the wizard replaces it in place.
//
// D2 still holds: no capacity, no occupancy bar. What a class card carries instead is how
// many groups it has, which is a number this screen can count rather than one nobody
// stores.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, EmptyState, Icon, LoadFailed, PageHeader, RowActions, StatusChip } from '@studio/ui'
import { fill } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { ClassEditDialog } from './ClassEditDialog'
import type { ClassDraft, ClassSummary, GroupSummary, ScheduleClient } from './client'

export function ClassesScreen({
  locale,
  client,
  groups,
  hrefForClass,
  onChanged,
}: {
  locale: Locale
  client: ScheduleClient
  /** Already fetched by the section for the drill-in; counted here rather than re-read. */
  groups: GroupSummary[]
  hrefForClass: (classId: string) => string
  /** Absent in a read-only mount — then no create button and no row actions. */
  onChanged?: () => void
}) {
  const [classes, setClasses] = useState<ClassSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  /** `null` = closed · `{ klass: null }` = create · `{ klass }` = edit. */
  const [editing, setEditing] = useState<{ klass: ClassSummary | null } | null>(null)

  useEffect(() => {
    let live = true
    void client
      .listClasses()
      .then((rows) => {
        if (live) setClasses(rows)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [attempt, client])

  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const group of groups) {
      if (group.isActive) counts.set(group.classId, (counts.get(group.classId) ?? 0) + 1)
    }
    return counts
  }, [groups])

  const save = useCallback(
    async (draft: ClassDraft) => {
      const target = editing?.klass
      if (target) await client.updateClass(target.id, draft)
      else await client.createClass(draft)
      // Closed only on success — `ClassEditDialog` renders the failure itself and keeps
      // what was typed, so a failed save is never a popup that vanished with the words in
      // it.
      setEditing(null)
      setClasses(await client.listClasses())
      onChanged?.()
    },
    [client, editing, onChanged],
  )

  const retire = useCallback(
    async (klass: ClassSummary) => {
      await client.updateClass(klass.id, { is_active: !klass.isActive })
      setClasses(await client.listClasses())
      onChanged?.()
    },
    [client, onChanged],
  )

  const header = (
    <PageHeader
      actions={
        onChanged ? (
          <Button
            data-testid="new-class-open"
            onClick={() => setEditing({ klass: null })}
            variant="secondary"
          >
            {t(locale, 'schedule.classes.create')}
          </Button>
        ) : null
      }
      subtitle={t(locale, 'schedule.classes.subtitle')}
      title={t(locale, 'schedule.classes.title')}
      titleId="classes-title"
    />
  )

  if (failed) {
    return (
      <section aria-labelledby="classes-title">
        {header}
        <LoadFailed
          locale={locale}
          onRetry={() => {
            setFailed(false)
            setAttempt((n) => n + 1)
          }}
        />
      </section>
    )
  }

  if (classes === null) return null

  const dialog = editing ? (
    <ClassEditDialog
      klass={editing.klass}
      locale={locale}
      onCancel={() => setEditing(null)}
      onSave={save}
    />
  ) : null

  if (classes.length === 0) {
    return (
      <section aria-labelledby="classes-title">
        {header}
        <EmptyState title={t(locale, 'schedule.classes.empty')} />
        {dialog}
      </section>
    )
  }

  return (
    <section aria-labelledby="classes-title">
      {header}

      <ul
        aria-label={t(locale, 'schedule.classes.title')}
        className="classes-grid"
        data-testid="classes-grid"
      >
        {classes.map((klass) => {
          const count = groupCounts.get(klass.id) ?? 0
          return (
            <li className="class-card" data-testid={`class-card-${klass.id}`} key={klass.id}>
              <div className="class-card__head">
                {/* The class's own colour, as a token name — G13. `data-colour` drives the
                    tint from CSS, so a class with no colour set simply falls back to the
                    neutral badge rather than rendering a hole. */}
                <span
                  aria-hidden="true"
                  className="class-card__badge"
                  data-colour={klass.color ?? undefined}
                >
                  <Icon name="groups" />
                </span>
                <span className="class-card__titles">
                  {klass.discipline ? (
                    <span className="class-card__eyebrow">{klass.discipline}</span>
                  ) : null}
                  {/* The name is the door into the class's groups. */}
                  <a className="class-card__name" href={hrefForClass(klass.id)}>
                    {klass.name}
                  </a>
                </span>
                <StatusChip
                  label={t(
                    locale,
                    klass.isActive ? 'schedule.groups.active' : 'schedule.groups.archived',
                  )}
                  status={klass.isActive ? 'paid' : 'cancelled'}
                />
                {onChanged ? (
                  <RowActions
                    actions={[
                      {
                        id: 'edit',
                        label: t(locale, 'schedule.classes.edit'),
                        onSelect: () => setEditing({ klass }),
                      },
                      {
                        id: 'retire',
                        label: t(
                          locale,
                          klass.isActive ? 'schedule.classes.retire' : 'schedule.classes.revive',
                        ),
                        onSelect: () => void retire(klass),
                      },
                    ]}
                    triggerLabel={fill(t(locale, 'schedule.classes.rowActions'), {
                      name: klass.name,
                    })}
                  />
                ) : null}
              </div>

              {klass.description ? (
                <p className="class-card__description">{klass.description}</p>
              ) : null}

              <div className="class-card__foot">
                <span className="class-card__count" data-testid={`class-groups-${klass.id}`}>
                  {count === 1
                    ? t(locale, 'schedule.classes.groupCountOne')
                    : fill(t(locale, 'schedule.classes.groupCount'), { count })}
                </span>
                <a className="class-card__open" href={hrefForClass(klass.id)}>
                  {t(locale, 'schedule.classes.openGroups')}
                </a>
              </div>
            </li>
          )
        })}
      </ul>

      {dialog}
    </section>
  )
}
