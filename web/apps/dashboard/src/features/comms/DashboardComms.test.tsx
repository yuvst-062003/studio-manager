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
import { localInputToInstant } from './AnnouncementComposer'
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

// -- 4f: the composer drawer ----------------------------------------------------
//
// **Third shape, and these tests are what stops the previous two coming back.** The screen
// was a flat composer, then a four-step wizard; the owner's correction is neither — *"when
// pressing write new msgs, a left popup opens up with ready template and free text"*, and
// *"no need to show who gets the msgs"*. So: one panel, no steps, and no audience picker
// for anyone the API lets publish studio-wide.
describe('the composer drawer (4f, checkpoint 12)', () => {
  /** It is a drawer over the feed, so every path starts by opening it. */
  async function open() {
    await userEvent.click(await screen.findByTestId('open-composer'))
    return screen.findByTestId('announcement-composer')
  }

  /** Writes a message on the one surface there now is. No steps to walk. */
  async function write(title = 'ביטול', body = 'מבוטל') {
    await userEvent.click(screen.getByTestId('template-blank'))
    await userEvent.type(screen.getByTestId('composer-title-field'), title)
    await userEvent.type(screen.getByTestId('composer-body-field'), body)
  }

  it('puts templates and free text on ONE surface, with no steps between them', async () => {
    // The correction in one assertion: a manager reaches the box they type in without
    // pressing "next", and the templates are still there while they type.
    render(
      <AnnouncementsScreen canPublishStudioWide client={makeClient()} locale="he" scopes={SCOPES} />,
    )
    await open()
    expect(screen.getByTestId('composer-templates')).toBeInTheDocument()
    expect(screen.getByTestId('composer-title-field')).toBeInTheDocument()
    expect(screen.getByTestId('composer-body-field')).toBeInTheDocument()
    expect(screen.queryByTestId('wizard-next')).toBeNull()
  })

  it('fills the message from a template, and never wipes what was written', async () => {
    render(
      <AnnouncementsScreen canPublishStudioWide client={makeClient()} locale="he" scopes={SCOPES} />,
    )
    await open()
    await userEvent.click(screen.getByTestId('template-closure'))
    expect(screen.getByTestId('composer-title-field')).toHaveValue(
      t('he', 'comms.template.closure.title'),
    )

    // `blank` writes NOTHING rather than writing emptiness. On the normal path the fields
    // are already empty, so it reads as "start from scratch"; after a template it leaves
    // the manager's own edits alone, which is the only one of the two that cannot destroy
    // typing.
    await userEvent.click(screen.getByTestId('template-blank'))
    expect(screen.getByTestId('composer-title-field')).toHaveValue(
      t('he', 'comms.template.closure.title'),
    )
  })

  it('inserts a dynamic tag as literal text, because the SERVER substitutes it', async () => {
    // Previewing a real name would promise a substitution this screen cannot verify.
    render(
      <AnnouncementsScreen canPublishStudioWide client={makeClient()} locale="he" scopes={SCOPES} />,
    )
    await open()
    await userEvent.click(screen.getByTestId('template-blank'))
    await userEvent.type(screen.getByTestId('composer-body-field'), 'שלום')
    await userEvent.click(screen.getByTestId('tag-studentName'))
    expect(screen.getByTestId('composer-body-field')).toHaveValue(
      `שלום ${t('he', 'comms.tag.studentName')}`,
    )
  })

  it('never asks an owner who gets it, and says the size on the button instead', async () => {
    // *"No need to show who gets the msgs."* The count does not disappear with the picker —
    // §5.11's silent-failure problem starts with a manager who cannot see how many families
    // a message reaches, so it moves onto the button they are about to press.
    render(
      <AnnouncementsScreen canPublishStudioWide client={makeClient()} locale="he" scopes={SCOPES} />,
    )
    await open()
    expect(screen.queryByTestId('composer-audience')).toBeNull()
    await waitFor(() => expect(screen.getByTestId('composer-send')).toHaveTextContent('24'))
  })

  it('uses the real count, never the prototype’s hardcoded one', async () => {
    // The prototype prints 14 for debt, 9 for missing health and 72 for judo regardless of
    // the roster. This is whatever `audience-preview` answers.
    render(
      <AnnouncementsScreen
        canPublishStudioWide
        client={makeClient({ audienceSize: vi.fn().mockResolvedValue({ recipient_count: 3 }) })}
        locale="he"
        scopes={SCOPES}
      />,
    )
    await open()
    await waitFor(() => expect(screen.getByTestId('composer-send')).toHaveTextContent('3'))
  })

  it('still asks a lead coach, because the API refuses them the whole club', async () => {
    // The picker is hidden, not deleted. §3.2 — "a lead coach publishes to their own
    // groups" — so `scope_type: 'studio'` from one is a 403, and hiding the picker for
    // them would mean every send failing with an error they cannot act on.
    render(
      <AnnouncementsScreen
        canPublishStudioWide={false}
        client={makeClient()}
        locale="he"
        scopes={SCOPES}
      />,
    )
    await open()
    expect(screen.getByTestId('composer-audience')).toBeInTheDocument()
    expect(screen.getByText(t('he', 'comms.audience.limitedToOwnGroups'))).toBeInTheDocument()
    expect(screen.queryByText(t('he', 'comms.audience.studio'))).toBeNull()
  })

  it('refuses to send until a lead coach has picked one of their groups', async () => {
    render(
      <AnnouncementsScreen
        canPublishStudioWide={false}
        client={makeClient()}
        locale="he"
        scopes={SCOPES}
      />,
    )
    await open()
    await write()
    expect(screen.getByTestId('composer-send')).toBeDisabled()
    await userEvent.click(screen.getByText('מתחילים'))
    await waitFor(() => expect(screen.getByTestId('composer-send')).toBeEnabled())
  })

  it('names ONE channel in a line, because one is live — D7', async () => {
    // The wizard gave the three channels a step and drew two permanently disabled tiles.
    // With the steps gone, the one live channel is a fact about the product rather than a
    // choice a manager makes, so it is a sentence — and two dead tiles are not worth a
    // section on a panel that now has to fit templates, the boxes and the preview.
    render(
      <AnnouncementsScreen canPublishStudioWide client={makeClient()} locale="he" scopes={SCOPES} />,
    )
    await open()
    expect(screen.getByTestId('composer-channels')).toHaveTextContent(
      t('he', 'comms.composer.channelNote'),
    )
    expect(screen.queryByTestId('channel-whatsapp')).toBeNull()
    expect(screen.queryByTestId('channel-sms')).toBeNull()
  })

  it('previews what a lock screen will actually show, truncation included', async () => {
    // §3.12 asks for this by name, and on one surface it is visible WHILE the manager types
    // rather than one step later.
    render(
      <AnnouncementsScreen canPublishStudioWide client={makeClient()} locale="he" scopes={SCOPES} />,
    )
    await open()
    await write('א'.repeat(80), 'מבוטל')
    expect(screen.getByTestId('push-preview')).toBeInTheDocument()
    // The SAME rule the server applies when it builds the push.
    expect(screen.getByTestId('push-preview-title').textContent).toHaveLength(40)
    expect(screen.getByTestId('push-preview-title').textContent?.endsWith('…')).toBe(true)
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
      <AnnouncementsScreen canPublishStudioWide client={makeClient()} locale="he" scopes={SCOPES} />,
    )
    await open()
    await write()
    await userEvent.click(screen.getByTestId('composer-send'))

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
    await open()
    await write()
    await userEvent.click(screen.getByTestId('composer-send'))
    await waitFor(() => expect(publish).toHaveBeenCalledWith('x1'))
  })

  // -- the timed send -------------------------------------------------------------
  //
  // The feed has a מתוזמנות pill because the owner asked to see timed messages there, and a
  // filter for a state nothing can produce is the prototype's hardcoded count in another
  // costume. These four are the seam that makes it produceable: the field, the instant on
  // the wire, the publish that must NOT happen, and the past refused.
  it('sends the chosen moment as an instant, and lets the worker publish it', async () => {
    const create = vi.fn().mockResolvedValue({ ...ANNOUNCEMENT, published_at: null })
    const publish = vi.fn().mockResolvedValue(ANNOUNCEMENT)
    render(
      <AnnouncementsScreen
        canPublishStudioWide
        client={makeClient({ create, publish })}
        locale="he"
        scopes={SCOPES}
      />,
    )
    await open()
    await write()
    await userEvent.click(screen.getByTestId('composer-send-later'))
    await userEvent.type(screen.getByTestId('composer-when-field'), '2030-01-02T18:30')
    await userEvent.click(screen.getByTestId('composer-send'))

    // Local wall-clock in, an instant out — `publish_due` compares against a real moment.
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ scheduled_for: new Date('2030-01-02T18:30').toISOString() }),
      ),
    )
    // And it does NOT go out now. Publishing here would send immediately and leave
    // `scheduled_for` describing something that already happened.
    expect(publish).not.toHaveBeenCalled()
  })

  it('refuses a moment that has already passed, and says why', async () => {
    // `publish_due` sweeps everything whose moment is `<= now`, so a past date does not mean
    // "never" — it means "on the next sweep". A manager who picked last Tuesday would get an
    // immediate broadcast.
    render(
      <AnnouncementsScreen canPublishStudioWide client={makeClient()} locale="he" scopes={SCOPES} />,
    )
    await open()
    await write()
    await userEvent.click(screen.getByTestId('composer-send-later'))
    await userEvent.type(screen.getByTestId('composer-when-field'), '2020-01-02T18:30')
    expect(screen.getByText(t('he', 'comms.composer.pastTime'))).toBeInTheDocument()
    expect(screen.getByTestId('composer-send')).toBeDisabled()
  })

  it('sends now when nothing was timed, and puts no schedule on the wire', async () => {
    const create = vi.fn().mockResolvedValue(ANNOUNCEMENT)
    render(
      <AnnouncementsScreen
        canPublishStudioWide
        client={makeClient({ create })}
        locale="he"
        scopes={SCOPES}
      />,
    )
    await open()
    await write()
    await userEvent.click(screen.getByTestId('composer-send'))
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ scheduled_for: null })),
    )
  })

  it('converts a local wall-clock string to an instant, and refuses nonsense', () => {
    expect(localInputToInstant('2030-01-02T18:30')).toBe(new Date('2030-01-02T18:30').toISOString())
    expect(localInputToInstant('')).toBeNull()
    expect(localInputToInstant('not a date')).toBeNull()
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

    // The roll-call is behind a button as of 2026-09-10: it used to render every family
    // inline at the foot of the announcements screen, one card each with a phone number,
    // under a screen whose job is composing a message. The COUNT stays on the page — that
    // is the fact worth seeing before pressing send — and the names are on demand.
    await userEvent.click(await screen.findByTestId('install-list-open'))

    const row = await screen.findByTestId('not-installed-g9')
    expect(within(row).getByText('יעל כהן')).toBeInTheDocument()
    // A `tel:` link rather than plain text: §5.11 permits no email and no SMS fallback, so
    // calling is the remaining channel and the number should be usable as one.
    expect(within(row).getByRole('link', { name: '054-1234567' })).toHaveAttribute(
      'href',
      'tel:054-1234567',
    )
    // §5.11's reason, still said out loud — now inside the dialog with the list it explains.
    expect(screen.getByText(t('he', 'comms.install.callThem'))).toBeInTheDocument()
  })

  it('keeps the two numbers on the page, and only the names behind the button', async () => {
    // The half of the change that is easy to get wrong: hiding the COUNT with the list
    // would take away the one thing a manager needs before sending, which is how many
    // families will not receive it whatever the delivery report says afterwards.
    const client = makeClient({
      installState: vi.fn().mockResolvedValue({
        installed_count: 19,
        not_installed_count: 1,
        by_platform: { ios: 12, android: 7, web: 0 },
        not_installed: [{ person_id: 'g9', name: 'יעל כהן', phone: '054-1234567' }],
      }),
    })
    render(<InstallState client={client} locale="he" />)

    await screen.findByTestId('install-list-open')
    expect(screen.getByText(/19/)).toBeInTheDocument()
    expect(screen.queryByTestId('not-installed-g9')).toBeNull()
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


// The screen the prototype actually is: a feed, with the composer as a drawer over it.
// The first pass inverted this — the composer was the page and the sent announcements were
// a bare list underneath — which is what these tests exist to stop coming back.
//
// *"He can see in the front page all the history and timed msgs."* Hence the third fixture:
// `published_at` and `scheduled_for` are separate columns because three states matter, and
// the feed is where all three are read.
describe('the feed is the screen', () => {
  const DRAFT = { ...ANNOUNCEMENT, id: 'x2', title: 'טיוטה', published_at: null }
  const TIMED = {
    ...ANNOUNCEMENT,
    id: 'x3',
    title: 'מתוזמנת',
    published_at: null,
    scheduled_for: '2030-01-02T18:30:00Z',
  }

  function renderFeed(over: Partial<DashboardCommsClient> = {}) {
    render(
      <AnnouncementsScreen
        canPublishStudioWide
        client={makeClient({
          list: vi.fn().mockResolvedValue({
            items: [ANNOUNCEMENT, DRAFT, TIMED],
            next_cursor: null,
            has_more: false,
          }),
          ...over,
        })}
        locale="he"
        scopes={SCOPES}
      />,
    )
  }

  it('opens on the feed, with the composer shut', async () => {
    renderFeed()
    expect(await screen.findByTestId('comms-feed')).toBeInTheDocument()
    expect(screen.queryByTestId('announcement-composer')).not.toBeInTheDocument()
    expect(screen.getByTestId('open-composer')).toBeInTheDocument()
  })

  it('draws one card per broadcast, saying which of the three states it is in', async () => {
    renderFeed()
    await screen.findByTestId('comms-feed')
    expect(screen.getByTestId('announcement-x1')).toHaveTextContent(t('he', 'comms.state.published'))
    expect(screen.getByTestId('announcement-x2')).toHaveTextContent(
      t('he', 'comms.announcement.draft'),
    )
    expect(screen.getByTestId('announcement-x3')).toHaveTextContent(t('he', 'comms.state.scheduled'))
  })

  it('says WHEN a timed message goes, not merely that it is timed', async () => {
    // Without the moment the card says "מתוזמן" and leaves a manager to guess whether that
    // means tonight or next month — the one fact a timed row exists to carry.
    renderFeed()
    await screen.findByTestId('comms-feed')
    const when = await screen.findByTestId('scheduled-x3')
    expect(when).toHaveTextContent(t('he', 'comms.announcement.scheduledFor'))
    expect(when).toHaveTextContent(new Date(TIMED.scheduled_for).toLocaleString('he'))
  })

  it('offers a draft and a timed message no delivery report and no retry', async () => {
    // Neither has gone anywhere yet, so there is nothing to report on and nothing to retry.
    renderFeed()
    await screen.findByTestId('comms-feed')
    expect(screen.getByTestId('resend-x1')).toBeInTheDocument()
    expect(screen.getByTestId('delivery-x1')).toBeInTheDocument()
    expect(screen.queryByTestId('resend-x2')).not.toBeInTheDocument()
    expect(screen.queryByTestId('delivery-x2')).not.toBeInTheDocument()
    expect(screen.queryByTestId('resend-x3')).not.toBeInTheDocument()
    expect(screen.queryByTestId('delivery-x3')).not.toBeInTheDocument()
  })

  it('calls a message that has already gone out sent, whatever its schedule says', async () => {
    // A timed row keeps `scheduled_for` after `publish_due` fires it. Reading that as
    // "queued" would offer a manager a state twenty-four phones have already left behind.
    render(
      <AnnouncementsScreen
        canPublishStudioWide
        client={makeClient({
          list: vi.fn().mockResolvedValue({
            items: [{ ...ANNOUNCEMENT, scheduled_for: '2026-11-12T09:00:00Z' }],
            next_cursor: null,
            has_more: false,
          }),
        })}
        locale="he"
        scopes={SCOPES}
      />,
    )
    await screen.findByTestId('comms-feed')
    expect(screen.getByTestId('announcement-x1')).toHaveTextContent(t('he', 'comms.state.published'))
    expect(screen.queryByTestId('scheduled-x1')).not.toBeInTheDocument()
  })

  it('names ONE channel, because one is live — D7', async () => {
    // The prototype shows Push, WhatsApp and SMS badges because it has three. Three here
    // would be three promises, two of them false.
    //
    // Counted rather than named: the WhatsApp and SMS strings were deleted along with the
    // wizard's channel step, so there is no key left to assert the absence of — and
    // asserting a key that does not exist is how this test would go on passing after
    // somebody added a second badge.
    renderFeed()
    await screen.findByTestId('comms-feed')
    const card = screen.getByTestId('announcement-x1')
    expect(within(card).getByText(t('he', 'comms.channel.push'))).toBeInTheDocument()
    expect(card.querySelectorAll('.comms-channel-badge')).toHaveLength(1)
  })

  it('retries the FAILED sends, and says that rather than "send again"', async () => {
    // §3.12: make re-broadcast real with the existing endpoint or leave it out. It is real,
    // but `resend` retries failures only — a button promising a re-broadcast and delivering
    // a retry of five failures is the same lie in the other direction.
    const resend = vi.fn().mockResolvedValue({ retried_count: 2 })
    renderFeed({ resend })
    await screen.findByTestId('comms-feed')
    expect(screen.getByTestId('resend-x1')).toHaveTextContent(t('he', 'comms.card.retryFailed'))
    await userEvent.click(screen.getByTestId('resend-x1'))
    await waitFor(() => expect(resend).toHaveBeenCalledWith('x1'))
  })

  it('copies the body to the clipboard for real, not to a toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    renderFeed()
    await screen.findByTestId('comms-feed')
    await userEvent.click(screen.getByTestId('copy-x1'))
    expect(writeText).toHaveBeenCalledWith(ANNOUNCEMENT.body)
  })
})

describe('the filter bar', () => {
  const DRAFT = { ...ANNOUNCEMENT, id: 'x2', title: 'טיוטה', published_at: null }
  const TIMED = {
    ...ANNOUNCEMENT,
    id: 'x3',
    title: 'מתוזמנת',
    published_at: null,
    scheduled_for: '2030-01-02T18:30:00Z',
  }

  function renderFeed() {
    render(
      <AnnouncementsScreen
        canPublishStudioWide
        client={makeClient({
          list: vi.fn().mockResolvedValue({
            items: [ANNOUNCEMENT, DRAFT, TIMED],
            next_cursor: null,
            has_more: false,
          }),
        })}
        locale="he"
        scopes={SCOPES}
      />,
    )
  }

  it('carries a live count on every pill', async () => {
    renderFeed()
    const bar = within(await screen.findByTestId('comms-filters'))
    expect(bar.getByTestId('comms-filter-all')).toHaveTextContent('3')
    expect(bar.getByTestId('comms-filter-published')).toHaveTextContent('1')
    expect(bar.getByTestId('comms-filter-scheduled')).toHaveTextContent('1')
    expect(bar.getByTestId('comms-filter-draft')).toHaveTextContent('1')
  })

  it('filters for real, and says which pill is chosen through aria-pressed', async () => {
    renderFeed()
    await screen.findByTestId('comms-feed')
    await userEvent.click(screen.getByTestId('comms-filter-draft'))
    expect(screen.getByTestId('comms-filter-draft')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('announcement-x2')).toBeInTheDocument()
    expect(screen.queryByTestId('announcement-x1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('announcement-x3')).not.toBeInTheDocument()
  })

  it('separates a timed message from a draft, which is why there are three pills', async () => {
    // Both are unpublished. Lumping them together would bury a message that IS going out in
    // a list of ones nobody has finished writing.
    renderFeed()
    await screen.findByTestId('comms-feed')
    await userEvent.click(screen.getByTestId('comms-filter-scheduled'))
    expect(screen.getByTestId('announcement-x3')).toBeInTheDocument()
    expect(screen.queryByTestId('announcement-x2')).not.toBeInTheDocument()
  })

  it('searches title and body', async () => {
    renderFeed()
    await screen.findByTestId('comms-feed')
    await userEvent.type(screen.getByTestId('comms-search'), 'טיוטה')
    expect(screen.getByTestId('announcement-x2')).toBeInTheDocument()
    expect(screen.queryByTestId('announcement-x1')).not.toBeInTheDocument()
  })

  it('says a FILTER matched nothing, not that nothing was ever sent', async () => {
    // Two different sentences, and saying the second when the first is true is how a
    // manager concludes their announcements have disappeared.
    renderFeed()
    await screen.findByTestId('comms-feed')
    await userEvent.type(screen.getByTestId('comms-search'), 'משהו שלא קיים')
    expect(screen.getByText(t('he', 'comms.filter.noMatch'))).toBeInTheDocument()
    expect(screen.queryByText(t('he', 'comms.announcement.empty'))).not.toBeInTheDocument()
  })
})

describe('the band of figures', () => {
  it('shows who cannot be reached at all, which is the figure worth seeing BEFORE sending', async () => {
    // §3.12 forbids the prototype's hardcoded "98.4% delivery" and "148 connected" and puts
    // `InstallState`'s real numbers here instead. A family with no app installed receives no
    // push whatever the delivery report says afterwards.
    render(
      <AnnouncementsScreen
        canPublishStudioWide
        client={makeClient({
          installState: vi.fn().mockResolvedValue({
            installed_count: 21,
            not_installed_count: 4,
            by_platform: { ios: 12, android: 9 },
            not_installed: [],
          }),
        })}
        locale="he"
        scopes={SCOPES}
      />,
    )
    expect(await screen.findByTestId('comms-kpi-reachable')).toHaveTextContent('21')
    const unreachable = await screen.findByTestId('comms-kpi-unreachable')
    expect(unreachable).toHaveTextContent('4')
    expect(unreachable).toHaveAttribute('data-tone', 'debt')
  })

  it('counts the timed messages, which is the figure the drafts card used to hold', async () => {
    render(
      <AnnouncementsScreen
        canPublishStudioWide
        client={makeClient({
          list: vi.fn().mockResolvedValue({
            items: [{ ...ANNOUNCEMENT, id: 'x3', published_at: null, scheduled_for: '2030-01-02T18:30:00Z' }],
            next_cursor: null,
            has_more: false,
          }),
        })}
        locale="he"
        scopes={SCOPES}
      />,
    )
    const kpi = await screen.findByTestId('comms-kpi-scheduled')
    expect(kpi).toHaveTextContent('1')
    expect(kpi).toHaveAttribute('data-tone', 'pending')
  })

  it('carries no invented delivery rate', async () => {
    render(
      <AnnouncementsScreen canPublishStudioWide client={makeClient()} locale="he" scopes={SCOPES} />,
    )
    await screen.findByTestId('comms-kpis')
    expect(document.body.textContent ?? '').not.toMatch(/98\.4|%/)
  })

  it('renders the feed even when the install state cannot be read', async () => {
    // Best-effort: this band must never be the reason the screen does not render.
    render(
      <AnnouncementsScreen
        canPublishStudioWide
        client={makeClient({
          installState: vi.fn().mockRejectedValue(new Error('500')),
        })}
        locale="he"
        scopes={SCOPES}
      />,
    )
    expect(await screen.findByTestId('comms-feed')).toBeInTheDocument()
  })
})
