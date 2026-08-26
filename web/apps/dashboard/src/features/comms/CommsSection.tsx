// 4f, mounted (design pass 2026-08-27). `AnnouncementsScreen` was built and unit-tested
// in W5 and imported by nothing — the whole composer was unreachable in a running app,
// the same disease the ship audit found on the billing screens in W4. This container owns
// the two reads the screen needs and nothing else.
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@studio/core'
import type { Locale } from '@studio/i18n'
import { AnnouncementsScreen } from './AnnouncementsScreen'
import type { ScopeOption } from './AnnouncementsScreen'
import { makeDashboardCommsClient } from './dashboardCommsClient'

async function list<T>(path: string): Promise<T[]> {
  try {
    const response = await apiFetch(path)
    if (!response.ok) return []
    return ((await response.json()) as { items: T[] }).items
  } catch {
    return []
  }
}

export function CommsSection({
  locale,
  canPublishStudioWide,
}: {
  locale: Locale
  canPublishStudioWide: boolean
}) {
  const client = useMemo(() => makeDashboardCommsClient(apiFetch), [])
  const [scopes, setScopes] = useState<ScopeOption[] | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const [classes, groups] = await Promise.all([
        list<{ id: string; name: string }>('/api/v1/classes?limit=100'),
        list<{ id: string; name: string }>('/api/v1/groups?limit=100'),
      ])
      if (!alive) return
      setScopes([
        ...classes.map((c) => ({ id: c.id, name: c.name, type: 'class' as const })),
        ...groups.map((g) => ({ id: g.id, name: g.name, type: 'group' as const })),
      ])
    })()
    return () => {
      alive = false
    }
  }, [])

  if (scopes === null) return null
  return (
    <AnnouncementsScreen
      client={client}
      locale={locale}
      scopes={scopes}
      canPublishStudioWide={canPublishStudioWide}
    />
  )
}
