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
import type { Session } from '@studio/core'
import { apiFetch } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
// §2 decision 3 -- "cleared ... on sign-out," the second of this app's two sign-out
// call sites (App.tsx's account drawer is the other).
import { clearAllJoinDrafts } from '../onboarding/joinDraftStorage'
import { ParentRefusalScreen } from './ParentRefusalScreen'

// **`STAFF_APP_URL` and `RefusalScreen` are gone (#32, owner 2026-09-08).** The shared
// component's §6.1 contract is "told which app is theirs and given a direct link", and the
// owner's ruling is that the parent app must send nobody to `/staff`: the account this
// screen actually refuses is one that belongs to nothing anywhere (any Google account can
// authenticate), so the "direct link" was a second door that refuses them again. The staff
// app and the dashboard still import `RefusalScreen` and are deliberately unchanged.

/** Task 9b §2 -- what `POST /accept-invitation` names, the moment it names it. `id` is
 *  the invited `Student`; `name` is `null` only for the (staff/manager) invitations that
 *  carry no student at all, which the parent app never redeems through this gate. */
export type InvitedStudent = { id: string; name: string | null }

export function AccessGate({
  session,
  locale,
  onInvitedStudent,
  children,
}: {
  session: Session
  locale: Locale
  /** Task 9b §2/§3 -- fired once, the moment redemption resolves with a named student,
   *  so `App.tsx` can open the join wizard on THAT child regardless of the family's
   *  wider onboarding status. Omitted by nothing today, but optional so a future caller
   *  that has no wizard to feed is not forced to wire a no-op. */
  onInvitedStudent?: (student: InvitedStudent | null) => void
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
    }).then(async (response) => {
      if (!response.ok) return
      // Read BEFORE `session.reload()`: task 9b §2 puts the invited student on this same
      // response rather than a second read, and the caller needs it reported before the
      // reload's own re-render goes looking for it.
      const body = (await response.json().catch(() => ({}))) as {
        invited_student_id?: string | null
        invited_student_name?: string | null
      }
      onInvitedStudent?.(
        body.invited_student_id
          ? { id: body.invited_student_id, name: body.invited_student_name ?? null }
          : null,
      )
      session.reload()
    })

  // The link's token is redeemed on arrival, once — a parent who followed the link has
  // already said yes.
  //
  // **Not gated on `!session.access.parent` any more (task 9b).** That condition was
  // right for the ONLY audience this door originally served — a manager-invited
  // stranger, who by definition starts with no parent access anywhere — but the trial
  // follow-up email reuses this exact link for a family who may already be a guardian
  // of some OTHER child (or of this one already, via the OAuth callback's own
  // `invitation_token`), and for them `access.parent` is already `true` before this
  // visit even begins. Gating on it meant the redeem call this whole feature depends on
  // never fired for that family at all -- not refused, simply never attempted, which is
  // a silent bounce dressed up as nothing having gone wrong. A failed redeem still
  // leaves the pre-filled field on screen, which is the manual path with the typing
  // already done; a token already accepted on a prior visit fails harmlessly the same
  // way.
  const arrivedWithInvite = code !== ''
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
    // One screen now, not a refusal plus a bare `<section>` bolted under it. §6.1 step 3's
    // 'no match' branch is inside it and still one tap deep, for the reason it always was:
    // a correctly-invited parent whose email differs from the invitation by one character
    // has no way forward at all without it, and that person cannot tell their situation
    // from a genuine refusal.
    return (
      <ParentRefusalScreen
        locale={locale}
        email={session.email}
        code={code}
        onCodeChange={setCode}
        onRedeem={() => {
          void redeem(code)
        }}
        onSignOut={() => {
          clearAllJoinDrafts()
          void session.signOut()
        }}
      />
    )
  }

  return <>{children}</>
}
