// M8's staff surface — no artboard, and four real deliverables (conflict **C2**).
//
// The two load-bearing tests are §5.14's one-tap contact and §5.11's transactional exemption.
// Both are places where a screen that looked right would be wrong: a phone number rendered as
// text is not one tap, and a switch that silently refuses to move teaches a coach the screen
// is broken.
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSlot, useSlot } from '@studio/ui'
import { t } from '@studio/i18n'
import { AtRiskAlert, byMostMissed } from './AtRiskAlert'
import { CoachCalendarFeed } from './CoachCalendarFeed'
import { NotificationPreferences } from './NotificationPreferences'
import { registerCommsSections, AT_RISK_ORDER } from './register'
import { staffPlatformOf, urlBase64ToUint8Array, useStaffPushRegistration } from './useStaffPushRegistration'
import type { NotificationOut, StaffCommsClient } from './staffCommsClient'
import { AT_RISK_KIND, webcalUrl } from './staffCommsClient'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) Chrome/120'

//: A syntactically valid VAPID public key shape (base64url, no padding) -- not a real key.
const FAKE_VAPID_PUBLIC_KEY =
  'BMBSB_lN3YIV7yLYWgOrfmzIoKyIHn5aJTenMlE99lC_DhRMryn3tcVzr3LuHLXFLIfIv_-tpfUSBE51uKeNbZY'

/** jsdom carries no `navigator.serviceWorker`. */
function stubServiceWorker(subscribe: (options: unknown) => unknown) {
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    value: { ready: Promise.resolve({ pushManager: { subscribe } }) },
    configurable: true,
  })
}

function alert(over: Partial<NotificationOut> = {}): NotificationOut {
  return {
    id: 'a1',
    kind: AT_RISK_KIND,
    title: 'תלמיד בסיכון',
    body: 'דנה נעדרה 3 שיעורים ברצף',
    payload: {
      student_id: 's1',
      group_id: 'g1',
      contact_person_id: 'p1',
      contact_phone: '054-1234567',
      missed_count: 3,
    },
    read_at: null,
    created_at: '2026-11-12T09:00:00Z',
    ...over,
  }
}

function makeClient(over: Partial<StaffCommsClient> = {}): StaffCommsClient {
  return {
    atRisk: vi.fn().mockResolvedValue({ items: [] }),
    markRead: vi.fn().mockResolvedValue(alert()),
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
  clearSlot('staff-alerts')
  vi.restoreAllMocks()
})

// -- §5.14's at-risk alert ----------------------------------------------------
describe('the at-risk alert', () => {
  it('gives it a one-tap call to the parent', async () => {
    // §5.14 — "with a one-tap צור קשר עם ההורה — it is not left sitting in a report nobody
    // opens." A `tel:` href, so one tap dials on a phone held beside a mat.
    const client = makeClient({ atRisk: vi.fn().mockResolvedValue({ items: [alert()] }) })
    render(<AtRiskAlert client={client} locale="he" />)

    const link = await screen.findByTestId('at-risk-call-a1')
    expect(link).toHaveAttribute('href', 'tel:054-1234567')
    expect(link).toHaveAccessibleName(t('he', 'comms.atRisk.contactParent'))
  })

  it('says so plainly when the payload carries no number', async () => {
    // A dead `tel:` link is worse than a sentence — it looks like it should work.
    const client = makeClient({
      atRisk: vi
        .fn()
        .mockResolvedValue({
          items: [alert({ payload: { missed_count: 3, contact_phone: null } })],
        }),
    })
    render(<AtRiskAlert client={client} locale="he" />)

    expect(await screen.findByText(t('he', 'comms.atRisk.noPhone'))).toBeInTheDocument()
    expect(screen.queryByTestId('at-risk-call-a1')).toBeNull()
  })

  it('renders nothing at all when nobody is at risk', async () => {
    // Not an empty panel. §5.14's alert centre is "everything that requires a decision", and
    // a permanent "no students at risk" card is a row that never requires one — which is how
    // an alert centre becomes a list nobody scans.
    //
    // This is also the state the whole card is in until lane REPORTS merges: M9's job is what
    // raises `attendance.at_risk`, and the callee half of a caller/callee pair merges first.
    render(<AtRiskAlert client={makeClient()} locale="he" />)
    await waitFor(() => expect(screen.queryByTestId('at-risk-alert')).toBeNull())
  })

  it('sorts the worst case first', () => {
    const rows = [
      alert({ id: 'a1', payload: { missed_count: 3 } }),
      alert({ id: 'a2', payload: { missed_count: 7 } }),
    ]
    expect(byMostMissed(rows).map((row) => row.id)).toEqual(['a2', 'a1'])
  })

  it('reads its rows from this coach s own inbox, filtered by kind', async () => {
    // Not from a report. A card that queried a report would show a coach every at-risk student
    // in the club, including the ones in groups they do not teach — §5.11's fan-out already
    // decided who should be told.
    const atRisk = vi.fn().mockResolvedValue({ items: [] })
    render(<AtRiskAlert client={makeClient({ atRisk })} locale="he" />)
    await waitFor(() => expect(atRisk).toHaveBeenCalled())
  })

  it('stops showing an alert once the coach has acted on it', async () => {
    const markRead = vi.fn().mockResolvedValue(alert())
    const client = makeClient({
      atRisk: vi.fn().mockResolvedValue({ items: [alert()] }),
      markRead,
    })
    render(<AtRiskAlert client={client} locale="he" />)
    await userEvent.click(await screen.findByTestId('at-risk-call-a1'))
    expect(markRead).toHaveBeenCalledWith('a1')
  })
})

// -- the slot ------------------------------------------------------------------
describe('the staff-alerts registration', () => {
  it('registers into staff-alerts and into nothing else', () => {
    // `staff-alerts`, not `alert-centre` — that container exists only in the DASHBOARD
    // bundle, so the old target could render nowhere in this app (S1).
    registerCommsSections(AtRiskAlert as never)
    expect(useSlot('staff-alerts').map((entry) => entry.key)).toEqual(['comms-at-risk'])
    expect(useSlot('alert-centre')).toHaveLength(0)
    expect(useSlot('student-card')).toHaveLength(0)
    expect(useSlot('roster-row')).toHaveLength(0)
  })

  it('sits between unsynced work and the trial queue', () => {
    // M5's conflicts are 5 ("a coach's lost register cannot wait an hour"); M3's pending
    // requests are 20. A child who has missed three lessons is urgent in a different sense,
    // and §5.14 built this feature against alerts that sit unread.
    expect(AT_RISK_ORDER).toBeGreaterThan(5)
    expect(AT_RISK_ORDER).toBeLessThan(20)
  })
})

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
  const feed = {
    id: 'f1',
    subject_type: 'coach' as const,
    url: 'https://api.example.test/api/v1/calendar/xyz.ics',
    rotated_at: null,
  }

  it('offers the coach their own subscription and says what is in it', async () => {
    // §5.12's two feeds carry different things. `calendar.coachSubtitle` is how the person
    // holding the phone knows which one this is.
    const client = makeClient({ calendarFeeds: vi.fn().mockResolvedValue({ feeds: [feed] }) })
    render(<CoachCalendarFeed client={client} locale="he" />)

    expect(await screen.findByTestId('coach-feed')).toBeInTheDocument()
    expect(screen.getByText(t('he', 'comms.calendar.coachSubtitle'))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: t('he', 'comms.calendar.addApple') })).toHaveAttribute(
      'href',
      webcalUrl(feed.url),
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
    const client = makeClient({ atRisk: vi.fn().mockResolvedValue({ items: [alert()] }) })
    const { container } = render(<AtRiskAlert client={client} locale="he" />)
    await screen.findByTestId('at-risk-alert')
    for (const element of container.querySelectorAll<HTMLElement>('[style]')) {
      const style = element.getAttribute('style') ?? ''
      expect(style).not.toMatch(/(^|;)\s*(margin|padding|border)-(left|right)\s*:/)
      expect(style).not.toMatch(/(^|;)\s*(left|right)\s*:/)
      expect(style).not.toMatch(/text-align:\s*(left|right)/)
    }
  })
})
