// §6.1's parent-app first launch, steps 3 and 4:
//
//   3  resolve        invitation token → attach identity to the pre-created Person
//                     verified email/phone hit → attach to the matched Person
//                     no match → "לא מצאנו אותך"
//                                [ יש לי קוד הזמנה ] [ הרשמה לסטודיו ]
//   4  studio picker  only shown if she belongs to more than one studio
//
// Steps 5 and 6 — the BLOCKING consent and health gates — are M4's, and this file
// deliberately does NOT pre-build a seam for them. §1.3's seam-4 table names five
// composites and this is not one of them, so inventing a sixth SlotId here would be
// speculative design in a file (`slots.ts`) the plan says is authored once. M4 decides
// its own shape; what M1 owes it is a container with an obvious place to land.
import { useState } from 'react'
import { RefusalScreen, StudioSwitcher } from '@studio/ui'
import type { Session } from '@studio/core'
import { apiFetch } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

/** Where the staff app lives, so §6.1's second refusal is a link rather than a dead end. */
const STAFF_APP_URL = '/staff'

export function Resolve({ session, locale }: { session: Session; locale: Locale }) {
  const [code, setCode] = useState('')

  // §3.1 — the parent app asks 'do you have any guardian rows?', which is what
  // `access.parent` reports. A role check here would let a manager with no children in.
  if (!session.access.parent) {
    return (
      <>
        <RefusalScreen
          which="parent"
          otherAppUrl={STAFF_APP_URL}
          onSignOut={() => void session.signOut()}
          locale={locale}
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
              void apiFetch('/api/v1/auth/accept-invitation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: code }),
              }).then(() => session.reload())
            }}
          >
            {t(locale, 'common.auth.haveInviteCode')}
          </button>
        </section>
      </>
    )
  }

  // §6.1 step 4 — 'only shown if she belongs to more than one studio'. StudioSwitcher
  // renders nothing below two, so the picker disappears on its own for the common case.
  if (session.studios.length > 1 && session.activeStudioId === null) {
    return (
      <section data-testid="studio-picker" aria-label={t(locale, 'common.studioPicker.title')}>
        <h2>{t(locale, 'common.studioPicker.title')}</h2>
        <StudioSwitcher
          studios={session.studios.map((s) => ({
            studioId: s.studio_id,
            studioName: s.studio_name,
            studioIsDemo: s.studio_is_demo,
          }))}
          activeStudioId={session.activeStudioId}
          onSwitch={(studioId) => {
            void apiFetch('/api/v1/auth/switch-studio', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ studio_id: studioId }),
            }).then(() => session.reload())
          }}
          locale={locale}
        />
      </section>
    )
  }

  return (
    // §6.1's home. Steps 5 and 6 — terms and privacy, then a health declaration per
    // child whose health_status is `missing` — are M4's blocking gates and land in front
    // of this. M5 enriches the home itself with the day strip (artboard 2a).
    <section data-testid="parent-home" />
  )
}
