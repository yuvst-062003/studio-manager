// M8's staff surface — no artboard, and three real deliverables (conflict **C2**).
//
// The load-bearing tests here are §5.11's transactional exemption and §5.12's one-tap
// subscribe. (§5.14's at-risk card — the fourth deliverable — moved to `features/tasks`
// on 2026-09-06; see `./index.ts`'s own header for why, and `../tasks/TasksScreen.test.tsx`
// / `../tasks/deriveTasks.test.ts` for its tests now.)
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { CoachCalendarFeed } from './CoachCalendarFeed'
import { NotificationPreferences } from './NotificationPreferences'
import { StaffPushSetting } from './StaffPushSetting'
import { staffPlatformOf, urlBase64ToUint8Array, useStaffPushRegistration } from './useStaffPushRegistration'
import type { StaffCommsClient } from './staffCommsClient'
import { webcalUrl } from './staffCommsClient'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) Chrome/120'

//: A syntactically valid VAPID public key shape (base64url, no padding) -- not a real key.
const FAKE_VAPID_PUBLIC_KEY =
  'BMBSB_lN3YIV7yLYWgOrfmzIoKyIHn5aJTenMlE99lC_DhRMryn3tcVzr3LuHLXFLIfIv_-tpfUSBE51uKeNbZY'

const COACH_FEED = {
  id: 'f1',
  subject_type: 'coach' as const,
  url: 'https://api.example.test/api/v1/calendar/xyz.ics',
  rotated_at: null,
}

/** jsdom carries no `navigator.serviceWorker`. */
function stubServiceWorker(subscribe: (options: unknown) => unknown) {
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    value: { ready: Promise.resolve({ pushManager: { subscribe } }) },
    configurable: true,
  })
}

function makeClient(over: Partial<StaffCommsClient> = {}): StaffCommsClient {
  return {
    atRisk: vi.fn().mockResolvedValue({ items: [] }),
    markRead: vi.fn().mockResolvedValue({}),
    vapidPublicKey: vi.fn().mockResolvedValue({ public_key: FAKE_VAPID_PUBLIC_KEY }),
    registerPush: vi.fn().mockResolvedValue({}),
    preferences: vi.fn().mockResolvedValue({ groups: [] }),
    setPreference: vi.fn().mockResolvedValue({ groups: [] }),
    calendarFeeds: vi.fn().mockResolvedValue({ feeds: [] }),
    rotateFeed: vi.fn(),
    ...over,
  } as unknown as StaffCommsClient
}

afterEach(() => {
  vi.restoreAllMocks()
})

// §5.14's at-risk card and its `staff-alerts` registration used to be tested here
// (`AtRiskAlert.tsx` / `register.ts`). Both were deleted 2026-09-06 — the same
// `attendance.at_risk` notification was rendering twice, once as this banner and once as
// a `features/tasks` task card, and the owner's call was "tasks tab only". Their coverage
// moved with them: the one-tap `tel:` dial, the "no number on file" sentence, and the
// worst-first sort are now `../tasks/TasksScreen.test.tsx`'s and
// `../tasks/deriveTasks.test.ts`'s (`callParentTasks`, `byMostMissed`).

// -- §5.11's eight switches ----------------------------------------------------
describe('notification preferences (the 9e drawer)', () => {
  const groups = [
    { kind_group: 'session_cancelled', enabled: true, always_on: false },
    { kind_group: 'payment', enabled: true, always_on: false },
    { kind_group: 'health', enabled: true, always_on: true },
  ]

  it('renders one switch per group, in the order the server sent them', async () => {
    const client = makeClient({ preferences: vi.fn().mockResolvedValue({ groups }) })
    render(<NotificationPreferences client={client} locale="he" />)
    await screen.findByTestId('notification-preferences')

    expect(screen.getByTestId('preference-session_cancelled')).toBeInTheDocument()
    expect(screen.getByTestId('preference-payment')).toBeInTheDocument()
  })

  it('renders a transactional notice as a statement rather than a dead switch', async () => {
    // §5.11 — health-declaration notices are transactional. A switch that silently refuses to
    // move teaches a coach the screen is broken; the sentence teaches them the rule.
    const client = makeClient({ preferences: vi.fn().mockResolvedValue({ groups }) })
    render(<NotificationPreferences client={client} locale="he" />)

    const row = await screen.findByTestId('preference-health')
    expect(within(row).getByText(t('he', 'comms.preferences.alwaysOn'))).toBeInTheDocument()
    expect(within(row).queryByRole('switch')).toBeNull()
  })

  it('still shows the transactional group rather than hiding it', async () => {
    // Omitting the row leaves a coach looking at seven switches wondering which notification
    // the missing one is.
    const client = makeClient({ preferences: vi.fn().mockResolvedValue({ groups }) })
    render(<NotificationPreferences client={client} locale="he" />)
    expect(await screen.findByTestId('preference-health')).toBeInTheDocument()
  })

  it('persists a change rather than holding it in the client', async () => {
    // A preference that vanished on refresh would be §5.11's failure exactly: somebody who
    // believes they turned something off.
    const setPreference = vi.fn().mockResolvedValue({
      groups: groups.map((row) =>
        row.kind_group === 'payment' ? { ...row, enabled: false } : row,
      ),
    })
    const client = makeClient({
      preferences: vi.fn().mockResolvedValue({ groups }),
      setPreference,
    })
    render(<NotificationPreferences client={client} locale="he" />)

    const row = await screen.findByTestId('preference-payment')
    await userEvent.click(within(row).getByRole('switch'))
    expect(setPreference).toHaveBeenCalledWith('payment', false)
  })

  it('takes the server s answer over its own optimistic one', async () => {
    // A stale client patching a transactional group gets it back unchanged, and the switch
    // snaps back rather than lying about what is stored.
    const setPreference = vi.fn().mockResolvedValue({ groups })
    const client = makeClient({
      preferences: vi.fn().mockResolvedValue({ groups }),
      setPreference,
    })
    render(<NotificationPreferences client={client} locale="he" />)

    const row = await screen.findByTestId('preference-payment')
    await userEvent.click(within(row).getByRole('switch'))
    await waitFor(() =>
      expect(within(screen.getByTestId('preference-payment')).getByRole('switch')).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    )
  })
})

// -- §5.12's coach feed ---------------------------------------------------------
describe('the coach calendar feed', () => {
  it('offers the coach their own subscription and says what is in it', async () => {
    // §5.12's two feeds carry different things. `calendar.coachSubtitle` is how the person
    // holding the phone knows which one this is.
    const client = makeClient({ calendarFeeds: vi.fn().mockResolvedValue({ feeds: [COACH_FEED] }) })
    render(<CoachCalendarFeed client={client} locale="he" />)

    expect(await screen.findByTestId('coach-feed')).toBeInTheDocument()
    expect(screen.getByText(t('he', 'comms.calendar.coachSubtitle'))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: t('he', 'comms.calendar.addApple') })).toHaveAttribute(
      'href',
      webcalUrl(COACH_FEED.url),
    )
  })

  it('renders nothing for somebody who staffs no sessions', async () => {
    // The API issues no coach feed to a person with no `group_staff` and no `session_staff`
    // row, and a subscribe button for an empty calendar is a control that does nothing.
    render(<CoachCalendarFeed client={makeClient()} locale="he" />)
    await waitFor(() => expect(screen.queryByTestId('coach-feed')).toBeNull())
  })
})

// -- §6.5 -----------------------------------------------------------------------
describe('push registration', () => {
  it('reads the platform off the user agent', () => {
    expect(staffPlatformOf(IPHONE)).toBe('ios')
    expect(staffPlatformOf('Mozilla/5.0 (Linux; Android 14) Chrome/120')).toBe('android')
  })

  it('subscribes with the fetched VAPID key as applicationServerKey', async () => {
    // HB-push-transport's second break, same as the parent app's: `pushManager.subscribe`
    // was called with no `applicationServerKey` at all.
    const requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })
    const subscription = {
      endpoint: 'https://push.example.invalid/abcd',
      keys: { p256dh: 'x', auth: 'y' },
    }
    const subscribe = vi.fn().mockResolvedValue(subscription)
    stubServiceWorker(subscribe)
    const client = makeClient()

    const { result } = renderHook(() => useStaffPushRegistration(client, { userAgent: ANDROID }))
    await act(() => result.current.ask())

    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(FAKE_VAPID_PUBLIC_KEY),
    })
    expect(client.registerPush).toHaveBeenCalledWith(JSON.stringify(subscription), 'android')
    expect(result.current.state).toBe('registered')
  })

  it('does not attempt to subscribe with no VAPID key configured, and says so', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })
    const subscribe = vi.fn()
    stubServiceWorker(subscribe)
    const client = makeClient({ vapidPublicKey: vi.fn().mockResolvedValue({ public_key: null }) })

    const { result } = renderHook(() => useStaffPushRegistration(client, { userAgent: ANDROID }))
    await act(() => result.current.ask())

    expect(subscribe).not.toHaveBeenCalled()
    expect(client.registerPush).not.toHaveBeenCalled()
    expect(result.current.state).toBe('error')
  })
})

// -- G12 ------------------------------------------------------------------------
describe('layout', () => {
  it('uses no physical CSS properties', async () => {
    // Was `AtRiskAlert` (deleted 2026-09-06, see this file's own header); `CoachCalendarFeed`
    // is the remaining fill in this feature built the same way — inline `CSSProperties`
    // objects rather than a stylesheet — so it still exercises the same check.
    const client = makeClient({ calendarFeeds: vi.fn().mockResolvedValue({ feeds: [COACH_FEED] }) })
    const { container } = render(<CoachCalendarFeed client={client} locale="he" />)
    await screen.findByTestId('coach-feed')
    for (const element of container.querySelectorAll<HTMLElement>('[style]')) {
      const style = element.getAttribute('style') ?? ''
      expect(style).not.toMatch(/(^|;)\s*(margin|padding|border)-(left|right)\s*:/)
      expect(style).not.toMatch(/(^|;)\s*(left|right)\s*:/)
      expect(style).not.toMatch(/text-align:\s*(left|right)/)
    }
  })
})

// -- the control that did not exist (2026-09-13) -------------------------------
/**
 * **`useStaffPushRegistration` shipped with nothing rendering it.** The hook was written,
 * tested, and exported; no screen imported it. Every coach's `notification_delivery` row
 * therefore read `no_token` — never asked, rather than denied — and §5.11's eight switches
 * muted notifications a coach had no way to turn on.
 *
 * These tests are about the SEAM, not the hook: the hook's own behaviour is covered above,
 * and a component test that stubbed it would have passed just as happily while nothing was
 * mounted at all.
 */
describe('the staff push setting', () => {
  function stubWorker(subscribe: (o: unknown) => unknown, subscription: unknown = null) {
    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve({
          pushManager: { subscribe, getSubscription: () => Promise.resolve(subscription) },
        }),
      },
      configurable: true,
    })
  }

  it('offers to turn notifications on, and asks in words before the OS dialog', async () => {
    // §6.5: on iOS a denial is permanent. The OS dialog is opened from the accept button and
    // from nowhere else, so the one chance is spent only after the coach has been told what
    // it buys them.
    const requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })
    const subscription = { endpoint: 'https://push.example.invalid/coach' }
    stubWorker(vi.fn().mockResolvedValue(subscription))
    const client = makeClient()

    render(<StaffPushSetting client={client} locale="he" userAgent={ANDROID} />)

    await userEvent.click(screen.getByTestId('staff-push-offer'))
    expect(requestPermission, 'the OS dialog opened before the coach was asked').not.toHaveBeenCalled()

    await userEvent.click(screen.getByTestId('staff-push-accept'))
    await waitFor(() => expect(client.registerPush).toHaveBeenCalled())
    expect(await screen.findByTestId('staff-push-on')).toBeInTheDocument()
  })

  it('says so, persistently, when the OS refused', async () => {
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission: vi.fn() })
    stubWorker(vi.fn())

    render(<StaffPushSetting client={makeClient()} locale="he" userAgent={ANDROID} />)

    expect(screen.getByTestId('staff-push-disabled')).toBeInTheDocument()
    // Not offered again — the banner is the whole of §5.11's answer for a refusal.
    expect(screen.queryByTestId('staff-push-offer')).toBeNull()
  })

  it('re-registers a rotated subscription at launch without asking again', async () => {
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() })
    const rotated = {
      endpoint: 'https://push.example.invalid/ROTATED',
      toJSON: () => ({ endpoint: 'https://push.example.invalid/ROTATED' }),
    }
    stubWorker(vi.fn(), rotated)
    const client = makeClient()

    render(<StaffPushSetting client={client} locale="he" userAgent={ANDROID} />)

    await waitFor(() => expect(client.registerPush).toHaveBeenCalled())
    expect(vi.mocked(client.registerPush).mock.calls[0]?.[0]).toContain('ROTATED')
  })

  it('is actually mounted on the account screen', async () => {
    // The seam, and the reason this whole feature was dead: everything above passes with the
    // component rendered by a test and by nothing else.
    const account = await import('../account/AccountScreen')
    expect(String(account.AccountScreen)).toContain('StaffPushSetting')
  })
})
