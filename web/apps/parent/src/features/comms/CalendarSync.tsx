// §5.12's three buttons, and the two sentences that keep them honest.
//
// > "The app offers three buttons: 'הוסף ליומן Google' (deep-link to Google's subscribe
// > dialog), 'הוסף ליומן Apple' (a `webcal://` URL, which opens the native subscribe sheet on
// > iOS and macOS), and 'העתק קישור'."
//
// **`calendar.refreshDelay` is on the screen, not in a doc.** §5.12: "Google refreshes
// subscribed calendars slowly (up to ~24h). The feed is for 'where do I need to be next
// Tuesday', never for 'tonight is cancelled'." A parent who does not know that will treat an
// empty calendar slot as proof a lesson is on, and §5.11's push is what actually carries the
// cancellation.
//
// **Rotation warns first.** §5.12: "rotating invalidates the old URL immediately." A parent
// who presses it to tidy up and silently loses their family calendar has been failed by the
// button rather than by the API — `calendar.rotateWarning` says what will happen before it
// happens.
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, LoadFailed } from '@studio/ui'
import { formatDateInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { CalendarFeedOut, ParentCommsClient } from './commsClient'
import { googleSubscribeUrl, webcalUrl } from './commsClient'

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

const titleStyle: CSSProperties = {
  color: 'var(--fg)',
  fontSize: 'var(--text-title)',
  fontWeight: 'var(--weight-medium)',
  margin: 0,
}

const hintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
}

const linkStyle: CSSProperties = {
  alignItems: 'center',
  color: 'var(--fg)',
  display: 'inline-flex',
  // §6.2's 44px — the smallest target iOS treats as reliably hittable, and this is a phone.
  minBlockSize: '44px',
  paddingBlock: 'var(--space-2)',
  paddingInline: 'var(--space-3)',
  textDecoration: 'none',
  borderRadius: 'var(--radius-md)',
  border: 'var(--border-width-hairline) solid var(--border)',
}

export function CalendarSync({
  client,
  locale,
  subjectType = 'guardian',
  onCopy,
}: {
  client: ParentCommsClient
  locale: Locale
  /** A coach's panel says something different about what is in the feed. §5.12's two feeds
   *  carry different things, and the subtitle is where a parent learns which one this is. */
  subjectType?: 'guardian' | 'coach'
  /** Injected so a test can assert the copy without a clipboard permission. */
  onCopy?: (text: string) => void
}) {
  const [feed, setFeed] = useState<CalendarFeedOut | null>(null)
  const [readFailed, setReadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [copied, setCopied] = useState(false)
  const [confirmingRotate, setConfirmingRotate] = useState(false)
  const [rotated, setRotated] = useState(false)

  useEffect(() => {
    let live = true
    client
      .calendarFeeds()
      .then((page) => {
        if (!live) return
        setReadFailed(false)
        setFeed(page.feeds.find((row) => row.subject_type === subjectType) ?? null)
      })
      // P8 — a swallowed failure here rendered the CREATE-a-feed state, inviting a parent
      // to rotate a feed that exists and break their calendar. Failure says so instead.
      .catch(() => live && setReadFailed(true))
    return () => {
      live = false
    }
  }, [client, subjectType, attempt])

  const copy = useCallback(() => {
    if (!feed) return
    if (onCopy) onCopy(feed.url)
    else void globalThis.navigator?.clipboard?.writeText(feed.url)
    setCopied(true)
  }, [feed, onCopy])

  const rotate = useCallback(async () => {
    if (!feed) return
    const next = await client.rotateFeed(feed.id).catch(() => null)
    if (!next) return
    setFeed(next)
    setConfirmingRotate(false)
    setRotated(true)
    setCopied(false)
  }, [client, feed])

  if (readFailed) {
    return (
      <section style={sectionStyle} aria-labelledby="calendar-title" data-testid="calendar-sync">
        <h2 id="calendar-title" style={titleStyle}>
          {t(locale, 'comms.calendar.title')}
        </h2>
        <LoadFailed
          locale={locale}
          onRetry={() => {
            setReadFailed(false)
            setAttempt((n) => n + 1)
          }}
        />
      </section>
    )
  }
  if (!feed) return null

  return (
    <section style={sectionStyle} aria-labelledby="calendar-title" data-testid="calendar-sync">
      <h2 id="calendar-title" style={titleStyle}>
        {t(locale, 'comms.calendar.title')}
      </h2>
      <p style={hintStyle}>
        {t(
          locale,
          subjectType === 'coach' ? 'comms.calendar.coachSubtitle' : 'comms.calendar.subtitle',
        )}
      </p>

      <div style={actionsStyle}>
        {/* Google's subscribe dialog takes the https:// form. */}
        <a href={googleSubscribeUrl(feed.url)} rel="noreferrer" style={linkStyle} target="_blank">
          {t(locale, 'comms.calendar.addGoogle')}
        </a>
        {/* Apple's is `webcal://`, and the scheme is the whole point: the https:// form
            downloads a one-off snapshot that never updates again, which looks like it worked.
            §12 — there is no third-party calendar WRITE API on Apple at all, so subscription
            is not one option among several. */}
        <a href={webcalUrl(feed.url)} style={linkStyle}>
          {t(locale, 'comms.calendar.addApple')}
        </a>
        <Button variant="secondary" onClick={copy}>
          {t(locale, 'comms.calendar.copyLink')}
        </Button>
      </div>

      {copied ? <p style={hintStyle}>{t(locale, 'comms.calendar.linkCopied')}</p> : null}

      <p style={hintStyle}>{t(locale, 'comms.calendar.refreshDelay')}</p>

      <Card>
        <div style={sectionStyle}>
          {rotated ? (
            <p style={hintStyle} data-testid="calendar-rotated">
              {t(locale, 'comms.calendar.rotated')}
            </p>
          ) : null}
          {feed.rotated_at ? (
            <p style={hintStyle}>
              {t(locale, 'comms.calendar.lastRotated')}{' '}
              {formatDateInStudioZone(feed.rotated_at, locale)}
            </p>
          ) : null}
          {confirmingRotate ? (
            <>
              <p style={hintStyle} data-testid="rotate-warning">
                {t(locale, 'comms.calendar.rotateWarning')}
              </p>
              <div style={actionsStyle}>
                <Button onClick={() => void rotate()}>{t(locale, 'comms.calendar.rotate')}</Button>
                <Button variant="secondary" onClick={() => setConfirmingRotate(false)}>
                  {t(locale, 'comms.calendar.rotateKeep')}
                </Button>
              </div>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setConfirmingRotate(true)}>
              {t(locale, 'comms.calendar.rotate')}
            </Button>
          )}
        </div>
      </Card>
    </section>
  )
}
