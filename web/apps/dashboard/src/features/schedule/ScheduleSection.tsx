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
import { useEffect, useState } from 'react'
import { EmptyState } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { ClosuresPanel } from './ClosuresPanel'
import { GroupSchedulePage } from './GroupSchedulePage'
import { GroupsAndCycles } from './GroupsAndCycles'
import { WeekBoard } from './WeekBoard'
import type { GroupSummary, ScheduleClient, TrainingYear } from './client'

export type ScheduleView = 'week' | 'groups' | 'group' | 'closures'

export interface ScheduleRoute {
  view: ScheduleView
  groupId?: string
}

/** `#/schedule` · `#/groups` · `#/groups/<id>` · `#/closures`. Anything else is the board. */
export function scheduleRoute(hash: string): ScheduleRoute {
  const path = hash.replace(/^#\/?/, '')
  if (path === 'closures') return { view: 'closures' }
  if (path === 'groups') return { view: 'groups' }
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
  today,
}: {
  locale: Locale
  client: ScheduleClient
  hash: string
  /** An ISO instant. A prop, not `new Date()`, all the way down. */
  today: string
}) {
  const route = scheduleRoute(hash)
  const needsGroups = route.view === 'groups' || route.view === 'group'
  const needsYear = route.view === 'closures'

  const [groups, setGroups] = useState<GroupSummary[] | null>(null)
  const [year, setYear] = useState<TrainingYear | null>(null)
  const [yearLoaded, setYearLoaded] = useState(false)

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
  }, [client, needsGroups])

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

  if (route.view === 'groups') {
    return (
      <GroupsAndCycles
        locale={locale}
        client={client}
        groups={groups ?? []}
        today={today}
        hrefForGroup={(groupId) => `#/groups/${groupId}`}
      />
    )
  }

  return <WeekBoard locale={locale} client={client} today={today} />
}
