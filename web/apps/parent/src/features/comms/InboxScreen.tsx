// Parent artboard `2b` — עדכוני מועדון, under **D9.1**.
//
// > "`2b` ships under D9.1: the `עדכוני מועדון` inbox is kept, `שיחה עם המשרד` is cut. §2.3
// > lists in-app two-way chat as explicitly out of scope."
//
// **The cut is structural here, not a note.** There is no compose box, no reply control and
// no sender on a row — §5.11 permits exactly two levels, a push notification and a ONE-WAY
// inbox, and a conversation thread with the office is a third thing. The canvas showed it;
// the decision wins. If reaching the office is a genuine gap, that is a spec change to argue
// on its merits, not something to absorb through a mockup.
//
// **The banner sits above the list rather than inside a settings screen.** §5.11 wants it
// where the messages are, because the parent looking at an empty inbox is exactly the one who
// needs to know their doorbell is switched off.
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, EmptyState } from '@studio/ui'
import { formatDateInStudioZone, formatTimeInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { PushDisabledBanner } from './PushDisabledBanner'
import type { NotificationOut, ParentCommsClient } from './commsClient'
import { usePushRegistration } from './usePushRegistration'

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
}

const titleStyle: CSSProperties = {
  color: 'var(--fg)',
  fontSize: 'var(--text-title)',
  fontWeight: 'var(--weight-medium)',
  margin: 0,
}

const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  // G12 — logical throughout. This is the one place a physical property would be invisible
  // in Hebrew and wrong in English.
  textAlign: 'start',
  inlineSize: '100%',
}

const rowTitleStyle: CSSProperties = {
  color: 'var(--fg)',
  fontWeight: 'var(--weight-medium)',
  margin: 0,
}

const bodyStyle: CSSProperties = { color: 'var(--fg)', margin: 0 }

const metaStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const unreadDotStyle: CSSProperties = {
  blockSize: '0.5rem',
  inlineSize: '0.5rem',
  borderRadius: '50%',
  background: 'var(--focus-ring)',
  // Never the only signal: `inbox.new` carries the same fact in words, because a dot is
  // invisible to a screen reader and to anyone who cannot distinguish it from decoration.
  flexShrink: 0,
}

const prePromptStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
}

const promptActionsStyle: CSSProperties = { display: 'flex', gap: 'var(--space-2)' }

export function InboxScreen({
  client,
  locale,
  userAgent,
}: {
  client: ParentCommsClient
  locale: Locale
  userAgent?: string
}) {
  const [rows, setRows] = useState<NotificationOut[]>([])
  const [loaded, setLoaded] = useState(false)
  const push = usePushRegistration(client, userAgent === undefined ? {} : { userAgent })

  useEffect(() => {
    let live = true
    client
      .inbox()
      .then((page) => {
        if (!live) return
        setRows(page.items)
        setLoaded(true)
      })
      .catch(() => live && setLoaded(true))
    return () => {
      live = false
    }
  }, [client])

  const open = useCallback(
    async (row: NotificationOut) => {
      if (row.read_at !== null) return
      // Optimistic: the row is already on screen and the server call is idempotent, so a
      // failed request leaves a read row that reverts on the next load rather than a tap
      // that appears to do nothing.
      setRows((current) =>
        current.map((item) =>
          item.id === row.id ? { ...item, read_at: new Date().toISOString() } : item,
        ),
      )
      await client.markRead(row.id).catch(() => undefined)
    },
    [client],
  )

  const markAll = useCallback(async () => {
    await client.markAllRead().catch(() => undefined)
    const page = await client.inbox().catch(() => null)
    if (page) setRows(page.items)
  }, [client])

  const unread = rows.filter((row) => row.read_at === null).length

  return (
    <section style={pageStyle} aria-labelledby="inbox-title" data-testid="parent-inbox">
      <PushDisabledBanner state={push.state} locale={locale} />

      {/* §5.11/§6.5's value pre-prompt. Rendered only where there is something to ask for —
          on iOS in a tab the banner above teaches the install instead, because the Push API
          is absent and this button would do nothing. */}
      {push.state === 'unasked' ? (
        <Button variant="secondary" onClick={push.offer}>
          {t(locale, 'comms.push.enable')}
        </Button>
      ) : null}
      {push.state === 'pre-prompt' ? (
        <Card>
          <div style={prePromptStyle} data-testid="push-pre-prompt">
            <p style={rowTitleStyle}>{t(locale, 'comms.push.prePrompt.title')}</p>
            <p style={bodyStyle}>{t(locale, 'comms.push.prePrompt.body')}</p>
            <div style={promptActionsStyle}>
              <Button onClick={push.ask}>{t(locale, 'comms.push.prePrompt.accept')}</Button>
              <Button variant="secondary" onClick={push.decline}>
                {t(locale, 'comms.push.prePrompt.decline')}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <header style={headerStyle}>
        <h1 id="inbox-title" style={titleStyle}>
          {t(locale, 'comms.inbox.title')}
        </h1>
        {unread > 0 ? (
          <Button variant="secondary" onClick={markAll}>
            {t(locale, 'comms.inbox.markAllRead')}
          </Button>
        ) : null}
      </header>

      {loaded && rows.length === 0 ? (
        <EmptyState
          title={t(locale, 'comms.inbox.empty')}
          description={t(locale, 'comms.inbox.emptyHint')}
        />
      ) : null}

      {rows.map((row) => (
        <Card key={row.id}>
          {/* A button and not a div: the row is interactive, so it has to be reachable by
              keyboard and announced as a control. Its accessible name is the title. */}
          <button
            type="button"
            onClick={() => void open(row)}
            style={{ ...rowStyle, background: 'none', border: 'none', padding: 0 }}
            data-testid={`inbox-row-${row.id}`}
          >
            <p style={rowTitleStyle}>
              {row.read_at === null ? <span aria-hidden="true" style={unreadDotStyle} /> : null}
              {row.title}
            </p>
            <p style={bodyStyle}>{row.body}</p>
            <p style={metaStyle}>
              {/* G3 — stored UTC, rendered Asia/Jerusalem REGARDLESS of locale. Both
                  helpers pin the zone; a bare toLocaleString would follow the phone's
                  own timezone and put a Sunday cancellation on Saturday for a parent
                  travelling. */}
              {formatDateInStudioZone(row.created_at, locale)}{' '}
              {formatTimeInStudioZone(row.created_at, locale)}
              {row.read_at === null ? ` · ${t(locale, 'comms.inbox.new')}` : ''}
            </p>
          </button>
        </Card>
      ))}
    </section>
  )
}
