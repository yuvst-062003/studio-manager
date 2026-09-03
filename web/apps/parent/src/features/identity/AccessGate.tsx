// §6.1's parent first launch, step 3's refusal arm — split out of `Resolve` (2026-09-02).
//
// **Refused BEFORE the shell, not inside it.** The dashboard app hit this exact bug
// twice in production (2026-08-29, then 2026-08-30 for the zero-studio case
// specifically): "a refusal rendered inside AppShell would still draw the nav." `Resolve`
// rendered `RefusalScreen` correctly, but only as the DEFAULT branch deep inside
// AppShell's consent/health/payment gates — so a signed-in account with no guardian row
// (ANY Google account can authenticate and belong to nothing; §6.1: "there is no path
// from I downloaded the app to I have a studio") saw the full working-looking app (title,
// drawer, install banner, tab bar) wrapped around "לא נמצאו תלמידים המשויכים אליך", and
// every explicit hash route (`#/absence`, `#/payments/history`, a typed `#/student/<id>`)
// was reachable regardless — contradicting `App.tsx`'s own comment that "a person with no
// guardian row never reaches this shell". This component IS that shell boundary: `App.tsx`
// mounts it above `AppShell`, and `AppShell` renders only as `children`, once passed.
import { useEffect, useState } from 'react'
import { RefusalScreen } from '@studio/ui'
import type { Session } from '@studio/core'
import { apiFetch } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
// §2 decision 3 -- "cleared ... on sign-out," the second of this app's two sign-out
// call sites (App.tsx's account drawer is the other).
import { clearAllJoinDrafts } from '../onboarding/joinDraftStorage'

/** Where the staff app lives, so §6.1's second refusal is a link rather than a dead end. */
const STAFF_APP_URL = '/staff'

export function AccessGate({
  session,
  locale,
  children,
}: {
  session: Session
  locale: Locale
  children: React.ReactNode
}) {
  // Pre-filled from an invitation LINK (`/?invite=<token>`, 2026-08-30) — the manager's
  // add-a-student screen hands the parent this URL; retyping a long token from it is the
  // exact friction the link exists to remove.
  const [code, setCode] = useState(
    () => new URLSearchParams(globalThis.location?.search ?? '').get('invite') ?? '',
  )
  const redeem = (token: string) =>
    apiFetch('/api/v1/auth/accept-invitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).then((response) => {
      if (response.ok) session.reload()
    })

  // The link's token is redeemed on arrival, once — a parent who followed the link has
  // already said yes. A failed redeem leaves the pre-filled field on screen, which is
  // the manual path with the typing already done.
  const arrivedWithInvite = code !== '' && !session.access.parent
  // Whether that redeem is still in flight. The refusal below keys on `!access.parent`,
  // which stays true for the whole round trip -- so an invited parent's FIRST screen was
  // "you do not have access here", from the club's own link. They are mid-join, not
  // refused, and they are the one audience that message must never reach.
  const [joining, setJoining] = useState(arrivedWithInvite)
  useEffect(() => {
    if (!arrivedWithInvite) return
    // `code` was initialised from this same `?invite=` param and nothing has had a chance
    // to edit it yet, so re-reading the URL here would be a second source for one value.
    // `arrivedWithInvite` already guarantees it is non-empty.
    //
    // `finally` and not `then`: a failed redeem must also stop claiming to be joining, or
    // a parent whose token expired waits on a spinner for ever instead of reaching the
    // pre-filled manual path below.
    void redeem(code).finally(() => setJoining(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one shot, on arrival only.
  }, [])

  if (joining) {
    return (
      <section aria-busy="true" data-testid="parent-joining">
        <p>{t(locale, 'common.auth.joining')}</p>
      </section>
    )
  }

  if (!session.access.parent) {
    return (
      <>
        <RefusalScreen
          which="parent"
          otherAppUrl={STAFF_APP_URL}
          onSignOut={() => {
            clearAllJoinDrafts()
            void session.signOut()
          }}
          locale={locale}
          email={session.email}
        />
        {/* §6.1 step 3's 'no match' branch. Without it, a correctly-invited parent whose
            email differs from the invitation by one character has no way forward at all
            — and that person cannot tell their situation from a genuine refusal. */}
        <section data-testid="parent-no-match">
          <p>{t(locale, 'common.auth.notFound')}</p>
          <label htmlFor="invite-code">{t(locale, 'common.auth.inviteCodeLabel')}</label>
          <input
            id="invite-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              void redeem(code)
            }}
          >
            {t(locale, 'common.auth.haveInviteCode')}
          </button>
        </section>
      </>
    )
  }

  return <>{children}</>
}
