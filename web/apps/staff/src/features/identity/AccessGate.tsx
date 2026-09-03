// §6.1's staff first launch, step 3's refusal arm — split out of `Resolve` (2026-09-02).
//
// **Refused BEFORE the shell, not inside it.** The dashboard app hit this exact bug in
// production (2026-08-29, then 2026-08-30 for the zero-studio case specifically): "a
// refusal rendered inside AppShell would still draw the nav." Every hash-routed screen in
// `App.tsx` already re-checks `session.access.staff` for itself, so a refused coach could
// not reach a screen — but `Resolve` rendered `RefusalScreen` only as the DEFAULT branch,
// deep inside `AppShell`, so the title, the drawer and the (unguarded) install banner all
// rendered around it regardless. This component IS that shell boundary: `App.tsx` mounts
// it above `AppShell`, and `AppShell` renders only as `children`, once passed.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { apiFetch } from '@studio/core'
import type { Session } from '@studio/core'
import { RefusalScreen } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

/** Where the parent app lives, so §6.1's refusal is a link rather than a dead end. */
const PARENT_APP_URL = '/parent'

/** Logical, not `margin-top`: the app is RTL and .claude/rules/ui-rtl-a11y.md says so. */
const inviteStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-2)',
  marginBlockStart: 'var(--space-5)',
}

export function AccessGate({
  session,
  locale,
  children,
}: {
  session: Session
  locale: Locale
  children: React.ReactNode
}) {
  // F5's other half. The manager reads the token off the dashboard once and hands it
  // over — there is no mailer anywhere in this product — and the dashboard's own invite
  // screen tells them to say so: 'בכניסה לאפליקציה בוחרים "יש לי קוד הזמנה"'.
  //
  // Until it is redeemed the invited coach has no Person bound to their identity, so
  // §6.1's `access.staff` query answers false and they take the refusal arm below. That
  // arm was the whole journey's dead end: a link to the parent app and a sign-out button,
  // and nowhere to type the code the dashboard had just promised would work. The parent
  // app carries the same entry beneath its own refusal, for the same reason (2026-08-31).
  const [code, setCode] = useState('')
  const redeem = (token: string) =>
    apiFetch('/api/v1/auth/accept-invitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).then((response) => {
      // `reload` and not a local state flip: accepting mints a new session naming the
      // invited studio, and every arm below routes on what that session says.
      if (response.ok) session.reload()
    })

  if (!session.access.staff) {
    return (
      <>
        <RefusalScreen
          which="staff"
          otherAppUrl={PARENT_APP_URL}
          onSignOut={() => void session.signOut()}
          locale={locale}
          email={session.email}
        />
        {/* An invited coach reaches this screen and no other, so the redemption has to
            live here or F5 has no third step at all.

            `notFound` leads, exactly as it does in the parent app: without it the code
            entry butts straight against the refusal's sign-out row and reads as part of
            it, and the refusal above says only 'ask your manager' — which is the one
            thing a coach already holding the manager's code does not need to do. */}
        <section data-testid="staff-no-match" style={inviteStyle}>
          <p>{t(locale, 'common.auth.notFound')}</p>
          <label htmlFor="invite-code">{t(locale, 'common.auth.inviteCodeLabel')}</label>
          <input id="invite-code" value={code} onChange={(event) => setCode(event.target.value)} />
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
