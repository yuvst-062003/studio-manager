// §6.1's staff-app first launch, step 3:
//
//   3  resolve  ├─ owner of a studio with no classes yet
//               │     → studio setup wizard (§5.1), resumable
//               ├─ manager / coach with role assignments
//               │     → 3-screen tour → offline priming → Today
//               └─ no role assignment anywhere
//                     → "אין לך גישה לאפליקציית הצוות" [ אפליקציית ההורים ]
//
// The three arms are decided from one /auth/me response plus one question the server can
// answer: does this studio have a class yet? §6.1 says "owner of a studio with no classes
// yet", and "no classes yet" is what distinguishes a studio nobody has set up from one
// that is running.
import { useEffect, useState } from 'react'
import { apiFetch } from '@studio/core'
import type { Session } from '@studio/core'
import { RefusalScreen } from '@studio/ui'
import type { Locale } from '@studio/i18n'
import { StaffTour } from './StaffTour'

export type ResolveOutcome = 'loading' | 'wizard' | 'tour' | 'refused'

/** Where the parent app lives, so §6.1's refusal is a link rather than a dead end. */
const PARENT_APP_URL = '/parent'

export function decideOutcome(session: Session, hasClasses: boolean | null): ResolveOutcome {
  // §6.1's third arm, and §3.1's rule that access is a QUERY: the staff app asks "do you
  // hold any role assignment?", which is exactly what `access.staff` reports.
  if (!session.access.staff) return 'refused'
  if (hasClasses === null) return 'loading'

  const active = session.studios.find((s) => s.studio_id === session.activeStudioId)
  // §3.2 — 'Studio settings, training year, rollover: owner ✓ manager ✓' and nothing
  // else. A coach routed into the wizard could create the studio's whole structure.
  const isOwner = active?.roles.includes('owner') ?? false
  return isOwner && !hasClasses ? 'wizard' : 'tour'
}

export function Resolve({
  session,
  locale,
  wizard,
}: {
  session: Session
  locale: Locale
  /** The setup wizard, injected. It lives in the dashboard app's own feature directory,
   *  and the staff app links to it rather than duplicating it. */
  wizard: React.ReactNode
}) {
  const [hasClasses, setHasClasses] = useState<boolean | null>(null)

  useEffect(() => {
    if (!session.access.staff) return
    let alive = true
    void (async () => {
      try {
        const response = await apiFetch('/api/v1/classes?limit=1')
        const body = response.ok ? await response.json() : { items: [] }
        if (alive) setHasClasses((body.items ?? []).length > 0)
      } catch {
        // Offline. §10.2 says the staff app works offline, so an unanswerable question
        // resolves to "assume set up" — routing a returning coach into a setup wizard
        // because their train went into a tunnel would be far worse than skipping it.
        if (alive) setHasClasses(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [session.access.staff])

  const outcome = decideOutcome(session, hasClasses)

  if (outcome === 'refused') {
    return (
      <RefusalScreen
        which="staff"
        otherAppUrl={PARENT_APP_URL}
        onSignOut={() => void session.signOut()}
        locale={locale}
      />
    )
  }
  if (outcome === 'loading') return <p data-testid="staff-resolving" />
  if (outcome === 'wizard') return <div data-testid="setup-wizard">{wizard}</div>
  return <StaffTour locale={locale} />
}
