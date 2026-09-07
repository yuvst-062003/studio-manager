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
import { PushDisabledBanner } from './PushDisabledBanner'
import { PushSetting } from './PushSetting'
import { UpdatesScreen } from './redesign/UpdatesScreen'
import { platformOf, urlBase64ToUint8Array } from './usePushRegistration'
import type { NotificationOut, ParentCommsClient } from './commsClient'
import { googleSubscribeUrl, webcalUrl } from './commsClient'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120'

//: A syntactically valid VAPID public key shape (base64url, no padding) -- not a real key,
//: just long enough that `urlBase64ToUint8Array` has real bytes to decode.
const FAKE_VAPID_PUBLIC_KEY =
  'BMBSB_lN3YIV7yLYWgOrfmzIoKyIHn5aJTenMlE99lC_DhRMryn3tcVzr3LuHLXFLIfIv_-tpfUSBE51uKeNbZY'

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
    vapidPublicKey: vi.fn().mockResolvedValue({ public_key: FAKE_VAPID_PUBLIC_KEY }),
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
  // A declined pre-prompt is REMEMBERED per device now (2026-09-07), which is the whole
  // point of it — and that makes it leak between tests in one file, where the earlier
  // decline test would otherwise hide the offer from every test after it.
  globalThis.localStorage?.clear()
  setDisplayMode('standalone')
  vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() })
})

/** jsdom carries no `navigator.serviceWorker` -- defined narrowly rather than through
 * `vi.stubGlobal('navigator', ...)`, which would replace the whole object other fixtures
 * (like the user-agent prop) do not go through `navigator` for in the first place. */
function stubServiceWorker(subscribe: (options: unknown) => unknown) {
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    value: { ready: Promise.resolve({ pushManager: { subscribe } }) },
    configurable: true,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// -- D9.1: the inbox, and the thing that is not in it -------------------------
/**
 * The screen that replaced `InboxScreen`. These blocks are about PUSH and about rendered
 * CSS, not about the inbox's arrangement — both still true of עדכונים — so they were
 * repointed rather than deleted with the screen they happened to be written against.
 */
function Updates({ client }: { client: ParentCommsClient }) {
  return <UpdatesScreen client={client} locale="he" childrenById={{}} childNames={[]} />
}

/**
 * Push moved to Profile → הגדרות on 2026-09-07, so these render the component that owns it
 * rather than the feed it used to sit above. Every assertion below is the one that was
 * written against `UpdatesScreen`: the behaviours did not change, only where a parent meets
 * them. The one shape that DID change is the invitation — in Settings the question is put
 * directly instead of behind a button, because walking into Settings is the intent that
 * button existed to collect.
 */
function Push({ client, userAgent }: { client: ParentCommsClient; userAgent: string }) {
  return <PushSetting client={client} locale="he" userAgent={userAgent} />
}

describe('asking for push permission', () => {
  it('teaches the install on iOS in a tab instead of offering a button that cannot work', async () => {
    // §12 — in a Safari tab the Push API is ABSENT, not denied. There is nothing to request.
    setDisplayMode('browser')
    render(<Push client={makeClient()} userAgent={IPHONE} />)

    expect(await screen.findByTestId('push-disabled-banner')).toBeInTheDocument()
    expect(screen.getByText(t('he', 'comms.push.iosTabHasNoApi'))).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t('he', 'comms.push.enable') })).toBeNull()
  })

  it('does offer it on Android in a tab, because Web Push works there', async () => {
    // The other half of the branch. Android Chrome allows Web Push in a normal tab, so the
    // install is not a precondition and gating on it would cost real subscriptions.
    setDisplayMode('browser')
    render(<Push client={makeClient()} userAgent={ANDROID} />)
    expect(await screen.findByTestId('push-pre-prompt')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: t('he', 'comms.push.prePrompt.accept') }),
    ).toBeInTheDocument()
  })

  it('shows the value pre-prompt before the OS dialog, never instead of it', async () => {
    // §5.11 asks behind נודיע לך אם שיעור מתבטל first. §6.5 is why: on iOS a denial is
    // permanent and cannot be re-requested in-app, so the one chance is spent only after the
    // parent has been told what it buys them.
    const requestPermission = vi.fn().mockResolvedValue('denied')
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })
    render(<Push client={makeClient()} userAgent={ANDROID} />)

    expect(await screen.findByTestId('push-pre-prompt')).toBeInTheDocument()
    expect(screen.getByText(t('he', 'comms.push.prePrompt.body'))).toBeInTheDocument()
    // The guarantee §6.5 cares about, and the reason this is not a bare OS prompt: on iOS a
    // refusal is permanent, so the one chance is spent from the accept button and nowhere
    // else. Merely rendering the question must never open the dialog.
    expect(requestPermission).not.toHaveBeenCalled()

    await userEvent.click(
      screen.getByRole('button', { name: t('he', 'comms.push.prePrompt.accept') }),
    )
    expect(requestPermission).toHaveBeenCalledTimes(1)
  })

  it('declining the pre-prompt does not spend the one OS prompt', async () => {
    const requestPermission = vi.fn()
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })
    render(<Push client={makeClient()} userAgent={ANDROID} />)

    await userEvent.click(
      await screen.findByRole('button', { name: t('he', 'comms.push.prePrompt.decline') }),
    )
    expect(requestPermission).not.toHaveBeenCalled()
    expect(screen.queryByTestId('push-pre-prompt')).toBeNull()
  })

  it('shows the banner once the OS has refused', async () => {
    vi.stubGlobal('Notification', {
      permission: 'denied',
      requestPermission: vi.fn(),
    })
    render(<Push client={makeClient()} userAgent={ANDROID} />)
    expect(await screen.findByTestId('push-disabled-banner')).toBeInTheDocument()
    expect(screen.getByText(t('he', 'comms.pushDisabled.body'))).toBeInTheDocument()
  })

  it('reads the platform off the user agent', () => {
    expect(platformOf(IPHONE)).toBe('ios')
    expect(platformOf(ANDROID)).toBe('android')
    expect(platformOf('Mozilla/5.0 (Macintosh) Chrome/120')).toBe('web')
  })

  it('subscribes with the fetched VAPID key as applicationServerKey', async () => {
    // HB-push-transport's second break: `pushManager.subscribe` was called with no
    // `applicationServerKey` at all, which Chrome and Safari both reject outright.
    const requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })
    const subscription = { endpoint: 'https://push.example.invalid/abcd', keys: { p256dh: 'x', auth: 'y' } }
    const subscribe = vi.fn().mockResolvedValue(subscription)
    stubServiceWorker(subscribe)
    const client = makeClient()

    render(<Push client={client} userAgent={ANDROID} />)
    await userEvent.click(
      await screen.findByRole('button', { name: t('he', 'comms.push.prePrompt.accept') }),
    )

    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1))
    expect(subscribe.mock.calls[0]![0]).toEqual({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(FAKE_VAPID_PUBLIC_KEY),
    })
    await waitFor(() =>
      expect(client.registerPush).toHaveBeenCalledWith(JSON.stringify(subscription), 'android'),
    )
  })

  it('does not attempt to subscribe with no VAPID key configured, and says so', async () => {
    // The other half of the same break: a browser CAN reject a keyless subscribe with an
    // error the catch swallows into `error` anyway, but asking at all when this environment
    // was never given a key is a request that can only fail -- and doing it silently is
    // how "push is off" reads as "push is broken", which is a worse conversation.
    const requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })
    const subscribe = vi.fn()
    stubServiceWorker(subscribe)
    const client = makeClient({ vapidPublicKey: vi.fn().mockResolvedValue({ public_key: null }) })

    render(<Push client={client} userAgent={ANDROID} />)
    await userEvent.click(
      await screen.findByRole('button', { name: t('he', 'comms.push.prePrompt.accept') }),
    )

    await waitFor(() => expect(screen.getByTestId('push-disabled-banner')).toBeInTheDocument())
    expect(subscribe).not.toHaveBeenCalled()
    expect(client.registerPush).not.toHaveBeenCalled()
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
    //
    // It named `pushDisabled.openSettings` until 2026-09-07, when that button was removed
    // from every state — it was passed no handler by its one caller and did nothing when
    // pressed. The assertion is now "no button", which is both what this test always meant
    // and a claim that survives the string being deleted.
    render(<PushDisabledBanner state="unsupported-ios-tab" locale="he" />)
    expect(screen.getByText(t('he', 'comms.push.iosTabHasNoApi'))).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
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

  it('shows once granted but not registered, instead of telling the parent nothing', () => {
    // §2.1 of the 2026-09-02 findings register: granted-but-not-registered rendered `null`
    // here, so a parent who granted permission had no way to know push was still off --
    // worse than the OS-refused case, which at least shows the banner.
    render(<PushDisabledBanner state="error" locale="he" />)
    expect(screen.getByTestId('push-disabled-banner')).toBeInTheDocument()
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
    const { container } = render(<Updates client={client} />)
    await screen.findByTestId('updates-row-n1')
    for (const element of container.querySelectorAll<HTMLElement>('[style]')) {
      const style = element.getAttribute('style') ?? ''
      expect(style).not.toMatch(/(^|;)\s*(margin|padding|border)-(left|right)\s*:/)
      expect(style).not.toMatch(/(^|;)\s*(left|right)\s*:/)
      expect(style).not.toMatch(/text-align:\s*(left|right)/)
    }
  })
})

// The three `InboxScreen` blocks were deleted with that screen. עדכונים replaces it, and
// what they were really about — that `outstanding` and `read_at` are different questions —
// is held by `features/comms/redesign/classify.test.ts`, which tests the rule rather than
// one rendering of it.

describe('the four defects reported on עדכונים (2026-09-07)', () => {
  const ENABLE = t('he', 'comms.push.enable')

  it('stops ASKING once the parent has declined, and stays stopped', async () => {
    // **The bug.** `decline` set the state back to `unasked` — the exact state that draws
    // the question — so declining returned the parent to the start and they were asked
    // again on every visit, forever.
    //
    // Restated 2026-09-07 for where this lives now. Settings deliberately keeps a door for
    // somebody who changes their mind, so "stopped" is no longer "nothing on screen": it is
    // that the QUESTION is gone and only a button they must press themselves remains.
    const user = userEvent.setup()
    const { unmount } = render(<Push client={makeClient()} userAgent={ANDROID} />)

    await user.click(
      await screen.findByRole('button', { name: t('he', 'comms.push.prePrompt.decline') }),
    )
    expect(screen.queryByTestId('push-pre-prompt')).not.toBeInTheDocument()

    // And on the next visit — a fresh mount, which is what a returning parent is.
    unmount()
    render(<Push client={makeClient()} userAgent={ANDROID} />)
    await waitFor(() => expect(screen.getByTestId('push-setting')).toBeInTheDocument())
    expect(screen.queryByTestId('push-pre-prompt')).not.toBeInTheDocument()
    // The door, not a nag: pressing it is the parent's move.
    expect(screen.getByRole('button', { name: ENABLE })).toBeInTheDocument()
  })

  it('still asks a parent who has never answered', async () => {
    // The other half: the fix must not silence the question for everyone.
    render(<Push client={makeClient()} userAgent={ANDROID} />)
    expect(await screen.findByTestId('push-pre-prompt')).toBeInTheDocument()
  })

  it('never puts push on עדכונים at all any more', async () => {
    // The owner's report: the invitation greeted them on every visit to the inbox, and a
    // refused phone got a permanent red banner about missing cancellation notices on the
    // very screen they had opened to read notices. Neither belongs in a feed.
    render(<Updates client={makeClient()} />)
    await waitFor(() => expect(screen.getByTestId('parent-updates')).toBeInTheDocument())
    expect(screen.queryByTestId('push-setting')).toBeNull()
    expect(screen.queryByTestId('push-pre-prompt')).toBeNull()
    expect(screen.queryByTestId('push-disabled-banner')).toBeNull()
    expect(screen.queryByRole('button', { name: ENABLE })).toBeNull()
  })

  it('does not claim "no updates" while a next page is still unfetched', async () => {
    // The screen asserting an absence it had not established: a parent whose updates all
    // sat on page two was told אין עדכונים over the top of them.
    const client = makeClient({
      inbox: vi.fn().mockResolvedValue({ items: [], next_cursor: 'c1', has_more: true }),
    })
    render(<Updates client={client} />)

    await waitFor(() => expect(screen.getByTestId('updates-more')).toBeInTheDocument())
    expect(screen.queryByTestId('updates-empty')).not.toBeInTheDocument()
  })

  it('says "no updates" once there is genuinely nothing left to fetch', async () => {
    render(<Updates client={makeClient()} />)
    expect(await screen.findByTestId('updates-empty')).toBeInTheDocument()
  })

  it('shows a pending line while the next page is loading', async () => {
    // It was a bare text link with no pending state — pressing it looked like nothing had
    // happened at all.
    let release: (value: unknown) => void = () => {}
    const client = makeClient({
      inbox: vi
        .fn()
        .mockResolvedValueOnce({ items: [note()], next_cursor: 'c1', has_more: true })
        .mockImplementationOnce(() => new Promise((resolve) => { release = resolve })),
    })
    render(<Updates client={client} />)

    await userEvent.click(await screen.findByTestId('updates-load-more'))

    expect(await screen.findByTestId('updates-loading-more')).toBeInTheDocument()
    release({ items: [], next_cursor: null, has_more: false })
    await waitFor(() =>
      expect(screen.queryByTestId('updates-loading-more')).not.toBeInTheDocument(),
    )
  })

  it('draws no settings button on the push-disabled banner', () => {
    // It rendered for every denied parent and its one caller passed no handler, so pressing
    // it did nothing. `inert-buttons.test.ts` could not see it: the handler is written in
    // the component as an optional prop, and that guard reads one file at a time.
    render(<PushDisabledBanner locale="he" state="denied" />)

    expect(screen.getByTestId('push-disabled-banner')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------------
// "I have a new message, I enter the notification, and the icon still shows 1"
// (owner, 2026-09-07).
//
// Two causes, and they compounded. `onOpen` hung off the action LINK, so a plain
// announcement had nothing pressable on it at all. And when something WAS marked read,
// `onReadChange` — which makes the shell re-read the badge from the server — ran on the
// next line while the POST was still in flight, so the refresh could read the old count
// straight back.
// ---------------------------------------------------------------------------------
describe('clearing an unread notice', () => {
  const announcement = (id: string) => ({
    id,
    kind: 'announcement.published',
    title: `הודעה ${id}`,
    body: 'גוף ההודעה',
    payload: {},
    created_at: '2026-09-01T06:00:00Z',
    read_at: null,
  })

  it('gives an announcement something to press — it has no action link to hide behind', async () => {
    render(<Updates client={makeClient({ inbox: vi.fn().mockResolvedValue({ items: [announcement('n1')], next_cursor: null, has_more: false }) })} />)
    expect(await screen.findByTestId('updates-mark-read-n1')).toBeInTheDocument()
  })

  it('marks it read on the server when pressed', async () => {
    const markRead = vi.fn().mockResolvedValue({})
    render(<Updates client={makeClient({ inbox: vi.fn().mockResolvedValue({ items: [announcement('n1')], next_cursor: null, has_more: false }), markRead })} />)
    await userEvent.click(await screen.findByTestId('updates-mark-read-n1'))
    expect(markRead).toHaveBeenCalledWith('n1')
  })

  it('tells the shell to re-read the badge only AFTER the write has landed', async () => {
    // The race. `onReadChange` fires the badge re-fetch; running it while the POST is in
    // flight lets the server answer with the count it had a moment ago, and the parent
    // watches the number stay exactly where it was.
    const order: string[] = []
    let settle: () => void = () => {}
    const markRead = vi.fn(
      (id: string) =>
        new Promise<NotificationOut>((resolve) => {
          settle = () => {
            order.push('write settled')
            resolve({ ...announcement(id), read_at: '2026-09-07T00:00:00Z' })
          }
        }),
    )
    const onReadChange = vi.fn(() => order.push('badge refreshed'))
    render(
      <UpdatesScreen
        client={makeClient({ inbox: vi.fn().mockResolvedValue({ items: [announcement('n1')], next_cursor: null, has_more: false }), markRead })}
        locale="he"
        childrenById={{}}
        childNames={[]}
        onReadChange={onReadChange}
      />,
    )
    await userEvent.click(await screen.findByTestId('updates-mark-read-n1'))
    expect(onReadChange, 'the badge was refreshed before the write landed').not.toHaveBeenCalled()

    settle()
    await waitFor(() => expect(onReadChange).toHaveBeenCalled())
    expect(order).toEqual(['write settled', 'badge refreshed'])
  })

  it('drops the pill once the notice is read, so the row says what it is', async () => {
    render(<Updates client={makeClient({ inbox: vi.fn().mockResolvedValue({ items: [announcement('n1')], next_cursor: null, has_more: false }) })} />)
    await userEvent.click(await screen.findByTestId('updates-mark-read-n1'))
    await waitFor(() => expect(screen.queryByTestId('updates-mark-read-n1')).toBeNull())
  })
})
