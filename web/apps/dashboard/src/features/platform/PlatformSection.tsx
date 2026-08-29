// §18.1's platform console, at `#/platform`. One screen, two panels: is the deployment
// working, and which clubs exist.
//
// **Offered only when /auth/me says `is_platform_admin`, and that is a DOOR decision, not
// a security boundary.** Every `/platform/*` route re-confirms platform-admin against the
// database on its own — `require_platform_admin` deliberately re-queries rather than
// trusting the token's `padm` claim, because removing an operator must not wait fifteen
// minutes for a claim to expire. A tampered client that forced this screen open would get
// the console's chrome and a 403 in every panel, which is the correct outcome.
//
// **In the dashboard rather than a fourth app.** An operator surface is not a manager
// surface, and a separate origin would be the cleaner separation — but it is also a new
// Dockerfile, Railway service, domain and deploy for four endpoints, and the boundary
// that actually matters is enforced by the API in either case.
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@studio/core'
import { EmptyState, LoadFailed } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { OpsHealthPanel } from './OpsHealthPanel'
import { StudiosPanel } from './StudiosPanel'
import { makePlatformClient } from './client'
import type { OpsHealth, PlatformClient, PlatformStudio } from './client'

export function PlatformSection({
  client = makePlatformClient(apiFetch),
  isPlatformAdmin,
  locale,
}: {
  client?: PlatformClient
  isPlatformAdmin: boolean
  locale: Locale
}) {
  const [health, setHealth] = useState<OpsHealth | null>(null)
  const [studios, setStudios] = useState<PlatformStudio[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    if (!isPlatformAdmin) return
    setFailed(false)
    try {
      // Both together: a console that rendered the club list while the board was still
      // loading would flash a screen with no health on it, and the health is the half
      // somebody opens this at 2am for.
      const [nextHealth, nextStudios] = await Promise.all([client.health(), client.listStudios()])
      setHealth(nextHealth)
      setStudios(nextStudios)
    } catch {
      setFailed(true)
    }
  }, [client, isPlatformAdmin])

  useEffect(() => {
    let alive = true
    void (async () => {
      await load()
      if (!alive) return
    })()
    return () => {
      alive = false
    }
  }, [load])

  // A typed `#/platform` from somebody who is not an operator refuses in words rather
  // than rendering an empty console — the same treatment F10 gives a coach who types a
  // manager-only hash.
  if (!isPlatformAdmin) {
    return <EmptyState title={t(locale, 'common.dash.forbidden')} />
  }

  if (failed) {
    return <LoadFailed locale={locale} onRetry={() => void load()} />
  }

  return (
    <section aria-labelledby="platform-title" data-testid="platform-console">
      <h2 id="platform-title">{t(locale, 'common.platform.title')}</h2>
      {health ? <OpsHealthPanel health={health} locale={locale} /> : null}
      {studios ? (
        <StudiosPanel
          client={client}
          locale={locale}
          onChanged={() => void load()}
          studios={studios}
        />
      ) : null}
    </section>
  )
}
