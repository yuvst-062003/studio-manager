// §5.12's coach feed — `calendar_feed.subject_type = 'coach'`, one of this lane's screenless
// staff deliverables (conflict **C2**: M8's staff-surface work is real and has no artboard).
//
// > "Feeds exist per guardian (all their students' sessions and events) and per coach (all
// > sessions they staff)."
//
// **A separate panel from the parent's, because the two feeds carry different things.** A
// coach subscribing here gets the sessions they teach; a parent gets their children's lessons
// and events. Somebody who is both has two subscriptions and neither contains the other —
// `uq_calendar_feed_person_id_subject_type` makes that structural, and `calendar.coachSubtitle`
// is how the person holding the phone knows which one they are looking at.
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { CalendarFeedOut, StaffCommsClient } from './staffCommsClient'
import { googleSubscribeUrl, webcalUrl } from './staffCommsClient'

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
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
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-2)',
  color: 'var(--fg)',
  display: 'inline-flex',
  minBlockSize: '44px',
  paddingBlock: 'var(--space-2)',
  paddingInline: 'var(--space-3)',
  textDecoration: 'none',
}

export function CoachCalendarFeed({
  client,
  locale,
  onCopy,
}: {
  client: StaffCommsClient
  locale: Locale
  onCopy?: (text: string) => void
}) {
  const [feed, setFeed] = useState<CalendarFeedOut | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let live = true
    client
      .calendarFeeds()
      .then((page) => {
        if (!live) return
        setFeed(page.feeds.find((row) => row.subject_type === 'coach') ?? null)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client])

  const copy = useCallback(() => {
    if (!feed) return
    if (onCopy) onCopy(feed.url)
    else void globalThis.navigator?.clipboard?.writeText(feed.url)
    setCopied(true)
  }, [feed, onCopy])

  // Nothing at all for somebody who staffs no sessions. A subscription to an empty calendar
  // is a control that does nothing, and the API does not issue a coach feed to a person with
  // no `group_staff` and no `session_staff` row.
  if (!feed) return null

  return (
    <section style={sectionStyle} aria-labelledby="coach-feed-title" data-testid="coach-feed">
      <h2 id="coach-feed-title" style={titleStyle}>
        {t(locale, 'comms.calendar.title')}
      </h2>
      <p style={hintStyle}>{t(locale, 'comms.calendar.coachSubtitle')}</p>
      <div style={actionsStyle}>
        <a href={googleSubscribeUrl(feed.url)} rel="noreferrer" style={linkStyle} target="_blank">
          {t(locale, 'comms.calendar.addGoogle')}
        </a>
        <a href={webcalUrl(feed.url)} style={linkStyle}>
          {t(locale, 'comms.calendar.addApple')}
        </a>
        <Button variant="secondary" onClick={copy}>
          {t(locale, 'comms.calendar.copyLink')}
        </Button>
      </div>
      {copied ? <p style={hintStyle}>{t(locale, 'comms.calendar.linkCopied')}</p> : null}
      <p style={hintStyle}>{t(locale, 'comms.calendar.refreshDelay')}</p>
    </section>
  )
}
