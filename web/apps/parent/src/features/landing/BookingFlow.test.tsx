// §3 Door A (`/t/<slug>`) -- the trial link, rebuilt onto the shared wizard.
//
// The four tests that matter most (spec's own "failing tests first" list): F21 (the
// real health answers travel, never a hardcoded literal), decision 8's narrower field
// set (no ת.ז., no address; slot lives in the panel, filtered by the group chosen
// directly above it), decision 9 (an adult training alone never meets a "children"
// step), and decision 5 (an anonymous booking still records all three agreements).
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { BookingFlow, groupFitsAge } from './BookingFlow'
import type { LandingClient, PublicGroup, TrialSlot } from './landingClient'

const GROUPS: PublicGroup[] = [
  {
    id: 'g1',
    name: 'מתחילים',
    description: null,
    age_min: 5,
    age_max: 8,
    training_weekdays: [0, 3],
  },
  {
    id: 'g2',
    name: 'נבחרת',
    description: null,
    age_min: 12,
    age_max: 16,
    training_weekdays: [1],
  },
]

const SLOTS: TrialSlot[] = [
  {
    session_id: 's1',
    group_id: 'g1',
    group_name: 'מתחילים',
    starts_at: '2026-09-06T14:00:00Z',
    ends_at: '2026-09-06T15:00:00Z',
    location_name: null,
    is_bookable: true,
  },
]

const HEALTH_SCHEMA = {
  sections: [
    {
      id: 'medical_history',
      title: 'רקע רפואי',
      questions: [{ id: 'asthma', type: 'boolean' as const, label: 'אסתמה', flag: true }],
    },
    {
      id: 'other',
      title: 'נוסף',
      questions: [
        { id: 'emergency_contact', type: 'phone' as const, label: 'טלפון חירום', required: true },
      ],
    },
    {
      id: 'declaration',
      title: 'הצהרה',
      questions: [
        { id: 'clause_confirmed', type: 'clause' as const, label: 'אני מאשר/ת', required: true },
      ],
    },
  ],
}

function makeClient(bookResponse = new Response(JSON.stringify({ students: [], bookings: [] }), { status: 201 })): LandingClient {
  return {
    landing: vi.fn(),
    trialSlots: vi.fn(() => Promise.resolve({ items: SLOTS })),
    book: vi.fn(() => Promise.resolve(bookResponse)),
  } as unknown as LandingClient
}

/** `privacyClient`/the public health client are both built INSIDE `BookingFlow` now
 *  (constructed from `apiFetch`, not injected) -- every test needs `global.fetch` to
 *  answer `/api/v1/public/studios/{slug}/health-template` for the health step to load,
 *  and may leave `/api/v1/privacy/consents` unhandled (falls back to `state: null`,
 *  the same "a failed read still lets a family continue" path `JoinWelcomeStep`
 *  already has a test for). */
function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/v1/public/studios/demo-club/health-template')) {
        return new Response(
          JSON.stringify({ id: 'tmpl1', kind: 'full', version: 1, schema: HEALTH_SCHEMA }),
          { status: 200 },
        )
      }
      return new Response('', { status: 401 })
    }),
  )
}

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    strokeStyle: '',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillText: vi.fn(),
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,AAAA')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function acceptAgreements(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByTestId('join-welcome')
  await user.click(screen.getByTestId('join-welcome-terms-check'))
  await user.click(screen.getByTestId('join-welcome-privacy-check'))
  await user.click(screen.getByTestId('join-welcome-club-check'))
  await user.click(screen.getByTestId('join-welcome-continue'))
}

async function signHealthy(
  user: ReturnType<typeof userEvent.setup>,
  emergencyPhone: string,
) {
  await screen.findByTestId('health-opening-question')
  await user.click(screen.getByTestId('health-opening-healthy'))
  await user.type(screen.getByLabelText(t('he', 'health.declaration.signatureTyped')), 'רותי מזרחי')
  await user.type(screen.getByLabelText('טלפון חירום'), emergencyPhone)
  await user.click(screen.getByRole('checkbox', { name: /אני מאשר/ }))
  await user.click(screen.getByTestId('health-sign-continue'))
}

describe('groupFitsAge', () => {
  it('is true when the group sets no age range, or the birthdate is blank', () => {
    const noRange: PublicGroup = { ...GROUPS[0]!, age_min: null, age_max: null }
    expect(groupFitsAge(noRange, '2018-01-01', new Date(2026, 8, 3))).toBe(true)
    expect(groupFitsAge(GROUPS[0]!, '', new Date(2026, 8, 3))).toBe(true)
  })

  it('excludes a child outside the group range', () => {
    expect(groupFitsAge(GROUPS[0]!, '2000-01-01', new Date(2026, 8, 3))).toBe(false)
  })
})

describe('Door A -- decision 5: the welcome step and its three agreements', () => {
  it('shows all three cards before the students step, deferred (no network write)', async () => {
    stubFetch()
    const user = userEvent.setup()
    render(<BookingFlow client={makeClient()} groups={GROUPS} locale="he" slug="demo-club" />)
    await screen.findByTestId('join-welcome')
    expect(screen.getByTestId('join-welcome-terms-check')).toBeInTheDocument()
    expect(screen.getByTestId('join-welcome-privacy-check')).toBeInTheDocument()
    expect(screen.getByTestId('join-welcome-club-check')).toBeInTheDocument()
    await acceptAgreements(user)
    await screen.findByTestId('booking-students-step')
  })
})

describe('Door A -- decision 8: the trial field set', () => {
  it('asks no ת.ז. and no address anywhere in the students step', async () => {
    stubFetch()
    const user = userEvent.setup()
    render(<BookingFlow client={makeClient()} groups={GROUPS} locale="he" slug="demo-club" />)
    await acceptAgreements(user)
    await screen.findByTestId('booking-students-step')
    expect(screen.queryByLabelText(t('he', 'people.join.nationalId'))).toBeNull()
    expect(screen.queryByLabelText(t('he', 'people.join.address'))).toBeNull()
  })

  it('the slot list is filtered by the group chosen directly above it, inside the same panel', async () => {
    stubFetch()
    const user = userEvent.setup()
    const client = makeClient()
    render(<BookingFlow client={client} groups={GROUPS} locale="he" slug="demo-club" />)
    await acceptAgreements(user)
    const panel = await screen.findByTestId(/^booking-row-panel-/)
    await user.type(within(panel).getByTestId('booking-row-name-0'), 'נועה כהן')
    await user.type(within(panel).getByTestId('booking-row-birthdate-0'), '2019-04-01')
    await user.click(within(panel).getByTestId('booking-row-group-0-g1'))

    await waitFor(() => expect(client.trialSlots).toHaveBeenCalledWith('g1'))
    // The slot picker lives INSIDE this same row, not a fourth screen.
    await within(panel).findByTestId('booking-row-slots-0')
  }, 20000)
})

describe('Door A -- decision 9: no "you and children" split', () => {
  it('an adult booking a trial for themselves never meets a children-specific step', async () => {
    stubFetch()
    const user = userEvent.setup()
    render(<BookingFlow client={makeClient()} groups={GROUPS} locale="he" slug="demo-club" />)
    await acceptAgreements(user)
    await screen.findByTestId('booking-students-step')

    // Remove the default child row and add themselves instead -- one list, one option.
    await user.click(screen.getByTestId('booking-add-self'))
    expect(screen.queryByTestId('booking-you')).toBeNull()
    expect(screen.queryByTestId('booking-children')).toBeNull()
    // The self row shows no "full name" field of its own (decision 9: it reuses the
    // contact block's name) -- only a group and a birthdate.
    const selfPanel = screen.getAllByTestId(/^booking-row-panel-/)[1]!
    expect(within(selfPanel).queryByTestId('booking-row-name-1')).toBeNull()
  })
})

describe('F21 -- the trial declaration carries the real answers, never a hardcoded literal', () => {
  it('posts the actual per-child template/answers/signature, and agreements_accepted for the anonymous lead', async () => {
    stubFetch()
    const user = userEvent.setup()
    const client = makeClient()
    render(
      <BookingFlow client={client} groups={GROUPS} initialGroupId="g1" locale="he" slug="demo-club" />,
    )
    await acceptAgreements(user)
    await screen.findByTestId('booking-students-step')

    await user.type(screen.getByTestId('booking-contact-first-name'), 'רותי')
    await user.type(screen.getByTestId('booking-contact-last-name'), 'מזרחי')
    await user.type(screen.getByTestId('booking-contact-email'), 'ruti@example.invalid')

    const panel = await screen.findByTestId(/^booking-row-panel-/)
    await user.type(within(panel).getByTestId('booking-row-name-0'), 'דנה מזרחי')
    await user.type(within(panel).getByTestId('booking-row-birthdate-0'), '2019-04-01')
    await user.click(within(panel).getByTestId('booking-row-group-0-g1'))
    await waitFor(() => expect(client.trialSlots).toHaveBeenCalled())

    await user.click(screen.getByTestId('booking-to-health'))

    // The REAL declaration: answer "yes, something to report" so the payload carries
    // more than a bare confirmation, then sign.
    await screen.findByTestId('health-opening-question')
    await user.click(screen.getByTestId('health-opening-reporting'))
    // A boolean question is a yes/no radiogroup legended with its own label, not a
    // checkbox -- `SegmentedControl`'s own shape.
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'אסתמה' })).getByRole('radio', {
        name: t('he', 'health.declaration.yes'),
      }),
    )
    await user.type(screen.getByLabelText(t('he', 'health.declaration.signatureTyped')), 'רותי מזרחי')
    await user.type(screen.getByLabelText('טלפון חירום'), '0501234567')
    await user.click(screen.getByRole('checkbox', { name: /אני מאשר/ }))
    await user.click(screen.getByTestId('health-sign-continue'))

    await waitFor(() => expect(client.book).toHaveBeenCalledTimes(1))
    const body = (client.book as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(body.agreements_accepted).toBe(true)
    expect(body.guardian).toMatchObject({ first_name: 'רותי', last_name: 'מזרחי' })
    expect(body.trial_health_declarations).toHaveLength(1)
    const declaration = body.trial_health_declarations[0]
    // Never the old hardcoded literal.
    expect(declaration).not.toEqual({ confirmed: true })
    expect(declaration.template_id).toBe('tmpl1')
    expect(declaration.answers.asthma).toBe(true)
    expect(declaration.answers.emergency_contact).toBe('0501234567')
    expect(declaration.signature_image_base64).toBeTruthy()
  }, 20000)
})

describe('Door A -- the ordinary healthy-child path reaches confirmation', () => {
  it('books, through the real slot and the real health popup', async () => {
    stubFetch()
    const user = userEvent.setup()
    const client = makeClient(
      new Response(
        JSON.stringify({
          studio_slug: 'demo-club',
          studio_name: 'מועדון הדגמה',
          students: [{ id: 'st1', first_name: 'נועה', last_name: 'כהן' }],
          bookings: [
            { student_id: 'st1', student_display_name: 'נועה כהן', group_name: 'מתחילים', session_starts_at: '2026-09-06T14:00:00Z' },
          ],
        }),
        { status: 201 },
      ),
    )
    render(
      <BookingFlow client={client} groups={GROUPS} initialGroupId="g1" locale="he" slug="demo-club" />,
    )
    await acceptAgreements(user)
    await user.type(screen.getByTestId('booking-contact-first-name'), 'רותי')
    await user.type(screen.getByTestId('booking-contact-last-name'), 'מזרחי')
    await user.type(screen.getByTestId('booking-contact-email'), 'ruti@example.invalid')

    const panel = await screen.findByTestId(/^booking-row-panel-/)
    await user.type(within(panel).getByTestId('booking-row-name-0'), 'נועה כהן')
    await user.type(within(panel).getByTestId('booking-row-birthdate-0'), '2019-04-01')
    await user.click(within(panel).getByTestId('booking-row-group-0-g1'))
    await within(panel).findByTestId('booking-row-slots-0')
    await user.click(screen.getByTestId('booking-to-health'))

    await signHealthy(user, '0501234567')

    await waitFor(() => expect(client.book).toHaveBeenCalledTimes(1))
    await screen.findByText('נועה כהן')
  }, 20000)
})
