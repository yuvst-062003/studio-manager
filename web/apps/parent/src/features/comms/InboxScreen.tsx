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
import { Button, Card, EmptyState, LoadFailed } from '@studio/ui'
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
  onReadChange,
}: {
  client: ParentCommsClient
  locale: Locale
  userAgent?: string
  /** Fired after anything is marked read, so the shell's tab badge can re-count. The
   *  count is the SHELL's — see App.tsx — because a badge owned by this screen would
   *  only ever appear once the parent had already read the thing it was announcing. */
  onReadChange?: () => void
}) {
  const [rows, setRows] = useState<NotificationOut[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
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
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [client, attempt])

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
      onReadChange?.()
    },
    [client, onReadChange],
  )

  const markAll = useCallback(async () => {
    await client.markAllRead().catch(() => undefined)
    const page = await client.inbox().catch(() => null)
    if (page) setRows(page.items)
    onReadChange?.()
  }, [client, onReadChange])

  const unread = rows.filter((row) => row.read_at === null).length

  if (failed) {
    // A failed inbox read must never wear the empty state — "no messages" is a claim
    // about the club's communication, not about the network.
    return (
      <LoadFailed
        locale={locale}
        onRetry={() => {
          setFailed(false)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }

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

      {/* 2b's דורש פעולה card (P5): an unread health notice pins above the feed until
          acted on. מילוי הצהרה routes home, where §6.1's gate holds the form; אחר כך
          marks it read, which is what clears the pin. */}
      {rows
        .filter((row) => row.kind.startsWith('health.') && row.read_at === null)
        .map((row) => (
          <Card key={`action-${row.id}`}>
            <div data-testid={`inbox-action-${row.id}`} style={prePromptStyle}>
              <p style={rowTitleStyle}>{row.title}</p>
              <p style={bodyStyle}>{row.body}</p>
              <div style={promptActionsStyle}>
                <Button
                  onClick={() => {
                    globalThis.location.hash = '#/'
                  }}
                >
                  {t(locale, 'comms.inbox.fillDeclaration')}
                </Button>
                <Button onClick={() => void open(row)} variant="secondary">
                  {t(locale, 'comms.inbox.later')}
                </Button>
              </div>
            </div>
          </Card>
        ))}

      {/* §5.4a ④'s "איך היה?", with the destination it never had. The worker has sent this
          on days 1, 3 and 7 since M3 carrying a booking id and a day number and nothing to
          press — the product asking a family whether they enjoyed themselves, three times,
          and offering them no way to answer.

          Keyed on `payload.route` rather than on the kind, so the pin follows what the
          message can actually DO. `trial.no_show` carries no route and is deliberately not
          given one: offering a family who did not come a join button is the same mistake as
          asking them how it was. */}
      {rows
        .filter(
          (row) =>
            row.read_at === null && typeof (row.payload as { route?: unknown })?.route === 'string',
        )
        .map((row) => (
          <Card key={`route-${row.id}`}>
            <div data-testid={`inbox-route-${row.id}`} style={prePromptStyle}>
              <p style={rowTitleStyle}>{row.title}</p>
              <p style={bodyStyle}>{row.body}</p>
              <div style={promptActionsStyle}>
                <Button
                  data-testid={`inbox-route-go-${row.id}`}
                  onClick={() => {
                    globalThis.location.hash = String((row.payload as { route: string }).route)
                  }}
                >
                  {t(locale, 'comms.inbox.joinClub')}
                </Button>
                <Button onClick={() => void open(row)} variant="secondary">
                  {t(locale, 'comms.inbox.later')}
                </Button>
              </div>
            </div>
          </Card>
        ))}

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
