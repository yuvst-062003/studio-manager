// §6.1 'Wrong app' — 'A person who signs in to an app they have no business in is told
// which app is theirs and given a direct link, not a dead end. Both screens offer
// sign-out. Neither leaks whether the account exists in the other app.'
//
// That last sentence is why this component takes no counts, no names and no studio list.
// It renders one refusal, one link and one sign-out button, and there is nothing here for
// a count to be threaded into later — a refusal saying "you have 2 children, use the
// parent app" would be an account-enumeration oracle for anyone holding a stolen phone.
//
// `email` (2026-09-03) is a deliberate, narrow exception to that rule, not a crack in it:
// it is the caller's OWN address, echoed back to them the way Google's own account chooser
// does — self-identification, never enumeration, because it says nothing about the club,
// only about which of the visitor's own accounts they are looking at it with. The common
// failure this closes: someone signed into the wrong Google account entirely, staring at a
// refusal with no way to tell that is the problem short of guessing and signing out blind.
import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { EmptyState } from '../primitives/EmptyState'

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-3)',
  alignItems: 'center',
  flexWrap: 'wrap',
  marginBlockStart: 'var(--space-4)',
}

const accountStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-label)',
  marginBlockStart: 'var(--space-2)',
}

export function RefusalScreen({
  which,
  otherAppUrl,
  onSignOut,
  locale,
  email,
}: {
  /** Which app is refusing. `staff` renders §6.1's first screen, `parent` its second.
   *  `dashboard` is the third, added 2026-08-29: a person with a record in the club but
   *  no role at all reached a dashboard whose every panel answered 403. */
  which: 'staff' | 'parent' | 'dashboard'
  otherAppUrl: string
  onSignOut: () => void
  locale: Locale
  /** The signed-in Google/Apple account's own address, from `Session.email`. Optional
   *  and omitted entirely when absent — a caller mid-refresh with no answer yet must
   *  not render "signed in as null". */
  email?: string | null
}) {
  return (
    <section data-testid={`${which}-refusal`}>
      <EmptyState
        title={t(locale, `common.refusal.${which}.title`)}
        description={t(locale, `common.refusal.${which}.body`)}
      />
      {email ? (
        // `<bdi>` isolates the address's own (LTR) direction from the RTL document, the
        // same idiom `AccountDrawerFooter`'s `accountName` uses — without it an address
        // reads with its characters reordered inside Hebrew or Russian copy.
        <p data-testid="refusal-account" style={accountStyle}>
          <bdi>{t(locale, 'common.refusal.signedInAs').replace('{email}', email)}</bdi>
        </p>
      ) : null}
      <div style={actionsStyle}>
        {/* §6.1 — 'given a direct link, not a dead end.' */}
        <a href={otherAppUrl}>{t(locale, `common.refusal.${which}.otherApp`)}</a>
        {/* §6.1 — 'Both screens offer sign-out.' Without it the only way out is clearing
            site data, which a parent on a phone will not find. */}
        <button type="button" onClick={onSignOut}>
          {t(locale, 'common.nav.signOut')}
        </button>
      </div>
    </section>
  )
}
