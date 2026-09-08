// The screen somebody looks at while the app works out what to draw.
//
// **Why it exists.** Sign-in draws its mark from the bundle immediately and its button only
// once `GET /auth/providers` answers. The API runs in `sfo` and the club is in Israel, so
// that is a round trip of roughly 370ms from a wired connection and appreciably more from a
// phone — and the session restore happens first, sequentially. The owner opened the parent
// app on 4G, watched a still page with a logo on it for several seconds, and asked why it
// looked broken. It looked broken because nothing on it moved.
//
// **This makes nothing faster.** It says "working" instead of saying nothing. The actual
// fix is which region the API runs in; this is what the screen should do meanwhile, and
// should keep doing afterwards, because a slow network never stops being possible.
//
// **One component, three faces.** The apps are told apart by their ground colour and their
// mark, the same way their sign-in screens already are — a parent who has both installed
// should know which one is opening before it finishes opening. The tone is the app's own
// brand colour, not a token: this paints BEFORE anything has resolved, and a token that has
// not been applied yet resolves to nothing, which on a full-bleed background is the white
// flash being fixed.
//
// **The dots are decoration.** The meaning is the `aria-label` on the container, because an
// animation tells a screen reader nothing. `role="status"` so it is announced when it
// appears rather than only if somebody goes looking for it.
import type { ReactNode } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

import './splash.css'

export type SplashTone = 'parent' | 'staff' | 'dashboard'

export function SplashScreen({
  locale,
  tone,
  mark,
}: {
  locale: Locale
  tone: SplashTone
  /** The app's own mark — the club's logo for parents, the wordmark for the two staff
   *  apps, matching what each sign-in screen shows. Passed in rather than chosen here so
   *  this file imports no image and no app's copy. */
  mark: ReactNode
}) {
  return (
    <div
      className="studio-splash"
      data-testid="sign-in-splash"
      data-tone={tone}
      role="status"
      aria-label={t(locale, 'common.auth.loading')}
    >
      <div className="studio-splash__mark">{mark}</div>
      {/* Decorative, and marked so. The container above carries the meaning. */}
      <div className="studio-splash__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}
