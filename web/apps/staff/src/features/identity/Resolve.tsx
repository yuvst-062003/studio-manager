// §6.1's staff-app first launch, step 3:
//
//   3  resolve  ├─ owner of a studio that has not been set up
//               │     → studio setup wizard (§5.1), resumable
//               ├─ manager / coach with role assignments
//               │     → 3-screen tour → offline priming → Today
//               └─ no role assignment anywhere
//                     → "אין לך גישה לאפליקציית הצוות" [ אפליקציית ההורים ]
//
// **What "has not been set up" is, and what it deliberately is not.**
//
// §6.1 words this arm as "owner of a studio with no classes yet", and that is what this
// file routed on until M1.9. It has a defect that only becomes visible once the wizard
// exists: §5.1 says "each step can be skipped and returned to", and creating a class is
// step 3. An owner who skips step 3 therefore has no classes — so a classes-based rule
// throws them back into the wizard on every single launch, forever, with no way out.
//
// The rule is `dismissed_at`: the wizard opens for an owner who has never chosen an exit
// from it. That is the persistence §5.1 actually asks for, and it removes a real defect
// rather than working around it. It is also NOT "complete": completeness governs the
// dashboard checklist, and an owner who skipped a step is never complete, so routing on
// completeness would reproduce the same trap by a different name.
import { useEffect, useState } from 'react'
import { apiFetch } from '@studio/core'
import type { Session } from '@studio/core'
import { RefusalScreen } from '@studio/ui'
import type { Locale } from '@studio/i18n'
import { StaffTour } from './StaffTour'

export type ResolveOutcome = 'loading' | 'wizard' | 'tour' | 'refused'

/** Where the parent app lives, so §6.1's refusal is a link rather than a dead end. */
const PARENT_APP_URL = '/parent'

/**
 * `dismissedAt` is three-valued on purpose:
 *   a string — the owner exited the wizard at some point
 *   null     — they never have, so it should open
 *   undefined — we have not asked yet
 * Collapsing the last two would flash the wizard at every returning owner on every cold
 * start, which is the same class of bug as rendering sign-in while a session is loading.
 */
export function decideOutcome(
  session: Session,
  dismissedAt: string | null | undefined,
): ResolveOutcome {
  // §6.1's third arm, and §3.1's rule that access is a QUERY: the staff app asks "do you
  // hold any role assignment?", which is exactly what `access.staff` reports.
  if (!session.access.staff) return 'refused'
  if (dismissedAt === undefined) return 'loading'

  const active = session.studios.find((s) => s.studio_id === session.activeStudioId)
  // §3.2 — 'Studio settings, training year, rollover: owner ✓ manager ✓' and nothing
  // else. §5.1 is narrower still — the wizard is what the OWNER is routed into once they
  // accept — so a manager configures a studio from Settings rather than from here.
  const isOwner = active?.roles.includes('owner') ?? false
  return isOwner && dismissedAt === null ? 'wizard' : 'tour'
}

export function Resolve({
  session,
  locale,
  wizard,
}: {
  session: Session
  locale: Locale
  /** The setup wizard, injected. It lives in @studio/ui because §5.1 routes both the
   *  staff app and the dashboard into the same one. */
  wizard: React.ReactNode
}) {
  const [dismissedAt, setDismissedAt] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (!session.access.staff) return
    let alive = true
    void (async () => {
      try {
        const response = await apiFetch('/api/v1/setup')
        if (!alive) return
        if (!response.ok) {
          // 403 is the ordinary answer for a coach: §3.2 keeps setup at owner and
          // manager. Treated as "not my business" rather than as an error.
          setDismissedAt(NEVER_ROUTE)
          return
        }
        const body = await response.json()
        setDismissedAt(body.dismissed_at ?? null)
      } catch {
        // Offline. §10.2 says the staff app works offline, so an unanswerable question
        // resolves to "assume it was dismissed" — routing a returning owner into a setup
        // wizard because their train went into a tunnel would be far worse than skipping
        // it, and the wizard stays reachable from Settings either way.
        if (alive) setDismissedAt(NEVER_ROUTE)
      }
    })()
    return () => {
      alive = false
    }
  }, [session.access.staff])

  const outcome = decideOutcome(session, dismissedAt)

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
  if (outcome === 'wizard') return <div data-testid="staff-wizard">{wizard}</div>
  return <StaffTour locale={locale} />
}

/** Any non-null value routes away from the wizard; this one names WHY it is not null. */
const NEVER_ROUTE = 'unknown'
