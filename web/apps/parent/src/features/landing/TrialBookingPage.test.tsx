// Door A on one page. The tests the spec's §8 asks for, in its own order.
//
// **The seam test is the first one and the one that matters.** CLAUDE.md: "A field added
// to an API is not proven by a test that constructs the component's props by hand."
// Everything below drives the REAL form -- typing, clicking chips, pressing the health
// preset, ticking the box -- and asserts the body handed to `client.book`. A field
// dropped between the form and the request passes every props-level test there is.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { TrialBookingPage, groupFitsAge } from './TrialBookingPage'
import type { LandingClient, PublicGroup, TrialSlot } from './landingClient'

/** Fixed, so `isMinor`/`ageFrom`/`declared_at` are the same number on every machine and
 *  in every month this suite is ever run. */
const TODAY = new Date('2026-09-08T09:00:00Z')

const GROUPS: PublicGroup[] = [
  { id: 'g1', name: 'מתחילים', description: null, age_min: 5, age_max: 8, training_weekdays: [0, 3] },
  { id: 'g2', name: 'נבחרת', description: null, age_min: 12, age_max: 16, training_weekdays: [1] },
  // No range at all -- the group an adult can book, and the case `groupFitsAge` lets through.
  { id: 'g3', name: 'בוגרים', description: null, age_min: null, age_max: null, training_weekdays: [2] },
]

const SLOTS: Record<string, TrialSlot[]> = {
  g1: [
    {
      session_id: 's1',
      group_id: 'g1',
      group_name: 'מתחילים',
      starts_at: '2026-09-13T14:00:00Z',
      ends_at: '2026-09-13T15:00:00Z',
      location_name: null,
      is_bookable: true,
    },
  ],
  g3: [
    {
      session_id: 's3',
      group_id: 'g3',
      group_name: 'בוגרים',
      starts_at: '2026-09-15T18:00:00Z',
      ends_at: '2026-09-15T19:00:00Z',
      location_name: null,
      is_bookable: true,
    },
  ],
}

const HEALTH_SCHEMA = {
  sections: [
    {
      id: 'medical_history',
      title: 'רקע רפואי',
      questions: [
        { id: 'asthma', type: 'boolean' as const, label: 'אסתמה', flag: true },
        { id: 'chronic', type: 'boolean' as const, label: 'מחלה כרונית' },
      ],
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
      questions: [{ id: 'clause_confirmed', type: 'clause' as const, label: 'אני מאשר/ת' }],
    },
  ],
}

function makeClient(...bookResponses: Response[]): LandingClient {
  const queue = bookResponses.length
    ? [...bookResponses]
    : [new Response(JSON.stringify({ students: [], bookings: [] }), { status: 201 })]
  return {
    landing: vi.fn(),
    trialSlots: vi.fn((groupId: string) => Promise.resolve({ items: SLOTS[groupId] ?? [] })),
    book: vi.fn(() => Promise.resolve(queue.length > 1 ? queue.shift()! : queue[0]!)),
  } as unknown as LandingClient
}

/** The public health template is read through `apiFetch`, which the page builds itself
 *  (it is not injected -- `BookingFlow` did the same). Every test therefore needs a
 *  global `fetch` that answers the one public endpoint. */
function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/v1/public/studios/demo-club/health-template')) {
        return new Response(
          JSON.stringify({ id: 'tmpl1', kind: 'full', version: 2, schema: HEALTH_SCHEMA }),
          { status: 200 },
        )
      }
      return new Response('', { status: 404 })
    }),
  )
}

function bookBody(client: LandingClient): Record<string, unknown> {
  return (client.book as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<
    string,
    unknown
  >
}

type Page = { client?: LandingClient; signedIn?: boolean; initialGroupId?: string | null }

function renderPage({ client = makeClient(), signedIn, initialGroupId }: Page = {}) {
  render(
    <TrialBookingPage
      address="הרצל 1, רמלה"
      client={client}
      groups={GROUPS}
      initialGroupId={initialGroupId ?? null}
      locale="he"
      phone="0501112222"
      signedIn={signedIn}
      slug="demo-club"
      today={TODAY}
    />,
  )
  return client
}

async function fillTrainee(
  user: ReturnType<typeof userEvent.setup>,
  index: number,
  fields: { first: string; last: string; birthdate: string; group?: string; slot?: string },
) {
  const card = screen.getByTestId(`trial-trainee-${index}`)
  await user.type(within(card).getByLabelText(/שם פרטי/), fields.first)
  await user.type(within(card).getByLabelText(/שם משפחה/), fields.last)
  // A `type="date"` input is set, not typed: jsdom accepts the ISO value directly and a
  // keystroke-by-keystroke type depends on the locale of the test runner's date widget.
  fireEvent.change(within(card).getByLabelText(/תאריך לידה/), {
    target: { value: fields.birthdate },
  })
  if (fields.group) await user.click(within(card).getByTestId(`trial-group-${index}-${fields.group}`))
  if (fields.slot) {
    await user.click(await within(card).findByTestId(`trial-slot-${index}-${fields.slot}`))
  }
}

async function fillContact(
  user: ReturnType<typeof userEvent.setup>,
  testId: string,
  values: { name?: string; phone: string; email: string },
) {
  const block = screen.getByTestId(testId)
  if (values.name !== undefined) {
    await user.type(within(block).getByLabelText(/שם ההורה/), values.name)
  }
  await user.type(within(block).getByLabelText(/טלפון/), values.phone)
  await user.type(within(block).getByLabelText(/אימייל/), values.email)
}

beforeEach(() => {
  stubFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('groupFitsAge', () => {
  it('is true when the group sets no age range, or the birthdate is blank', () => {
    expect(groupFitsAge(GROUPS[2]!, '2018-01-01', TODAY)).toBe(true)
    expect(groupFitsAge(GROUPS[0]!, '', TODAY)).toBe(true)
  })

  it('excludes a trainee outside the group range', () => {
    expect(groupFitsAge(GROUPS[1]!, '2019-04-01', TODAY)).toBe(false)
  })
})

describe('the seam -- what the form actually sends', () => {
  it('posts one write: guardian, the child with its group and slot, one declaration, the tick', async () => {
    const user = userEvent.setup()
    const client = renderPage()
    await screen.findByTestId('trial-booking-page')

    await fillTrainee(user, 0, {
      first: 'יעל',
      last: 'כהן',
      birthdate: '2019-04-01',
      group: 'g1',
      slot: 's1',
    })
    // One press. The questions are never shown, and the phone below is typed AFTER it --
    // the emergency answer is resolved at submit, not frozen at the moment of the press.
    await user.click(await screen.findByTestId('trial-health-allgood-0'))
    await fillContact(user, 'trial-parent-block', {
      name: 'רותי כהן',
      phone: '0501234567',
      email: 'ruti@example.invalid',
    })
    await user.click(screen.getByTestId('trial-consent'))
    await user.click(screen.getByTestId('trial-submit'))

    await waitFor(() => expect(client.book).toHaveBeenCalledTimes(1))
    const body = bookBody(client)
    expect(body.guardian).toEqual({
      first_name: 'רותי',
      last_name: 'כהן',
      email: 'ruti@example.invalid',
      phone: '0501234567',
    })
    expect(body.children).toEqual([
      {
        first_name: 'יעל',
        last_name: 'כהן',
        birthdate: '2019-04-01',
        group_id: 'g1',
        session_id: 's1',
      },
    ])
    const declarations = body.trial_health_declarations as Record<string, unknown>[]
    expect(declarations).toHaveLength(1)
    expect(declarations[0]!.template_id).toBe('tmpl1')
    expect(declarations[0]!.answers).toMatchObject({
      asthma: false,
      chronic: false,
      emergency_contact: '0501234567',
    })
    // The pad is gone from this door, and this is the assertion that keeps it gone.
    expect(declarations[0]!.signature_image_base64).toBe('')
    expect(declarations[0]!.declared_by).toBe('רותי כהן')
    expect(declarations[0]!.declared_at).toBe(TODAY.toISOString())
    expect(body.agreements_accepted).toBe(true)
  }, 20000)
})

describe('the birthdate decides the shape of the form', () => {
  it('asks for nobody’s contact details until the birthdate says whose', async () => {
    // `isMinor('')` is `true` by design -- an unknown age counts as a minor wherever a
    // safety decision turns on it. That default must not reach the screen: a fresh form
    // used to open with the PARENT block already drawn, asking for a guardian's name and
    // phone before a birthdate existed to say a guardian was even involved (owner,
    // 2026-09-08). Neither block belongs there until the date decides which one it is.
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('trial-booking-page')

    expect(screen.queryByTestId('trial-parent-block')).toBeNull()
    expect(screen.queryByTestId('trial-own-contact')).toBeNull()

    // And it is the birthdate that reveals it -- a name alone still says nothing about age.
    await fillTrainee(user, 0, { first: 'יעל', last: 'כהן', birthdate: '' })
    expect(screen.queryByTestId('trial-parent-block')).toBeNull()

    await fillTrainee(user, 0, { first: 'יעל', last: 'כהן', birthdate: '2019-04-01' })
    expect(screen.getByTestId('trial-parent-block')).toBeInTheDocument()
  })

  it('renders the parent block for a minor, announced', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('trial-booking-page')
    await fillTrainee(user, 0, { first: 'יעל', last: 'כהן', birthdate: '2019-04-01' })

    expect(screen.getByTestId('trial-parent-block')).toBeInTheDocument()
    expect(screen.queryByTestId('trial-own-contact')).toBeNull()
    // §7 -- "announced, not just drawn".
    expect(screen.getByTestId('trial-minor-band')).toHaveAttribute('role', 'status')
  })

  it('asks an 18+ trainee for their own phone and email, and sends those as the guardian', async () => {
    const user = userEvent.setup()
    const client = renderPage()
    await screen.findByTestId('trial-booking-page')
    await fillTrainee(user, 0, {
      first: 'דן',
      last: 'לוי',
      birthdate: '2000-05-05',
      group: 'g3',
      slot: 's3',
    })

    expect(screen.queryByTestId('trial-parent-block')).toBeNull()
    expect(screen.queryByTestId('trial-minor-band')).toBeNull()

    await user.click(await screen.findByTestId('trial-health-allgood-0'))
    await fillContact(user, 'trial-own-contact', {
      phone: '0509998888',
      email: 'dan@example.invalid',
    })
    await user.click(screen.getByTestId('trial-consent'))
    await user.click(screen.getByTestId('trial-submit'))

    await waitFor(() => expect(client.book).toHaveBeenCalledTimes(1))
    expect(bookBody(client).guardian).toEqual({
      first_name: 'דן',
      last_name: 'לוי',
      email: 'dan@example.invalid',
      phone: '0509998888',
    })
  }, 20000)
})

describe('a second trainee', () => {
  it('inherits the first trainee’s parent details and can change them', async () => {
    const user = userEvent.setup()
    const client = renderPage()
    await screen.findByTestId('trial-booking-page')

    await fillTrainee(user, 0, {
      first: 'יעל',
      last: 'כהן',
      birthdate: '2019-04-01',
      group: 'g1',
      slot: 's1',
    })
    await user.click(await screen.findByTestId('trial-health-allgood-0'))
    await fillContact(user, 'trial-parent-block', {
      name: 'רותי כהן',
      phone: '0501234567',
      email: 'ruti@example.invalid',
    })

    await user.click(screen.getByTestId('trial-add-trainee'))
    await fillTrainee(user, 1, {
      first: 'איתי',
      last: 'כהן',
      birthdate: '2018-02-02',
      group: 'g1',
      slot: 's1',
    })
    await user.click(await screen.findByTestId('trial-health-allgood-1'))

    // Carried, not asked again -- and it names who it was carried from.
    const carried = screen.getByTestId('trial-parent-carried-1')
    expect(carried).toHaveTextContent('יעל')
    expect(within(screen.getByTestId('trial-trainee-1')).queryByLabelText(/שם ההורה/)).toBeNull()

    // "with the option to change it" -- the same shared state, prefilled.
    await user.click(screen.getByTestId('trial-parent-change-1'))
    const field = within(screen.getByTestId('trial-trainee-1')).getByLabelText(/שם ההורה/)
    expect(field).toHaveValue('רותי כהן')
    await user.clear(field)
    await user.type(field, 'משה כהן')

    await user.click(screen.getByTestId('trial-consent'))
    await user.click(screen.getByTestId('trial-submit'))

    await waitFor(() => expect(client.book).toHaveBeenCalledTimes(1))
    const body = bookBody(client)
    // One contact per booking (spec §3), and it is the changed one.
    expect(body.guardian).toMatchObject({ first_name: 'משה', last_name: 'כהן' })
    expect(body.children).toHaveLength(2)
    expect(body.trial_health_declarations).toHaveLength(2)
  }, 30000)
})

describe('groups are filtered, never hidden', () => {
  it('renders an age-unfit group disabled with the reason, and it cannot be chosen', async () => {
    const user = userEvent.setup()
    const client = renderPage()
    await screen.findByTestId('trial-booking-page')
    await fillTrainee(user, 0, { first: 'יעל', last: 'כהן', birthdate: '2019-04-01' })

    const card = screen.getByTestId('trial-trainee-0')
    const unfit = within(card).getByTestId('trial-group-0-g2')
    // Visible, with the reason on the chip -- a parent who cannot see a group cannot tell
    // whether it exists.
    expect(within(card).getByText(/נבחרת/)).toBeInTheDocument()
    expect(within(card).getByText(new RegExp(t('he', 'people.landing.tooYoung')))).toBeInTheDocument()
    expect(unfit).toBeDisabled()

    await user.click(unfit)
    expect(unfit).not.toBeChecked()
    expect(client.trialSlots).not.toHaveBeenCalledWith('g2')
  })
})

describe('the health declaration', () => {
  it('shows no questions for הכל תקין, and reveals them for יש מה לדווח', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('trial-booking-page')
    await fillTrainee(user, 0, { first: 'יעל', last: 'כהן', birthdate: '2019-04-01' })

    await user.click(await screen.findByTestId('trial-health-allgood-0'))
    expect(screen.queryByRole('group', { name: 'אסתמה' })).toBeNull()

    await user.click(screen.getByTestId('trial-health-report-0'))
    const question = screen.getByRole('group', { name: 'אסתמה' })
    expect(question).toBeInTheDocument()
    await user.click(within(question).getByRole('radio', { name: t('he', 'health.declaration.yes') }))
    expect(within(question).getByRole('radio', { name: t('he', 'health.declaration.yes') })).toBeChecked()
  }, 20000)

  it('sends the answers a reporting family actually gave', async () => {
    const user = userEvent.setup()
    const client = renderPage()
    await screen.findByTestId('trial-booking-page')
    await fillTrainee(user, 0, {
      first: 'יעל',
      last: 'כהן',
      birthdate: '2019-04-01',
      group: 'g1',
      slot: 's1',
    })
    await user.click(await screen.findByTestId('trial-health-report-0'))
    for (const [label, answer] of [
      ['אסתמה', t('he', 'health.declaration.yes')],
      ['מחלה כרונית', t('he', 'health.declaration.no')],
    ] as const) {
      await user.click(
        within(screen.getByRole('group', { name: label })).getByRole('radio', { name: answer }),
      )
    }
    await user.type(screen.getByLabelText('טלפון חירום'), '0521111111')
    await fillContact(user, 'trial-parent-block', {
      name: 'רותי כהן',
      phone: '0501234567',
      email: 'ruti@example.invalid',
    })
    await user.click(screen.getByTestId('trial-consent'))
    await user.click(screen.getByTestId('trial-submit'))

    await waitFor(() => expect(client.book).toHaveBeenCalledTimes(1))
    const declaration = (bookBody(client).trial_health_declarations as Record<string, unknown>[])[0]!
    expect(declaration.answers).toMatchObject({
      asthma: true,
      chronic: false,
      // Typed here, so the contact phone must NOT overwrite it.
      emergency_contact: '0521111111',
    })
    expect(declaration.signature_image_base64).toBe('')
  }, 30000)
})

describe('a signed-in caller', () => {
  it('is asked nothing about themselves, and no guardian key is sent', async () => {
    const user = userEvent.setup()
    const client = renderPage({ signedIn: true })
    await screen.findByTestId('trial-booking-page')
    await fillTrainee(user, 0, {
      first: 'יעל',
      last: 'כהן',
      birthdate: '2019-04-01',
      group: 'g1',
      slot: 's1',
    })
    expect(screen.queryByTestId('trial-parent-block')).toBeNull()
    expect(screen.queryByTestId('trial-own-contact')).toBeNull()
    expect(screen.queryByTestId('trial-minor-band')).toBeNull()

    await user.click(await screen.findByTestId('trial-health-allgood-0'))
    await user.click(screen.getByTestId('trial-consent'))
    await user.click(screen.getByTestId('trial-submit'))

    await waitFor(() => expect(client.book).toHaveBeenCalledTimes(1))
    expect('guardian' in bookBody(client)).toBe(false)
  }, 20000)
})

describe('a failed write', () => {
  it('renders the reason on the page with a retry, and the retry books', async () => {
    const user = userEvent.setup()
    const client = renderPage({
      client: makeClient(
        new Response(JSON.stringify({ detail: { code: 'too_many_bookings' } }), { status: 429 }),
        new Response(
          JSON.stringify({
            studio_slug: 'demo-club',
            studio_name: 'מועדון הדגמה',
            students: [{ id: 'st1', first_name: 'יעל', last_name: 'כהן' }],
            bookings: [
              {
                student_id: 'st1',
                student_display_name: 'יעל כהן',
                group_name: 'מתחילים',
                session_starts_at: '2026-09-13T14:00:00Z',
              },
            ],
          }),
          { status: 201 },
        ),
      ),
    })
    await screen.findByTestId('trial-booking-page')
    await fillTrainee(user, 0, {
      first: 'יעל',
      last: 'כהן',
      birthdate: '2019-04-01',
      group: 'g1',
      slot: 's1',
    })
    await user.click(await screen.findByTestId('trial-health-allgood-0'))
    await fillContact(user, 'trial-parent-block', {
      name: 'רותי כהן',
      phone: '0501234567',
      email: 'ruti@example.invalid',
    })
    await user.click(screen.getByTestId('trial-consent'))
    await user.click(screen.getByTestId('trial-submit'))

    const error = await screen.findByTestId('trial-error')
    expect(error).toHaveTextContent(t('he', 'people.landing.rateLimited'))
    // Never a dead end: the form is still on screen, filled, with a way forward.
    expect(screen.getByTestId('trial-trainee-0')).toBeInTheDocument()

    await user.click(screen.getByTestId('trial-retry'))
    await waitFor(() => expect(client.book).toHaveBeenCalledTimes(2))
    await screen.findByTestId('booking-confirmed')
  }, 30000)
})

describe('validation before anything is sent', () => {
  it('refuses an empty form, names what is missing, and posts nothing', async () => {
    const user = userEvent.setup()
    const client = renderPage()
    await screen.findByTestId('trial-booking-page')
    await user.click(screen.getByTestId('trial-submit'))

    expect(await screen.findByText(t('he', 'people.bookTrial.error.firstName'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'people.bookTrial.error.consent'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'people.bookTrial.error.health'))).toBeInTheDocument()
    expect(client.book).not.toHaveBeenCalled()
  })
})
