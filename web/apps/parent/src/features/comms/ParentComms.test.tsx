// Parent artboard `2b` (עדכוני מועדון) under **D9.1**, §5.11's banner and §5.12's panel.
//
// **The load-bearing test is the one about a route that does not exist.** §2.3 puts in-app
// two-way chat out of scope, §5.11 permits exactly two levels — a push notification and a
// ONE-WAY inbox — and D9.1 cut `שיחה עם המשרד` from this artboard. W6 verified the canvas
// no longer draws it either (C9, 2026-08-26); tests/contracts/test_canvas_matches_spec.py
// now fails if it returns there, and this test fails if it returns here. Two negatives over
// the same rule, because the mockup and the code are read by different people.
//
// **The second is the iOS branch.** The lane brief: "the two platforms take different paths
// here and you must not share one code path between them." On iOS in a Safari tab the Push
// API is ABSENT — a button that called it would do nothing when pressed and the parent would
// conclude the app is broken.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { CalendarSync } from './CalendarSync'
import { EventCalendarButtons, eventIcsUrl } from './EventCalendarButtons'
import { InboxScreen } from './InboxScreen'
import { PushDisabledBanner } from './PushDisabledBanner'
import { platformOf } from './usePushRegistration'
import type { NotificationOut, ParentCommsClient } from './commsClient'
import { googleSubscribeUrl, webcalUrl } from './commsClient'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120'

function note(over: Partial<NotificationOut> = {}): NotificationOut {
  return {
    id: 'n1',
    kind: 'announcement.published',
    title: 'ביטול שיעור',
    body: 'השיעור היום מבוטל',
    payload: {},
    read_at: null,
    created_at: '2026-11-12T15:00:00Z',
    ...over,
  }
}

function makeClient(over: Partial<ParentCommsClient> = {}): ParentCommsClient {
  return {
    inbox: vi.fn().mockResolvedValue({ items: [], next_cursor: null, has_more: false }),
    markRead: vi.fn().mockResolvedValue(note({ read_at: '2026-11-12T16:00:00Z' })),
    markAllRead: vi.fn().mockResolvedValue({ marked: 0 }),
    registerPush: vi.fn().mockResolvedValue({
      id: 'p1',
      app: 'parent',
      platform: 'android',
      last_seen_at: null,
    }),
    preferences: vi.fn().mockResolvedValue({ groups: [] }),
    setPreference: vi.fn().mockResolvedValue({ groups: [] }),
    calendarFeeds: vi.fn().mockResolvedValue({ feeds: [] }),
    rotateFeed: vi.fn(),
    ...over,
  } as unknown as ParentCommsClient
}

/** `useDisplayMode()` reads `matchMedia`, so the display mode is forced through it. */
function setDisplayMode(mode: 'standalone' | 'browser') {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: mode === 'standalone' && query.includes('standalone'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
}

beforeEach(() => {
  setDisplayMode('standalone')
  vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// -- D9.1: the inbox, and the thing that is not in it -------------------------
describe('the club inbox (2b)', () => {
  it('renders the updates list and nothing that could send a message', async () => {
    // D9.1 and §2.3. No textbox to type into, no reply control, no sender on a row — a
    // conversation thread with the office is a third level and §5.11 permits two.
    const client = makeClient({
      inbox: vi.fn().mockResolvedValue({
        items: [note()],
        next_cursor: null,
        has_more: false,
      }),
    })
    render(<InboxScreen client={client} locale="he" userAgent={ANDROID} />)

    expect(await screen.findByText('ביטול שיעור')).toBeInTheDocument()
    expect(screen.getByText(t('he', 'comms.inbox.title'))).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /שיחה/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /השב|תשובה/ })).toBeNull()
  })

  it('shows the empty state rather than an empty box', async () => {
    render(<InboxScreen client={makeClient()} locale="he" userAgent={ANDROID} />)
    expect(await screen.findByText(t('he', 'comms.inbox.empty'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'comms.inbox.emptyHint'))).toBeInTheDocument()
  })

  it('marks a message read when it is opened, and only once', async () => {
    const markRead = vi.fn().mockResolvedValue(note({ read_at: '2026-11-12T16:00:00Z' }))
    const client = makeClient({
      inbox: vi.fn().mockResolvedValue({ items: [note()], next_cursor: null, has_more: false }),
      markRead,
    })
    render(<InboxScreen client={client} locale="he" userAgent={ANDROID} />)

    const row = await screen.findByTestId('inbox-row-n1')
    await userEvent.click(row)
    await userEvent.click(row)
    // The second tap is a no-op locally as well as server-side: the row is already read, and
    // §5.11's badge would otherwise flicker under a parent's thumb.
    expect(markRead).toHaveBeenCalledTimes(1)
  })

  it('says which rows are new in words and not only with a dot', async () => {
    // A coloured dot is invisible to a screen reader and to anyone who reads it as
    // decoration. `inbox.new` carries the same fact.
    const client = makeClient({
      inbox: vi.fn().mockResolvedValue({ items: [note()], next_cursor: null, has_more: false }),
    })
    render(<InboxScreen client={client} locale="he" userAgent={ANDROID} />)
    const row = await screen.findByTestId('inbox-row-n1')
    expect(within(row).getByText(new RegExp(t('he', 'comms.inbox.new')))).toBeInTheDocument()
  })

  it('offers mark-all only while something is unread', async () => {
    const client = makeClient({
      inbox: vi.fn().mockResolvedValue({
        items: [note({ read_at: '2026-11-12T16:00:00Z' })],
        next_cursor: null,
        has_more: false,
      }),
    })
    render(<InboxScreen client={client} locale="he" userAgent={ANDROID} />)
    await screen.findByTestId('inbox-row-n1')
    expect(screen.queryByRole('button', { name: t('he', 'comms.inbox.markAllRead') })).toBeNull()
  })

  it('renders every row as a real control a keyboard can reach', async () => {
    const client = makeClient({
      inbox: vi.fn().mockResolvedValue({ items: [note()], next_cursor: null, has_more: false }),
    })
    render(<InboxScreen client={client} locale="he" userAgent={ANDROID} />)
    const row = await screen.findByTestId('inbox-row-n1')
    expect(row.tagName).toBe('BUTTON')
    expect(row).toHaveAccessibleName(/ביטול שיעור/)
  })
})

// -- §6.5: two platforms, two paths ------------------------------------------
describe('a message that can DO something (2026-08-30)', () => {
  it('pins "איך היה?" with a button that goes where the payload says', async () => {
    // §5.4a ④ has sent this on days 1, 3 and 7 since M3 carrying a booking id, a day
    // number and nothing to press. The product asked a family whether they enjoyed
    // themselves, three times, and offered them no way to answer.
    const client = makeClient({
      inbox: vi.fn().mockResolvedValue({
        items: [
          note({
            id: 'n7',
            kind: 'trial.followup',
            title: 'איך היה?',
            payload: { trial_booking_id: 'b1', day: 1, route: '#/join' },
          }),
        ],
        next_cursor: null,
        has_more: false,
      }),
    })
    render(<InboxScreen client={client} locale="he" userAgent={ANDROID} />)
    await userEvent.click(await screen.findByTestId('inbox-route-go-n7'))
    expect(globalThis.location.hash).toBe('#/join')
  })

  it('pins nothing for a message with no route — a no-show gets no join button', async () => {
    // `trial.no_show` is untouched, deliberately: the worker sends that family a different
    // message on the stated ground that "איך היה?" to somebody who did not come is worse
    // than silence. A join button is the same mistake with money attached.
    const client = makeClient({
      inbox: vi.fn().mockResolvedValue({
        items: [
          note({
            id: 'n8',
            kind: 'trial.no_show',
            title: 'התגעגענו אליכם',
            payload: { trial_booking_id: 'b1', day: 1 },
          }),
        ],
        next_cursor: null,
        has_more: false,
      }),
    })
    render(<InboxScreen client={client} locale="he" userAgent={ANDROID} />)
    await screen.findByTestId('inbox-row-n8')
    expect(screen.queryByTestId('inbox-route-n8')).toBeNull()
  })
})

describe('asking for push permission', () => {
  it('teaches the install on iOS in a tab instead of offering a button that cannot work', async () => {
    // §12 — in a Safari tab the Push API is ABSENT, not denied. There is nothing to request.
    setDisplayMode('browser')
    render(<InboxScreen client={makeClient()} locale="he" userAgent={IPHONE} />)

    expect(await screen.findByTestId('push-disabled-banner')).toBeInTheDocument()
    expect(screen.getByText(t('he', 'comms.push.iosTabHasNoApi'))).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t('he', 'comms.push.enable') })).toBeNull()
  })

  it('does offer it on Android in a tab, because Web Push works there', async () => {
    // The other half of the branch. Android Chrome allows Web Push in a normal tab, so the
    // install is not a precondition and gating on it would cost real subscriptions.
    setDisplayMode('browser')
    render(<InboxScreen client={makeClient()} locale="he" userAgent={ANDROID} />)
    expect(
      await screen.findByRole('button', { name: t('he', 'comms.push.enable') }),
    ).toBeInTheDocument()
  })

  it('shows the value pre-prompt before the OS dialog, never instead of it', async () => {
    // §5.11 asks behind נודיע לך אם שיעור מתבטל first. §6.5 is why: on iOS a denial is
    // permanent and cannot be re-requested in-app, so the one chance is spent only after the
    // parent has been told what it buys them.
    const requestPermission = vi.fn().mockResolvedValue('denied')
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })
    render(<InboxScreen client={makeClient()} locale="he" userAgent={ANDROID} />)

    await userEvent.click(await screen.findByRole('button', { name: t('he', 'comms.push.enable') }))
    expect(screen.getByTestId('push-pre-prompt')).toBeInTheDocument()
    expect(screen.getByText(t('he', 'comms.push.prePrompt.body'))).toBeInTheDocument()
    // Not yet. The OS dialog opens from the accept button and from nowhere else.
    expect(requestPermission).not.toHaveBeenCalled()

    await userEvent.click(
      screen.getByRole('button', { name: t('he', 'comms.push.prePrompt.accept') }),
    )
    expect(requestPermission).toHaveBeenCalledTimes(1)
  })

  it('declining the pre-prompt does not spend the one OS prompt', async () => {
    const requestPermission = vi.fn()
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })
    render(<InboxScreen client={makeClient()} locale="he" userAgent={ANDROID} />)

    await userEvent.click(await screen.findByRole('button', { name: t('he', 'comms.push.enable') }))
    await userEvent.click(
      screen.getByRole('button', { name: t('he', 'comms.push.prePrompt.decline') }),
    )
    expect(requestPermission).not.toHaveBeenCalled()
    expect(screen.queryByTestId('push-pre-prompt')).toBeNull()
  })

  it('shows the banner once the OS has refused', async () => {
    vi.stubGlobal('Notification', {
      permission: 'denied',
      requestPermission: vi.fn(),
    })
    render(<InboxScreen client={makeClient()} locale="he" userAgent={ANDROID} />)
    expect(await screen.findByTestId('push-disabled-banner')).toBeInTheDocument()
    expect(screen.getByText(t('he', 'comms.pushDisabled.body'))).toBeInTheDocument()
  })

  it('reads the platform off the user agent', () => {
    expect(platformOf(IPHONE)).toBe('ios')
    expect(platformOf(ANDROID)).toBe('android')
    expect(platformOf('Mozilla/5.0 (Macintosh) Chrome/120')).toBe('web')
  })
})

// -- §5.11's persistent banner ------------------------------------------------
describe('the push-disabled banner', () => {
  it('offers no way to dismiss it', () => {
    // §5.11 — "non-dismissible". It converts a meaningful share of denials, which it only
    // does if it is still there tomorrow. There is no close control and no `onDismiss` prop
    // for a later change to wire one to.
    render(<PushDisabledBanner state="denied" locale="he" />)
    const banner = screen.getByTestId('push-disabled-banner')
    expect(within(banner).queryByRole('button', { name: /סגור|dismiss|close/i })).toBeNull()
  })

  it('sends an iOS tab to the install rather than to OS settings', () => {
    // There is no permission to change on that device, so a settings button would lead
    // nowhere. The only thing that helps is installing the app.
    render(<PushDisabledBanner state="unsupported-ios-tab" locale="he" />)
    expect(screen.getByText(t('he', 'comms.push.iosTabHasNoApi'))).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: t('he', 'comms.pushDisabled.openSettings') }),
    ).toBeNull()
  })

  it('says nothing at all once push is registered', () => {
    render(<PushDisabledBanner state="registered" locale="he" />)
    expect(screen.queryByTestId('push-disabled-banner')).toBeNull()
  })

  it('says nothing on a browser that never had a Push API', () => {
    // Telling that parent their notifications are "off" would blame them for their browser.
    render(<PushDisabledBanner state="unsupported" locale="he" />)
    expect(screen.queryByTestId('push-disabled-banner')).toBeNull()
  })
})

// -- §5.12's three buttons ----------------------------------------------------
describe('the calendar panel', () => {
  const feed = {
    id: 'f1',
    subject_type: 'guardian' as const,
    url: 'https://api.example.test/api/v1/calendar/abc.ics',
    rotated_at: null,
  }

  function feedClient(over: Partial<ParentCommsClient> = {}) {
    return makeClient({
      calendarFeeds: vi.fn().mockResolvedValue({ feeds: [feed] }),
      ...over,
    })
  }

  it('offers Google, Apple and copy — the three §5.12 names', async () => {
    render(<CalendarSync client={feedClient()} locale="he" />)
    expect(
      await screen.findByRole('link', { name: t('he', 'comms.calendar.addGoogle') }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: t('he', 'comms.calendar.addApple') }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: t('he', 'comms.calendar.copyLink') }),
    ).toBeInTheDocument()
  })

  it('builds the Apple button as a webcal:// URL', async () => {
    // The scheme is the whole point: webcal:// opens the native SUBSCRIBE sheet, while the
    // https:// form downloads a one-off snapshot that never updates again — which looks like
    // it worked and silently stops reflecting the timetable.
    render(<CalendarSync client={feedClient()} locale="he" />)
    const apple = await screen.findByRole('link', {
      name: t('he', 'comms.calendar.addApple'),
    })
    expect(apple).toHaveAttribute('href', webcalUrl(feed.url))
    expect(apple.getAttribute('href')).toMatch(/^webcal:\/\//)
  })

  it('builds the Google button as a subscribe deep link, not a download', async () => {
    render(<CalendarSync client={feedClient()} locale="he" />)
    const google = await screen.findByRole('link', {
      name: t('he', 'comms.calendar.addGoogle'),
    })
    expect(google).toHaveAttribute('href', googleSubscribeUrl(feed.url))
    expect(google.getAttribute('href')).toContain('calendar.google.com')
  })

  it('shows a parent the three buttons and nothing else', async () => {
    // Owner decision, 2026-08-30. The rotate control revoked access to a timetable the
    // club publishes anyway, so its only reachable outcome was a parent breaking their own
    // synced calendar; the ~24h lag sentence was a caveat about a risk that goes with it,
    // on a screen where §5.11's push is what actually carries a cancellation.
    render(<CalendarSync client={feedClient()} locale="he" />)
    await screen.findByRole('link', { name: t('he', 'comms.calendar.addGoogle') })
    expect(screen.queryByRole('button', { name: t('he', 'comms.calendar.rotate') })).toBeNull()
    expect(screen.queryByText(t('he', 'comms.calendar.refreshDelay'))).toBeNull()
  })

  it('keeps rotation for a coach, and warns before it happens', async () => {
    // A coach's feed carries who is teaching what and where, and is published nowhere.
    // §5.12's "rotating invalidates the old URL immediately" still holds there, so the
    // warning is a gate rather than a toast after the fact.
    const coachFeed = { ...feed, subject_type: 'coach' as const }
    const rotateFeed = vi.fn().mockResolvedValue({ ...coachFeed, rotated_at: '2026-11-12T09:00:00Z' })
    render(
      <CalendarSync
        client={makeClient({
          calendarFeeds: vi.fn().mockResolvedValue({ feeds: [coachFeed] }),
          rotateFeed,
        })}
        locale="he"
        subjectType="coach"
      />,
    )

    await userEvent.click(
      await screen.findByRole('button', { name: t('he', 'comms.calendar.rotate') }),
    )
    expect(screen.getByTestId('rotate-warning')).toBeInTheDocument()
    expect(rotateFeed).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: t('he', 'comms.calendar.rotate') }))
    await waitFor(() => expect(rotateFeed).toHaveBeenCalledWith('f1'))
    expect(screen.getByTestId('calendar-rotated')).toBeInTheDocument()
  })

  it('copies the subscription URL', async () => {
    const onCopy = vi.fn()
    render(<CalendarSync client={feedClient()} locale="he" onCopy={onCopy} />)
    await userEvent.click(
      await screen.findByRole('button', { name: t('he', 'comms.calendar.copyLink') }),
    )
    expect(onCopy).toHaveBeenCalledWith(feed.url)
    expect(screen.getByText(t('he', 'comms.calendar.linkCopied'))).toBeInTheDocument()
  })

  it("tells a coach what is in THEIR feed, which is not what is in a parent's", async () => {
    const coachFeed = { ...feed, id: 'f2', subject_type: 'coach' as const }
    render(
      <CalendarSync
        client={makeClient({ calendarFeeds: vi.fn().mockResolvedValue({ feeds: [coachFeed] }) })}
        locale="he"
        subjectType="coach"
      />,
    )
    expect(await screen.findByText(t('he', 'comms.calendar.coachSubtitle'))).toBeInTheDocument()
  })
})

// -- §5.12's per-event button -------------------------------------------------
describe('the per-event add button', () => {
  it('links M7s single-event endpoint and names the saved file', () => {
    // §5.12 — "for parents who want the competition in their calendar without subscribing to
    // everything". The endpoint is M7's; this is only the control that reaches it.
    render(<EventCalendarButtons eventId="e1" locale="he" />)
    const link = screen.getByTestId('event-add-to-calendar')
    expect(link).toHaveAttribute('href', eventIcsUrl('e1'))
    expect(link).toHaveAttribute('download', 'event.ics')
    expect(link).toHaveAccessibleName(t('he', 'comms.calendar.addSingleEvent'))
  })
})

// -- G12 ----------------------------------------------------------------------
describe('layout', () => {
  it('uses no physical CSS properties', async () => {
    // D10/G12. The app is genuinely bidirectional, and a `margin-left` here is invisible in
    // Hebrew and wrong in English. eslint enforces this over source; this asserts the
    // RENDERED output, which is where an inline style would slip past a lint rule.
    const client = makeClient({
      inbox: vi.fn().mockResolvedValue({ items: [note()], next_cursor: null, has_more: false }),
    })
    const { container } = render(<InboxScreen client={client} locale="he" userAgent={ANDROID} />)
    await screen.findByTestId('inbox-row-n1')
    for (const element of container.querySelectorAll<HTMLElement>('[style]')) {
      const style = element.getAttribute('style') ?? ''
      expect(style).not.toMatch(/(^|;)\s*(margin|padding|border)-(left|right)\s*:/)
      expect(style).not.toMatch(/(^|;)\s*(left|right)\s*:/)
      expect(style).not.toMatch(/text-align:\s*(left|right)/)
    }
  })
})
