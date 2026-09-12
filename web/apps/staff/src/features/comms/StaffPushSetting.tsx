// The switch that turns a coach's phone on — and until 2026-09-13 the staff app had none.
//
// `useStaffPushRegistration` was written, tested and exported, and no screen imported it. So
// every coach's `notification_delivery` row read `no_token`: not "denied", not "failed" —
// never asked. The eight switches below this component let a coach mute notifications they
// had no way to turn on in the first place, which is why this sits ABOVE them rather than
// beside them: those switches are answers to a question this component asks.
//
// **No iOS-in-a-tab branch, unlike the parent app's `PushSetting`.** §6.5 and §10.6: the
// staff app renders `InstallWalkthrough` INSTEAD of itself until `displayMode !== 'browser'`,
// so by the time this is on screen the app is already on a home screen and the Push API
// exists. `useStaffPushRegistration`'s own header carries the same note.
//
// **The pre-prompt is not decoration.** On iOS a denial is permanent and cannot be
// re-requested in-app — a coach who taps "no" on the OS dialog stops receiving §5.14's
// at-risk alerts for the rest of the season. There is one chance, and it is spent only after
// the coach has been told what it buys them.
//
// **`Alert` draws its children inside a `<p>`**, so the buttons sit outside it rather than
// within: a `<div>` or a second `<p>` nested in a paragraph is invalid markup that React
// renders anyway and the browser silently re-parents, which moves the control out of the
// banner it was meant to belong to.
import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { StaffCommsClient } from './staffCommsClient'
import { reconcileStaffPushRegistration, useStaffPushRegistration } from './useStaffPushRegistration'

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
}

const rowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 'var(--space-2)',
  justifyContent: 'space-between',
  minBlockSize: '44px',
}

const answerRowStyle: CSSProperties = { display: 'flex', gap: 'var(--space-2)' }
const labelStyle: CSSProperties = { color: 'var(--fg)', fontWeight: 'var(--weight-medium)' }
const onStyle: CSSProperties = { color: 'var(--emphasis)', fontSize: 'var(--text-caption)' }

export function StaffPushSetting({
  client,
  locale,
  userAgent,
}: {
  client: StaffCommsClient
  locale: Locale
  /** Injected by tests; the account screen mounts this with the app's own user agent. */
  userAgent?: string
}) {
  const push = useStaffPushRegistration(client, userAgent === undefined ? {} : { userAgent })

  // A coach's subscription rotates exactly like a parent's, and the staff app has the same
  // blind spot: `initial` reads the PERMISSION, so a device whose push endpoint the browser
  // replaced still reports itself as on. See `reconcileStaffPushRegistration`.
  useEffect(() => {
    void reconcileStaffPushRegistration(client, push.platform)
  }, [client, push.platform])

  return (
    <section style={sectionStyle} data-testid="staff-push-setting">
      <div style={rowStyle}>
        <span style={labelStyle}>{t(locale, 'comms.push.settingTitle')}</span>
        {push.state === 'registered' ? (
          <span data-testid="staff-push-on" style={onStyle}>
            {t(locale, 'comms.pushEnabled.confirmation')}
          </span>
        ) : null}
      </div>

      {push.state === 'unasked' ? (
        <Button variant="primary" data-testid="staff-push-offer" onClick={push.offer}>
          {t(locale, 'comms.push.enable')}
        </Button>
      ) : null}

      {push.state === 'pre-prompt' ? (
        <>
          {/* `pending` and not `danger`: a coach who has not turned push on has not done
              anything wrong. `live` stays off per `Alert`'s own docstring — this appears
              because the coach just tapped, but it is a question, not an interruption. */}
          <Alert tone="pending" iconLabel={t(locale, 'comms.push.prePrompt.title')}>
            {t(locale, 'comms.push.prePrompt.body')}
          </Alert>
          <div style={answerRowStyle}>
            <Button variant="primary" data-testid="staff-push-accept" onClick={() => void push.ask()}>
              {t(locale, 'comms.push.prePrompt.accept')}
            </Button>
            <Button variant="ghost" data-testid="staff-push-decline" onClick={push.decline}>
              {t(locale, 'comms.push.prePrompt.decline')}
            </Button>
          </div>
        </>
      ) : null}

      {push.state === 'denied' || push.state === 'error' ? (
        // §5.11's persistent banner. Not dismissible, and it names the CONSEQUENCE rather
        // than the setting — a coach who reads "notifications are off" and shrugs is a coach
        // who does not know they will miss a cancellation.
        <div data-testid="staff-push-disabled">
          <Alert tone="pending" iconLabel={t(locale, 'comms.pushDisabled.title')}>
            {t(locale, 'comms.pushDisabled.body')}
          </Alert>
        </div>
      ) : null}
    </section>
  )
}
