// Parent artboard `2b` — עדכוני מועדון, under **D9.1**, rearranged by screen 7 of the
// Stitch redesign.
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
// **The organising axis is outstanding vs done, not read vs unread.** The screen this
// replaced arranged everything around `read_at`, which is wrong in both directions: a parent
// who signed a declaration from §6.1's gate never opened the notice, so the inbox went on
// demanding it; a parent who opened it and pressed `אחר כך` cleared the demand while the
// obligation stood. `app/services/comms/actions.py` resolves the real answer against the
// records that settle it, and `read_at` survives only as the `חדש` mark on notices that ask
// for nothing.
//
// **What is waiting is a queue, not a wall.** One card at a time, oldest first, with the
// rest swipeable behind it and a count above — the owner's decision on 2026-09-01, chosen
// over the four-cards-at-once arrangement because a family usually has none or one and the
// screen should not spend four card-heights saying so. A settled item leaves the queue and
// rejoins the feed marked `טופל`; nothing is printed twice, which is what produced ten cards
// from eight notices before.
//
// **The banner sits above the list rather than inside a settings screen.** §5.11 wants it
// where the messages are, because the parent looking at an empty inbox is exactly the one who
// needs to know their doorbell is switched off.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, EmptyState, LoadFailed } from '@studio/ui'
import { formatDateInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { PushDisabledBanner } from './PushDisabledBanner'
import type { NotificationOut, ParentCommsClient } from './commsClient'
import { usePushRegistration } from './usePushRegistration'

/**
 * What each action opens, and what its button says.
 *
 * The server sends the FACT (`action.kind`) and never the words or the route: §5.11's
 * trigger list grows every milestone, and a server that shipped Hebrew button text would
 * need a deploy to fix a typo. A kind this map does not know renders as a plain row rather
 * than as a button that goes nowhere — the safe direction for a kind added by a later lane.
 */
const ACTIONS: Record<string, { labelKey: string; route: string }> = {
  // Both health actions route home, where §6.1's gate holds the form. There is no
  // `#/health` to send anyone to, and inventing one would be a route with no screen.
  health_declaration: { labelKey: 'comms.inbox.fillDeclaration', route: '#/' },
  health_renewal: { labelKey: 'comms.inbox.action.healthRenewal', route: '#/' },
  payment: { labelKey: 'comms.inbox.action.payment', route: '#/payments' },
  event_rsvp: { labelKey: 'comms.inbox.action.eventRsvp', route: '#/events' },
  trial_join: { labelKey: 'comms.inbox.joinClub', route: '#/join' },
}

/** How long a settled item keeps saying so above the queue. */
const CONFIRMATION_WINDOW_MS = 24 * 60 * 60 * 1000

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
}

const eyebrowStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-label)',
  fontWeight: 'var(--weight-bold)',
  letterSpacing: '0.02em',
  margin: 0,
}

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
}

const waitingMarkStyle: CSSProperties = {
  alignItems: 'center',
  color: 'var(--pending)',
  display: 'inline-flex',
  fontSize: 'var(--text-micro)',
  fontWeight: 'var(--weight-bold)',
  gap: 'var(--space-1)',
  letterSpacing: '0.02em',
}

const countBadgeStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--pending)',
  blockSize: '20px',
  borderRadius: 'var(--radius-pill)',
  color: 'var(--on-fg)',
  display: 'inline-flex',
  fontSize: 'var(--text-micro)',
  fontWeight: 'var(--weight-bold)',
  justifyContent: 'center',
  lineHeight: 1,
  minInlineSize: '20px',
  paddingInline: '6px',
}

// `scroll-snap` and not a carousel dependency: G-"no new UI dependency without asking",
// and the native one already handles momentum, RTL and a trackpad.
const trackStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-3)',
  overflowX: 'auto',
  scrollSnapType: 'x mandatory',
  scrollbarWidth: 'none',
  // The next card peeks, or nobody discovers there is one.
  paddingInlineEnd: '22px',
}

const waitingCardStyle: CSSProperties = {
  background: 'var(--surface)',
  border: 'var(--border-width-strong) solid var(--pending)',
  borderRadius: 'var(--radius-xl)',
  display: 'flex',
  flex: 'none',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  inlineSize: 'calc(100% - 22px)',
  paddingBlock: '16px',
  paddingInline: 'var(--space-5)',
  scrollSnapAlign: 'start',
}

const waitingTitleStyle: CSSProperties = {
  color: 'var(--fg)',
  fontSize: 'var(--text-display)',
  fontWeight: 'var(--weight-bold)',
  lineHeight: 'var(--leading-snug)',
  margin: 0,
}

const settledMarkStyle: CSSProperties = {
  alignItems: 'center',
  color: 'var(--paid)',
  display: 'inline-flex',
  fontSize: 'var(--text-micro)',
  fontWeight: 'var(--weight-bold)',
  gap: 'var(--space-1)',
  letterSpacing: '0.02em',
}

const newMarkStyle: CSSProperties = {
  alignItems: 'center',
  color: 'var(--emphasis)',
  display: 'inline-flex',
  fontSize: 'var(--text-micro)',
  fontWeight: 'var(--weight-bold)',
  gap: 'var(--space-1)',
  letterSpacing: '0.02em',
}

const newDotStyle: CSSProperties = {
  background: 'var(--emphasis)',
  blockSize: '7px',
  borderRadius: 'var(--radius-circle)',
  flexShrink: 0,
  inlineSize: '7px',
}

const rowStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  inlineSize: '100%',
  padding: 0,
  // G12 — logical throughout. This is the one place a physical property would be invisible
  // in Hebrew and wrong in English.
  textAlign: 'start',
}

const rowTitleStyle: CSSProperties = {
  color: 'var(--fg)',
  fontWeight: 'var(--weight-medium)',
  margin: 0,
}

const bodyStyle: CSSProperties = { color: 'var(--text-secondary)', margin: 0 }

const metaStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const prePromptStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
}

const promptActionsStyle: CSSProperties = { display: 'flex', gap: 'var(--space-2)' }

const feedRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  paddingBlock: 'var(--space-3)',
}

const feedRowDividedStyle: CSSProperties = {
  borderBlockStart: 'var(--border-width-hairline) solid var(--border)',
}

const dotsRowStyle: CSSProperties = {
  alignItems: 'center',
  borderBlockStart: 'var(--border-width-hairline) solid var(--border)',
  display: 'flex',
  gap: 'var(--space-2)',
  paddingBlockStart: 'var(--space-3)',
}

function WaitingIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function SettledIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

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
  const [position, setPosition] = useState(0)
  // Read once, when the screen opens. A live clock inside the memo would be an impure
  // render, and a window measured in hours has no use for one.
  const [openedAt] = useState(() => Date.now())
  const trackRef = useRef<HTMLDivElement>(null)
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

  /** Oldest first — the thing that has waited longest is the one you meet. */
  const waiting = useMemo(
    () =>
      rows
        .filter((row) => row.action?.outstanding === true && ACTIONS[row.action.kind] !== undefined)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [rows],
  )

  /** Everything the club is NOT waiting on, newest first — which is the order the API
   *  already returns. An outstanding notice appears in the queue and NOWHERE else: printing
   *  it in both is what produced ten cards from eight notices. */
  const feed = useMemo(
    () => rows.filter((row) => !waiting.some((pinned) => pinned.id === row.id)),
    [rows, waiting],
  )

  /** The one thing settled recently enough to say so.
   *
   *  The feed is in date order, so a twelve-day-old notice settled this morning rejoins it
   *  twelve days down where nobody would see it happen. The confirmation therefore lives
   *  where the action did. Only kinds whose record carries a real timestamp qualify — a
   *  payment has none, and inventing one would put a fabricated date on the screen. */
  const justSettled = useMemo(() => {
    return (
      rows.find((row) => {
        const at = row.action?.settled_at
        if (row.action?.outstanding !== false || !at) return false
        const settled = Date.parse(at)
        return Number.isFinite(settled) && openedAt - settled < CONFIRMATION_WINDOW_MS
      }) ?? null
    )
  }, [rows, openedAt])

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

  const act = useCallback(
    (row: NotificationOut) => {
      const action = row.action ? ACTIONS[row.action.kind] : undefined
      if (!action) return
      // A trial follow-up carries its own destination; `app/workers/followups.py` sets it
      // and `trial.no_show` deliberately carries none.
      const carried = (row.payload as { route?: unknown })?.route
      void open(row)
      globalThis.location.hash = typeof carried === 'string' ? carried : action.route
    },
    [open],
  )

  const onTrackScroll = useCallback(() => {
    const track = trackRef.current
    const first = track?.firstElementChild as HTMLElement | null
    if (!track || !first) return
    // `scrollLeft` runs negative in RTL, so the distance is what counts.
    const step = first.offsetWidth + 12
    const at = Math.round(Math.abs(track.scrollLeft) / step)
    setPosition(Math.min(Math.max(at, 0), Math.max(waiting.length - 1, 0)))
  }, [waiting.length])

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

      {/* The screen's own heading stays small: the queue's card carries the weight, and a
          24px title above a 24px card title would have them competing. It is still the h1 —
          a screen with no heading is a screen a screen-reader user cannot place. */}
      <h1 id="inbox-title" style={eyebrowStyle}>
        {t(locale, 'comms.inbox.title')}
      </h1>

      {waiting.length > 0 ? (
        <section style={sectionStyle} aria-label={t(locale, 'comms.inbox.queueLabel')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={waitingMarkStyle} data-testid="inbox-waiting-mark">
              <WaitingIcon />
              {t(locale, 'comms.inbox.waiting')}
            </span>
            <span style={countBadgeStyle} data-testid="inbox-waiting-count">
              {waiting.length}
            </span>
          </div>

          {justSettled ? (
            <p style={settledMarkStyle} data-testid="inbox-just-settled">
              <SettledIcon />
              <span style={{ fontWeight: 'var(--weight-medium)', fontSize: 'var(--text-caption)' }}>
                {justSettled.title} — {t(locale, 'comms.inbox.settled')}
              </span>
            </p>
          ) : null}

          <div ref={trackRef} onScroll={onTrackScroll} style={trackStyle} data-testid="inbox-queue">
            {waiting.map((row, index) => {
              const action = row.action ? ACTIONS[row.action.kind] : undefined
              return (
                <article key={row.id} style={waitingCardStyle} data-testid={`inbox-waiting-${row.id}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    {row.action?.subject_name ? (
                      <span style={{ fontSize: 'var(--text-caption)', fontWeight: 'var(--weight-medium)' }}>
                        <bdi>{row.action.subject_name}</bdi>
                      </span>
                    ) : null}
                    <span style={{ ...metaStyle, marginInlineStart: 'auto' }}>
                      {formatDateInStudioZone(row.created_at, locale)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                    <p style={waitingTitleStyle}>{row.title}</p>
                    <p style={bodyStyle}>{row.body}</p>
                  </div>

                  {action ? (
                    <Button onClick={() => act(row)} data-testid={`inbox-act-${row.id}`}>
                      {t(locale, action.labelKey)}
                    </Button>
                  ) : null}

                  <div style={dotsRowStyle}>
                    <span style={{ display: 'flex', gap: '5px', alignItems: 'center' }} aria-hidden="true">
                      {waiting.map((dot, at) => (
                        <span
                          key={dot.id}
                          style={{
                            background: at === position ? 'var(--emphasis)' : 'var(--border)',
                            blockSize: '7px',
                            borderRadius: 'var(--radius-circle)',
                            inlineSize: '7px',
                          }}
                        />
                      ))}
                    </span>
                    {/* Never the dots alone: the position is a fact, and a fact drawn only
                        in colour is a fact a screen reader cannot read. */}
                    <span style={{ ...metaStyle, marginInlineStart: 'auto' }}>
                      {index + 1} {t(locale, 'comms.inbox.of')} {waiting.length} ·{' '}
                      {t(locale, 'comms.inbox.byArrival')}
                    </span>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      {loaded && rows.length === 0 ? (
        <EmptyState
          title={t(locale, 'comms.inbox.empty')}
          description={t(locale, 'comms.inbox.emptyHint')}
        />
      ) : null}

      {feed.length > 0 ? (
        <section style={sectionStyle}>
          <p style={eyebrowStyle}>{t(locale, 'comms.inbox.updates')}</p>
          {/* ONE card, rows divided by hairlines — not a card per row. The feed is an
              archive, and a stack of separate surfaces gives every announcement the same
              visual weight as the thing that still needs doing. */}
          <Card>
            {feed.map((row, index) => (
              <div
                key={row.id}
                style={index === 0 ? feedRowStyle : { ...feedRowStyle, ...feedRowDividedStyle }}
              >
                {/* A button and not a div: the row is interactive, so it has to be reachable
                    by keyboard and announced as a control. Its accessible name is the title. */}
                <button
                  type="button"
                  onClick={() => void open(row)}
                  style={rowStyle}
                  data-testid={`inbox-row-${row.id}`}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    {row.read_at === null ? (
                      <span style={newMarkStyle}>
                        <span style={newDotStyle} aria-hidden="true" />
                        {t(locale, 'comms.inbox.new')}
                      </span>
                    ) : null}
                    {row.action?.outstanding === false ? (
                      <span style={settledMarkStyle} data-testid={`inbox-settled-${row.id}`}>
                        <SettledIcon />
                        {t(locale, 'comms.inbox.settled')}
                      </span>
                    ) : null}
                    <span style={{ ...rowTitleStyle, flex: 1 }}>{row.title}</span>
                    {/* G3 — stored UTC, rendered Asia/Jerusalem REGARDLESS of locale. The
                        helper pins the zone; a bare toLocaleString would follow the phone's
                        own and put a Sunday cancellation on Saturday for a parent
                        travelling. The TIME is gone: an announcement is a day, not a minute,
                        and the clock was competing with the title for the row. */}
                    <span style={metaStyle}>{formatDateInStudioZone(row.created_at, locale)}</span>
                  </span>
                  <p style={bodyStyle}>{row.body}</p>
                </button>
              </div>
            ))}
          </Card>
        </section>
      ) : null}
    </section>
  )
}
