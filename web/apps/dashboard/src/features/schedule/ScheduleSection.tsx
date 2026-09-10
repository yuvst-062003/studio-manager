// The schedule vertical's container, and the reason `App.tsx` needs exactly one route
// branch rather than four.
//
// `web/apps/dashboard/src/App.tsx` is the one file lane PEOPLE also has to edit this wave,
// so the diff there is kept to a NAV entry and a single `{route === 'schedule' ? … : null}`.
// Everything below — which of 3a, 4b, 6a or the closure calendar to draw, and what each of
// them needs fetched — is this lane's business and lives in this lane's folder.
//
// Routing is `location.hash` because that is what the dashboard already does (App.tsx: "a
// hash route makes them work as links — back button, opening in a new tab, the lot —
// without adding a dependency, which .claude/rules/ui-rtl-a11y.md says not to do without
// asking").
import { useEffect, useMemo, useState } from 'react'
import { EmptyState } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { ClassesScreen } from './ClassesScreen'
import { ClassWizard } from './class-wizard/ClassWizard'
import { ClosuresPanel } from './ClosuresPanel'
import { GroupSchedulePage } from './GroupSchedulePage'
import { GroupsAndCycles } from './GroupsAndCycles'
import { WeekBoard } from './WeekBoard'
import type { ClassSummary, GroupSummary, ScheduleClient, TrainingYear } from './client'
import type { ClassWizardClient } from './class-wizard/client'

export type ScheduleView =
  | 'week'
  | 'classes'
  | 'classGroups'
  | 'classWizard'
  | 'group'
  | 'closures'

export interface ScheduleRoute {
  view: ScheduleView
  groupId?: string
  classId?: string
}

/**
 * `#/schedule` · `#/classes` · `#/classes/new` · `#/classes/<id>` · `#/classes/<id>/edit` ·
 * `#/groups/<id>` · `#/closures`. Anything else is the board.
 *
 * `#/groups` — the flat list of every group in the club — resolves to the classes index
 * rather than 404-ing: it is the hash the nav pointed at until this checkpoint, so it is
 * in real bookmarks, and the screen it named has been replaced rather than deleted.
 *
 * `new` is matched BEFORE the id pattern, the same way `#/students/new` is: a literal that
 * looks like an id is how a create route becomes a 404 for one unlucky uuid.
 */
export function scheduleRoute(hash: string): ScheduleRoute {
  const path = hash.replace(/^#\/?/, '')
  if (path === 'closures') return { view: 'closures' }
  if (path === 'classes' || path === 'groups') return { view: 'classes' }
  // Creating: the wizard with no class behind it yet.
  if (path === 'classes/new') return { view: 'classWizard' }
  // Editing: the same wizard, opened on what the class already has.
  const editing = /^classes\/([^/]+)\/edit$/.exec(path)
  if (editing?.[1]) return { view: 'classWizard', classId: editing[1] }
  const klass = /^classes\/([^/]+)$/.exec(path)
  if (klass?.[1]) return { view: 'classGroups', classId: klass[1] }
  const group = /^groups\/(.+)$/.exec(path)
  if (group?.[1]) return { view: 'group', groupId: group[1] }
  // An unknown hash resolves to the week board rather than to a blank page — the same rule
  // `routeFromHash` already applies at the app level.
  return { view: 'week' }
}

export function ScheduleSection({
  locale,
  client,
  hash,
  wizardClient,
  today,
  canSeeMoney = false,
}: {
  locale: Locale
  client: ScheduleClient
  hash: string
  /** The wizard's own client — seven verticals' endpoints, injected like every other. */
  wizardClient: ClassWizardClient
  /** An ISO instant. A prop, not `new Date()`, all the way down. */
  today: string
  /** §3.2 — coaches never see money, so only a manager gets the plan badge on a roster. */
  canSeeMoney?: boolean
}) {
  const route = scheduleRoute(hash)
  // The classes index counts each class's groups, so it needs the same list the drill-in
  // renders — one read for both rather than a count endpoint the API does not have.
  const needsGroups =
    route.view === 'classes' || route.view === 'classGroups' || route.view === 'group'
  // The wizard fetches for itself, step by step — it is seven screens' worth of data and
  // loading all of it up here would make opening step 1 wait on step 6.
  const needsYear = route.view === 'closures'

  const [groups, setGroups] = useState<GroupSummary[] | null>(null)
  const [groupsVersion, setGroupsVersion] = useState(0)
  // `groups ?? []` inline would mint a fresh array on every render while the fetch is in
  // flight, and `GroupsAndCycles` has `groups` in an effect's dependency list — so the
  // table would re-fetch itself for as long as this component re-rendered.
  const groupList = useMemo(() => groups ?? [], [groups])
  const [year, setYear] = useState<TrainingYear | null>(null)
  const [yearLoaded, setYearLoaded] = useState(false)
  // The class a drill-in is inside. Read rather than derived from its groups: a class with
  // no groups yet has none to take a name from, and that is exactly the manager who most
  // needs the screen to say which class they opened.
  const [klass, setKlass] = useState<ClassSummary | null>(null)

  useEffect(() => {
    if (route.view !== 'classGroups' || !route.classId) return
    const wanted = route.classId
    let live = true
    void client
      .listClasses()
      .then((rows) => {
        if (live) setKlass(rows.find((row) => row.id === wanted) ?? null)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client, route.classId, route.view])

  useEffect(() => {
    // 3a needs sessions, not groups. Fetching a roster to draw a calendar is a request the
    // manager pays for on every week they page through, and a test asserts it is not made.
    if (!needsGroups) return
    let live = true
    void (async () => {
      const loaded = await client.listGroups()
      if (live) setGroups(loaded)
    })()
    return () => {
      live = false
    }
  }, [client, needsGroups, groupsVersion])

  useEffect(() => {
    if (!needsYear) return
    let live = true
    void (async () => {
      const years = await client.listTrainingYears()
      if (!live) return
      setYear(years.find((candidate) => candidate.status === 'active') ?? null)
      setYearLoaded(true)
    })()
    return () => {
      live = false
    }
  }, [client, needsYear])

  if (route.view === 'closures') {
    if (!yearLoaded) return null
    if (!year) {
      return (
        <EmptyState
          title={t(locale, 'schedule.group.noActiveYear')}
          description={t(locale, 'schedule.group.noActiveYearHint')}
        />
      )
    }
    return (
      <ClosuresPanel
        locale={locale}
        client={client}
        trainingYearId={year.id}
        // The Gregorian year the training year opens in. §7 spells the endpoint
        // `?year=2026`, and a year spanning September to June is asked twice as the
        // manager pages — one call, one answer, no guessing on the server's part.
        year={Number(year.starts_on.slice(0, 4))}
      />
    )
  }

  if (route.view === 'group') {
    if (groups === null) return null
    const group = groups.find((candidate) => candidate.id === route.groupId)
    if (!group) {
      // A stale bookmark is the ordinary way to arrive here, and a blank page is the worst
      // available answer.
      return <EmptyState title={t(locale, 'schedule.groups.empty')} />
    }
    return (
      <GroupSchedulePage
        locale={locale}
        client={client}
        groupId={group.id}
        groupName={group.name}
      />
    )
  }

  if (route.view === 'classWizard') {
    return (
      <ClassWizard
        classId={route.classId ?? null}
        client={wizardClient}
        locale={locale}
        onExit={(classId) => {
          globalThis.location.hash = classId ? `#/classes/${classId}` : '#/classes'
        }}
      />
    )
  }

  if (route.view === 'classGroups') {
    if (groups === null) return null
    const mine = groupList.filter((group) => group.classId === route.classId)
    return (
      <GroupsAndCycles
        backHref="#/classes"
        classId={route.classId}
        className={klass?.name}
        client={client}
        discipline={klass?.discipline}
        groups={mine}
        hrefForGroup={(groupId) => `#/groups/${groupId}`}
        locale={locale}
        onChanged={() => setGroupsVersion((n) => n + 1)}
        today={today}
      />
    )
  }

  if (route.view === 'classes') {
    if (groups === null) return null
    return (
      <ClassesScreen
        client={client}
        groups={groupList}
        hrefForClass={(classId) => `#/classes/${classId}`}
        hrefForWizard={(classId) => (classId ? `#/classes/${classId}/edit` : '#/classes/new')}
        locale={locale}
        onChanged={() => setGroupsVersion((n) => n + 1)}
      />
    )
  }

  return <WeekBoard canSeeMoney={canSeeMoney} locale={locale} client={client} today={today} />
}
