// §6.1 'Wrong app' — 'A person who signs in to an app they have no business in is told
// which app is theirs and given a direct link, not a dead end. Both screens offer
// sign-out. Neither leaks whether the account exists in the other app.'
//
// That last sentence is why this component takes no counts, no names and no studio list.
// It renders one refusal, one link and one sign-out button, and there is nothing here for
// a count to be threaded into later — a refusal saying "you have 2 children, use the
// parent app" would be an account-enumeration oracle for anyone holding a stolen phone.
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

export function RefusalScreen({
  which,
  otherAppUrl,
  onSignOut,
  locale,
}: {
  /** Which app is refusing. `staff` renders §6.1's first screen, `parent` its second.
   *  `dashboard` is the third, added 2026-08-29: a person with a record in the club but
   *  no role at all reached a dashboard whose every panel answered 403. */
  which: 'staff' | 'parent' | 'dashboard'
  otherAppUrl: string
  onSignOut: () => void
  locale: Locale
}) {
  return (
    <section data-testid={`${which}-refusal`}>
      <EmptyState
        title={t(locale, `common.refusal.${which}.title`)}
        description={t(locale, `common.refusal.${which}.body`)}
      />
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
