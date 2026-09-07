// §5.11's persistent banner, and §6.5's iOS variant of it.
//
// > "**A persistent in-app banner** for any user with push disabled — *'התראות כבויות — לא
// > תקבל עדכונים על ביטולי שיעורים'* — non-dismissible, with a button that opens OS settings
// > directly. This converts a meaningful share of denials."
//
// **Non-dismissible is the feature.** There is no close button and no `onDismiss` prop, so
// there is nothing for a later change to wire one to. A banner a parent can dismiss is one
// they dismiss once and never see again, and §5.11 expects this to convert denials — which it
// only does if it is still there tomorrow.
//
// **Two states, not one.** A parent who was ASKED and refused sees `pushDisabled.*` and a
// button to the OS settings, because there is a permission to change. An iPhone parent in a
// Safari tab has no Push API at all (§12: "absent, not denied") — no permission exists, no
// settings screen would show one, and the only thing that would help is installing the app.
// Sending them to OS settings would be a button that leads nowhere.
import type { CSSProperties } from 'react'
import { Alert } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { PushState } from './usePushRegistration'

const bannerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  // G12 — logical, so the banner sits correctly in both directions.
  marginBlockEnd: 'var(--space-3)',
}

/**
 * §5.11 asks for "a button that opens OS settings directly", which no web API provides.
 *
 * **So the button is gone (2026-09-07), and the prop with it.** `app-settings:` is iOS-only
 * and only from an installed app; Chrome exposes nothing equivalent. What actually shipped
 * was a `<Button onClick={onOpenSettings}>` whose one caller — `UpdatesScreen` — passed no
 * handler, so it rendered on every denied parent's screen and did nothing at all when
 * pressed. That is the exact defect `tools/__tests__/inert-buttons.test.ts` exists for; the
 * guard missed it because the handler IS written here, as an optional prop, and the guard
 * reads one file at a time. A prop nobody supplies is a blind spot it cannot see.
 *
 * The banner's own sentence already tells the parent notifications are off, which is the
 * half of §5.11 that a web app can honestly keep.
 */
export function PushDisabledBanner({
  state,
  locale,
}: {
  state: PushState
  locale: Locale
}) {
  // Registered, unasked, or mid-prompt: nothing to warn about yet. `unsupported` is a browser
  // with no Push API at all — a desktop that never had one — and telling that parent their
  // notifications are "off" would be blaming them for their browser.
  //
  // `error` used to fall into this same "nothing to warn about" bucket and render `null` --
  // the 2026-09-02 findings register's §2.1: a parent who granted the OS permission but
  // whose `subscribe()` failed (no VAPID key, a stale service worker) was told nothing at
  // all, which is worse than the OS-refused case that at least shows this banner. Same
  // copy as `denied` rather than new copy of its own -- the fix is that it renders,
  // not what it looks like once it does.
  if (state !== 'denied' && state !== 'unsupported-ios-tab' && state !== 'error') return null

  const iosTab = state === 'unsupported-ios-tab'
  return (
    <div style={bannerStyle} data-testid="push-disabled-banner">
      {/* `pending` and not `danger` (G13's semantic tokens). Notifications being off is a
          gap to close rather than something that has gone wrong, and `danger` is #b3261e —
          the debt colour. A parent who has not turned push on has not done anything bad. */}
      {/* Plain text, not a `<p>`: `Alert` already wraps its children in one, and a nested
          `<p>` is invalid HTML that React reports as a hydration error. */}
      <Alert tone="pending" iconLabel={t(locale, 'comms.pushDisabled.title')}>
        {iosTab ? t(locale, 'comms.push.iosTabHasNoApi') : t(locale, 'comms.pushDisabled.body')}
      </Alert>
    </div>
  )
}
