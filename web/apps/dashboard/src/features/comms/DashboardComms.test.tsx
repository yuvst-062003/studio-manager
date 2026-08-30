// Dashboard artboard `4f` — הודעות: קהל יעד ותצוגה מקדימה — plus §5.11's delivery report,
// §6.5's install list, and the `alert-centre` fill.
//
// **The load-bearing tests are the ones about numbers a manager acts on.** §5.11 chose a list
// of phone numbers over a WhatsApp Business integration — "same outcome as automation, half a
// day of work, zero risk" — and that only works if the numbers are on the screen, the reasons
// are not merged, and the buttons say what they actually did.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSlot, useSlot } from '@studio/ui'
import { t } from '@studio/i18n'
import { AnnouncementsScreen, truncateForLockScreen } from './AnnouncementsScreen'
import { AtRiskAlert } from './AtRiskAlert'
import { DeliveryReport, inFlightCount } from './DeliveryReport'
import { InstallState } from './InstallState'
import { AT_RISK_ORDER, registerCommsAlerts } from './register'
import type {
  AnnouncementOut,
  DashboardCommsClient,
  DeliveryReportOut,
} from './dashboardCommsClient'
import { phoneList, whatsappShareUrl } from './dashboardCommsClient'

const ANNOUNCEMENT: AnnouncementOut = {
  id: 'x1',
  author_person_id: 'p0',
  title: 'ביטול שיעור',
  body: 'השיעור היום מבוטל',
  scope_type: 'studio',
  scope_id: null,
  scheduled_for: null,
  published_at: '2026-11-12T09:00:00Z',
  created_at: '2026-11-12T08:00:00Z',
}

function report(over: Partial<DeliveryReportOut> = {}): DeliveryReportOut {
  return {
    notification_ids: [],
    sent_count: 24,
    received_count: 19,
    missed_count: 5,
    missed: [
      { person_id: 'g1', name: 'יעל כהן', phone: '054-1234567', reason: 'denied' },
      { person_id: 'g2', name: 'דנה לוי', phone: '052-9876543', reason: 'no_token' },
      { person_id: 'g3', name: 'רון מזרחי', phone: '053-1112222', reason: 'failed' },
      { person_id: 'g4', name: 'שירה אבן', phone: '054-3334444', reason: 'denied' },
      { person_id: 'g5', name: 'עמית בר', phone: null, reason: 'denied' },
    ],
    ...over,
  }
}

function makeClient(over: Partial<DashboardCommsClient> = {}): DashboardCommsClient {
  return {
    list: vi.fn().mockResolvedValue({ items: [], next_cursor: null, has_more: false }),
    create: vi.fn().mockResolvedValue(ANNOUNCEMENT),
    publish: vi.fn().mockResolvedValue(ANNOUNCEMENT),
    audienceSize: vi.fn().mockResolvedValue({ recipient_count: 24 }),
    deliveryReport: vi.fn().mockResolvedValue(report()),
    resend: vi.fn().mockResolvedValue({ retried_count: 1 }),
    installState: vi.fn().mockResolvedValue({
      installed_count: 19,
      not_installed_count: 0,
      by_platform: { ios: 12, android: 7, web: 0 },
      not_installed: [],
    }),
    atRisk: vi.fn().mockResolvedValue({ items: [] }),
    markRead: vi.fn().mockResolvedValue({}),
    ...over,
  } as unknown as DashboardCommsClient
}

const SCOPES = [
  { id: 'c1', name: "ג'ודו", type: 'class' as const },
  { id: 'g1', name: 'מתחילים', type: 'group' as const },
]

afterEach(() => {
  clearSlot('alert-centre')
  vi.restoreAllMocks()
})

// -- 4f: קהל יעד ותצוגה מקדימה -------------------------------------------------
describe('the composer (4f)', () => {
  it('names the audience size before anything is sent', async () => {
    // §5.11's whole silent-failure problem starts here. A manager who cannot see
    // יגיע ל-24 משפחות before pressing send is guessing at twenty-four families.
    render(
      <AnnouncementsScreen
        canPublishStudioWide
        client={makeClient()}
        locale="he"
        scopes={SCOPES}
      />,
    )
    const size = await screen.findByTestId('audience-size')
    expect(size).toHaveTextContent('24')
  })

  it('refuses to send with no audience chosen', async () => {
    render(
      <AnnouncementsScreen
        canPublishStudioWide={false}
        client={makeClient()}
        locale="he"
        scopes={SCOPES}
      />,
    )
    expect(await screen.findByTestId('audience-none')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: t('he', 'comms.announcement.publish') }),
    ).toBeDisabled()
  })

  it('offers a lead coach their own groups and not the whole club', async () => {
    // §3.2 — "a lead coach publishes to their own groups". A picker offering a scope the API
    // will refuse is a 403 discovered after the message is written.
    render(
      <AnnouncementsScreen
        canPublishStudioWide={false}
        client={makeClient()}
        locale="he"
        scopes={SCOPES}
      />,
    )
    expect(
      await screen.findByText(t('he', 'comms.audience.limitedToOwnGroups')),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText(t('he', 'comms.audience.studio'))).toBeNull()
  })

  it('carries no preview pane — removed on the owner request of 2026-08-30', () => {
    render(
      <AnnouncementsScreen
        canPublishStudioWide
        client={makeClient()}
        locale="he"
        scopes={SCOPES}
      />,
    )
    expect(screen.queryByTestId('preview-pane')).toBeNull()
    expect(screen.queryByTestId('push-preview')).toBeNull()
    expect(screen.queryByTestId('inbox-preview')).toBeNull()
  })

  it('truncates a title that a lock screen would cut', () => {
    expect(truncateForLockScreen('קצר')).toBe('קצר')
    expect(truncateForLockScreen('א'.repeat(80))).toHaveLength(40)
    expect(truncateForLockScreen('א'.repeat(80)).endsWith('…')).toBe(true)
  })

  it('confirms a send rather than opening a delivery audit', async () => {
    // A manager who has just sent a note about a summer BBQ wants confirmation that it went.
    // A delivery report after every send is a screen people learn to dismiss without reading,
    // which costs exactly the one case it exists for — a cancellation a couple of hours out.
    render(
      <AnnouncementsScreen
        canPublishStudioWide
        client={makeClient()}
        locale="he"
        scopes={SCOPES}
      />,
    )
    await userEvent.type(screen.getByLabelText(t('he', 'comms.announcement.subject')), 'ביטול')
    await userEvent.type(screen.getByLabelText(t('he', 'comms.announcement.body')), 'מבוטל')
    await userEvent.click(
      screen.getByRole('button', { name: t('he', 'comms.announcement.publish') }),
    )

    expect(await screen.findByTestId('announcement-sent')).toBeInTheDocument()
    expect(screen.queryByTestId('delivery-report')).toBeNull()
  })

  it('creates and publishes in one press', async () => {
    const create = vi.fn().mockResolvedValue(ANNOUNCEMENT)
    const publish = vi.fn().mockResolvedValue(ANNOUNCEMENT)
    render(
      <AnnouncementsScreen
        canPublishStudioWide
        client={makeClient({ create, publish })}
        locale="he"
        scopes={SCOPES}
      />,
    )
    await userEvent.type(screen.getByLabelText(t('he', 'comms.announcement.subject')), 'ביטול')
    await userEvent.type(screen.getByLabelText(t('he', 'comms.announcement.body')), 'מבוטל')
    await userEvent.click(
      screen.getByRole('button', { name: t('he', 'comms.announcement.publish') }),
    )
    await waitFor(() => expect(publish).toHaveBeenCalledWith('x1'))
  })
})

// -- §5.11's delivery report ---------------------------------------------------
describe('the delivery report', () => {
  it('reports 24 sent, 19 received and 5 missed, with the phone numbers', async () => {
    // §5.11's screen, verbatim. The numbers are the feature: "5 didn't receive it" tells a
    // manager that five children may turn up to a cancelled class without telling them which.
    render(<DeliveryReport announcement={ANNOUNCEMENT} client={makeClient()} locale="he" />)

    await screen.findByTestId('delivery-report')
    expect(screen.getByText(/24/)).toBeInTheDocument()
    expect(screen.getByText(/19/)).toBeInTheDocument()
    const row = screen.getByTestId('missed-g1')
    expect(within(row).getByText('יעל כהן')).toBeInTheDocument()
    expect(within(row).getByText('054-1234567')).toBeInTheDocument()
  })

  it('names the reason per family and never merges the three', async () => {
    // no_token / denied / failed are three conversations: help them install, ask them to turn
    // the permission on, retry the send. 'לא קיבלו' alone is a number nobody can act on.
    render(<DeliveryReport announcement={ANNOUNCEMENT} client={makeClient()} locale="he" />)
    await screen.findByTestId('delivery-report')

    expect(
      within(screen.getByTestId('missed-g1')).getByText(t('he', 'comms.delivery.reason.denied')),
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('missed-g2')).getByText(t('he', 'comms.delivery.reason.no_token')),
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('missed-g3')).getByText(t('he', 'comms.delivery.reason.failed')),
    ).toBeInTheDocument()
  })

  it('copies the numbers in one press', async () => {
    // §5.11 — "The manager pastes those numbers into the WhatsApp group the club already has."
    const onCopy = vi.fn()
    render(
      <DeliveryReport
        announcement={ANNOUNCEMENT}
        client={makeClient()}
        locale="he"
        onCopy={onCopy}
      />,
    )
    await screen.findByTestId('delivery-report')
    await userEvent.click(
      screen.getByRole('button', { name: t('he', 'comms.delivery.copyNumbers') }),
    )
    expect(onCopy).toHaveBeenCalledWith('054-1234567\n052-9876543\n053-1112222\n054-3334444')
    expect(screen.getByTestId('numbers-copied')).toBeInTheDocument()
  })

  it('drops a family with no number rather than pasting a blank line', () => {
    expect(phoneList(report().missed).split('\n')).toHaveLength(4)
  })

  it('opens WhatsApp through the share sheet and never through an API', async () => {
    // §12 — the Groups API caps a group at 8 participants and exposes no endpoint to add one;
    // the unofficial libraries get the number banned. A wa.me URL, and nothing that could be
    // mistaken for an integration.
    render(<DeliveryReport announcement={ANNOUNCEMENT} client={makeClient()} locale="he" />)
    await screen.findByTestId('delivery-report')
    const link = screen.getByRole('link', { name: t('he', 'comms.delivery.shareToWhatsapp') })
    expect(link).toHaveAttribute('href', whatsappShareUrl(ANNOUNCEMENT.title, ANNOUNCEMENT.body))
    expect(link.getAttribute('href')).toContain('https://wa.me/')
  })

  it('says the send is still in flight rather than reporting misses that are not misses', async () => {
    // A `queued` push is neither received nor missed — reporting one would send a manager
    // chasing a family whose phone is about to buzz.
    const client = makeClient({
      deliveryReport: vi
        .fn()
        .mockResolvedValue(report({ received_count: 0, missed_count: 0, missed: [] })),
    })
    render(<DeliveryReport announcement={ANNOUNCEMENT} client={client} locale="he" />)
    expect(await screen.findByTestId('delivery-in-flight')).toBeInTheDocument()
  })

  it('derives in-flight from the three counts rather than a fourth field', () => {
    expect(inFlightCount(report())).toBe(0)
    expect(inFlightCount(report({ received_count: 0, missed_count: 0 }))).toBe(24)
  })

  it('offers no resend button, and points at the group instead', async () => {
    // A decision rather than an omission. Only a `failed` push is retryable at all, and
    // §5.11's own remedy for a missed one is "the WhatsApp group the club already has" — a
    // group post reaches all twenty-four families rather than the five this report names, so
    // a per-family retry solves a problem the group solves better.
    //
    // Asserted rather than left true, so the button does not come back as "a small thing".
    const resend = vi.fn()
    render(
      <DeliveryReport announcement={ANNOUNCEMENT} client={makeClient({ resend })} locale="he" />,
    )
    await screen.findByTestId('delivery-report')

    expect(screen.queryByRole('button', { name: t('he', 'comms.delivery.resend') })).toBeNull()
    expect(resend).not.toHaveBeenCalled()
    // What the screen DOES offer: the numbers, and the group.
    expect(
      screen.getByRole('button', { name: t('he', 'comms.delivery.copyNumbers') }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: t('he', 'comms.delivery.shareToWhatsapp') }),
    ).toBeInTheDocument()
  })

  it('celebrates a clean send rather than showing an empty list', async () => {
    const client = makeClient({
      deliveryReport: vi
        .fn()
        .mockResolvedValue(report({ received_count: 24, missed_count: 0, missed: [] })),
    })
    render(<DeliveryReport announcement={ANNOUNCEMENT} client={client} locale="he" />)
    expect(await screen.findByText(t('he', 'comms.delivery.allReceived'))).toBeInTheDocument()
  })
})

// -- §6.5's install list --------------------------------------------------------
describe('the install list', () => {
  it('lists the families who cannot receive a push at all, with their numbers', async () => {
    const client = makeClient({
      installState: vi.fn().mockResolvedValue({
        installed_count: 19,
        not_installed_count: 1,
        by_platform: { ios: 12, android: 7, web: 0 },
        not_installed: [{ person_id: 'g9', name: 'יעל כהן', phone: '054-1234567' }],
      }),
    })
    render(<InstallState client={client} locale="he" />)

    const row = await screen.findByTestId('not-installed-g9')
    expect(within(row).getByText('יעל כהן')).toBeInTheDocument()
    expect(within(row).getByText('054-1234567')).toBeInTheDocument()
    // §5.11 permits no email and no SMS fallback, and the screen says so.
    expect(screen.getByText(t('he', 'comms.install.callThem'))).toBeInTheDocument()
  })

  it('counts iOS and Android apart', async () => {
    // §6.5 — on iOS a registration means the app is on the home screen; on Android it does
    // not. Summing them hides the number the install walkthrough is judged on.
    render(<InstallState client={makeClient()} locale="he" />)
    await screen.findByTestId('install-state')
    expect(screen.getByText(/12/)).toBeInTheDocument()
    expect(screen.getByText(/7/)).toBeInTheDocument()
  })

  it('treats everybody-installed as a good answer rather than an empty state', async () => {
    render(<InstallState client={makeClient()} locale="he" />)
    expect(await screen.findByTestId('install-all-good')).toBeInTheDocument()
  })
})

// -- the alert-centre fill --------------------------------------------------------
describe('the at-risk card', () => {
  it('registers into alert-centre and into nothing else', () => {
    registerCommsAlerts(AtRiskAlert as never)
    expect(useSlot('alert-centre').map((entry) => entry.key)).toEqual(['comms-at-risk'])
    expect(useSlot('student-card')).toHaveLength(0)
    expect(useSlot('parent-profile')).toHaveLength(0)
  })

  it('sits below the debt alert and above the trial queue', () => {
    // features/people/register.ts left the gaps and said what belongs in them: money first,
    // then a child who has stopped coming, then the trial queue.
    expect(AT_RISK_ORDER).toBeGreaterThan(10)
    expect(AT_RISK_ORDER).toBeLessThan(20)
  })

  it('renders nothing when nobody is at risk', async () => {
    // Also the state until lane REPORTS merges: M9's job is what raises the kind.
    render(<AtRiskAlert client={makeClient()} locale="he" />)
    await waitFor(() => expect(screen.queryByTestId('at-risk-alert')).toBeNull())
  })

  it('gives the manager the same one-tap contact the coach gets', async () => {
    const client = makeClient({
      atRisk: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'a1',
            kind: 'attendance.at_risk',
            title: 'תלמיד בסיכון',
            body: 'דנה נעדרה 3 שיעורים ברצף',
            payload: { contact_phone: '054-1234567', missed_count: 3 },
            read_at: null,
            created_at: '2026-11-12T09:00:00Z',
          },
        ],
      }),
    })
    render(<AtRiskAlert client={client} locale="he" />)
    expect(await screen.findByTestId('at-risk-call-a1')).toHaveAttribute('href', 'tel:054-1234567')
  })
})

// -- G12 ----------------------------------------------------------------------------
describe('layout', () => {
  it('uses no physical CSS properties', async () => {
    const { container } = render(
      <DeliveryReport announcement={ANNOUNCEMENT} client={makeClient()} locale="he" />,
    )
    await screen.findByTestId('delivery-report')
    for (const element of container.querySelectorAll<HTMLElement>('[style]')) {
      const style = element.getAttribute('style') ?? ''
      expect(style).not.toMatch(/(^|;)\s*(margin|padding|border)-(left|right)\s*:/)
      expect(style).not.toMatch(/(^|;)\s*(left|right)\s*:/)
      expect(style).not.toMatch(/text-align:\s*(left|right)/)
    }
  })
})

