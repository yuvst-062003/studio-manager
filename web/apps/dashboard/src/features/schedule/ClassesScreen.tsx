// `#/classes` — חוגים. The screen checkpoint 6 should have been.
//
// The first pass built a flat grid of every GROUP in the club with class chips filtering
// it. The owner corrected it against the prototype: classes come first, and a class is
// what you open to find its groups. `ProgramsView`'s **curriculum** tab is that screen —
// one card per program with its eyebrow, name, description, status badge and its belt
// ladder — and its groups tab is what sits one level down.
//
// **Both ways in are the wizard.** A first pass put a small edit popup beside it; the
// owner cut it — *"remove the popup, it's irrelevant. If want to edit, then the full
// wizard, but with the details already in it."* So `⋯ → עריכה` and `חוג חדש` open the same
// seven steps (§3.21), the first on what the class already has and the second empty.
//
// D2 still holds: no capacity, no occupancy bar. What a class card carries instead is how
// many groups it has, which is a number this screen can count rather than one nobody
// stores. And no colour: the owner cut that too, so the badge is the same neutral mark on
// every card and `class.color` is a column nothing writes.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState, Icon, LoadFailed, PageHeader, RowActions, StatusChip } from '@studio/ui'
import { fill } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { disciplineIcon } from './disciplineIcon'
import type { ClassSummary, GroupSummary, ScheduleClient } from './client'

export function ClassesScreen({
  locale,
  client,
  groups,
  hrefForClass,
  hrefForWizard,
  onChanged,
}: {
  locale: Locale
  client: ScheduleClient
  /** Already fetched by the section for the drill-in; counted here rather than re-read. */
  groups: GroupSummary[]
  hrefForClass: (classId: string) => string
  /** Where the wizard lives, for a class or for a new one. */
  hrefForWizard: (classId: string | null) => string
  /** Absent in a read-only mount — then no create button and no row actions. */
  onChanged?: () => void
}) {
  const [classes, setClasses] = useState<ClassSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

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
          // A link, not a button: the wizard is a route, so it opens in a new tab and the
          // back button works — the same reasoning `App.tsx` gives for hash routing.
          <a
            className="studio-btn"
            data-testid="new-class-open"
            data-variant="secondary"
            href={hrefForWizard(null)}
          >
            {t(locale, 'schedule.classes.create')}
          </a>
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

  if (classes.length === 0) {
    return (
      <section aria-labelledby="classes-title">
        {header}
        <EmptyState title={t(locale, 'schedule.classes.empty')} />
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
                {/* The class's own pictogram, chosen from its discipline the way the
                    prototype chooses one per program. The COLOUR is still neutral on every
                    card — the owner cut the per-class colour — so the mark distinguishes a
                    class without inventing a palette. */}
                <span aria-hidden="true" className="class-card__badge">
                  <Icon name={disciplineIcon(klass.discipline)} size={22} />
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
                        onSelect: () => {
                          globalThis.location.hash = hrefForWizard(klass.id)
                        },
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
    </section>
  )
}
