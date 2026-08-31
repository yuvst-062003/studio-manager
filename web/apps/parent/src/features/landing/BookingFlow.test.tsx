// §5.4a's booking flow, in its stated order. The first test is the one that matters:
// sign-in comes BEFORE any child detail is typed, and getting that backwards throws away
// everything a parent entered.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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
  {
    session_id: 's2',
    group_id: 'g1',
    group_name: 'מתחילים',
    starts_at: '2026-09-09T14:00:00Z',
    ends_at: '2026-09-09T15:00:00Z',
    location_name: null,
    is_bookable: false,
  },
]

const SQUAD_SLOTS: TrialSlot[] = [
  {
    session_id: 's9',
    group_id: 'g2',
    group_name: 'נבחרת',
    starts_at: '2026-09-07T18:00:00Z',
    ends_at: '2026-09-07T19:30:00Z',
    location_name: null,
    is_bookable: true,
  },
]

function makeClient(bookResponse = new Response(null, { status: 201 })): LandingClient {
  return {
    landing: vi.fn(),
    // Keyed by group, because §5.4a step 4 is 'the next N upcoming sessions of EACH
    // chosen group'. A stub that ignores the group id cannot fail the sibling case.
    trialSlots: vi.fn((groupId: string) =>
      Promise.resolve({ items: groupId === 'g2' ? SQUAD_SLOTS : SLOTS }),
    ),
    book: vi.fn(() => Promise.resolve(bookResponse)),
  } as unknown as LandingClient
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** The chip's real radio, addressed through the per-child wrapper and the option id —
 *  the picker is L2's SlotChips now, and its inputs carry no per-slot testid. */
function slotRadio(child: number, session: string): HTMLInputElement | null {
  const wrapper = screen.queryByTestId(`booking-slot-child-${child}`)
  return wrapper?.querySelector(`[data-option-id="${session}"] input`) ?? null
}

async function fillOneChild(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(t('he', 'people.student.firstName')), 'נועה')
  await user.type(screen.getByLabelText(t('he', 'people.student.lastName')), 'לוי')
  await user.selectOptions(screen.getByTestId('booking-group-0'), 'g1')
}

describe('BookingFlow — §5.4a steps 1-4', () => {
  // Step 1 was a SIGN-IN WALL until 2026-08-31. §5.4a's "authenticate before entering
  // child details" was written to stop a parent typing a whole form and losing it at a
  // login prompt — but it bought that by charging a Google account for the only
  // self-service door in the product, and a parent who did not want one could not book at
  // all. The ordering it protects is kept: who-you-are still comes first, it is just a
  // form now, the way every other club takes a booking.
  it('step 1 asks who is booking, and no child form exists until it is answered', async () => {
    render(<BookingFlow slug="judo" locale="he" client={makeClient()} groups={GROUPS} />)
    expect(screen.getByTestId('booking-you')).toBeInTheDocument()
    expect(screen.queryByTestId('booking-children')).toBeNull()
    expect(screen.getByTestId('booking-to-children')).toBeDisabled()
  })

  it('needs a name and a plausible address before it will go on', async () => {
    // The address is the whole point of the step: it is how the club replies, and how
    // §6.1 step 3 attaches this booking if the family signs in later.
    const user = userEvent.setup()
    render(<BookingFlow slug="judo" locale="he" client={makeClient()} groups={GROUPS} />)
    await user.type(screen.getByTestId('booking-you-first-name'), 'רונית')
    expect(screen.getByTestId('booking-to-children')).toBeDisabled()

    await user.type(screen.getByTestId('booking-you-email'), 'ronit@')
    expect(screen.getByTestId('booking-to-children')).toBeDisabled()

    await user.type(screen.getByTestId('booking-you-email'), 'example.test')
    expect(screen.getByTestId('booking-to-children')).toBeEnabled()
  })

  it('still offers sign-in, as a shortcut rather than a gate', async () => {
    // A family that already has an account should reach their own record instead of
    // creating a second lead. `return_path` brings them back to THIS club, carrying the
    // picked group, so the round trip does not drop them on a generic home screen.
    render(<BookingFlow slug="judo-tel-aviv" locale="he" client={makeClient()} groups={GROUPS} />)
    const link = screen.getByTestId('booking-sign-in-link')
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining(encodeURIComponent('/t/judo-tel-aviv')),
    )
    expect(link).toHaveAccessibleName(t('he', 'people.landing.signInInstead'))
  })

  // The whole flow sat behind this one link, and on a deployed build it pointed at the
  // wrong origin (2026-08-31). `/api/v1/auth/google/start` is a TOP-LEVEL NAVIGATION, so
  // the browser resolved the relative path against the APP's host: staging answered
  // `200 text/html` with the SPA shell, the page simply reloaded, and the reader stayed on
  // the sign-in step forever — reported as "can't write the kids, can't fill the health,
  // can't sign in", which is all one bug. The API host answers 307 to Google.
  //
  // Asserted with an origin STUBBED IN, because the test build bakes none: with an empty
  // `VITE_API_ORIGIN` the broken and the fixed link are byte-identical, and a test that
  // cannot tell them apart is the reason this shipped. `SignIn.tsx` solved it the same way
  // for the dashboard and this link never got it.
  it('sends the reader to the API’s own origin, not the app’s', async () => {
    vi.stubEnv('VITE_API_ORIGIN', 'https://api.example.test')
    vi.resetModules()
    const { BookingFlow: Fresh } = await import('./BookingFlow')
    render(<Fresh slug="judo-tel-aviv" locale="he" client={makeClient()} groups={GROUPS} />)
    expect(screen.getByTestId('booking-sign-in-link').getAttribute('href')).toMatch(
      /^https:\/\/api\.example\.test\/api\/v1\/auth\/google\/start\?/,
    )
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('a signed-in parent starts at the child form', async () => {
    render(<BookingFlow slug="judo" locale="he" client={makeClient()} groups={GROUPS} signedIn />)
    expect(screen.getByTestId('booking-children')).toBeInTheDocument()
  })

  it('adds a second child in the same booking', async () => {
    // §5.4a step 2 — '[ + הוסף ילד נוסף ] — several children in one booking.'
    const user = userEvent.setup()
    render(<BookingFlow slug="judo" locale="he" client={makeClient()} groups={GROUPS} signedIn />)
    await user.click(screen.getByTestId('booking-add-child'))
    expect(screen.getByTestId('booking-group-1')).toBeInTheDocument()
  })

  it('removes a child that was added by mistake', async () => {
    const user = userEvent.setup()
    render(<BookingFlow slug="judo" locale="he" client={makeClient()} groups={GROUPS} signedIn />)
    await user.click(screen.getByTestId('booking-add-child'))
    await user.click(screen.getByTestId('booking-remove-child-1'))
    expect(screen.queryByTestId('booking-group-1')).toBeNull()
  })

  it('cannot continue past the child form until it is complete', async () => {
    render(<BookingFlow slug="judo" locale="he" client={makeClient()} groups={GROUPS} signedIn />)
    expect(screen.getByTestId('booking-to-health')).toBeDisabled()
  })

  it('greys out a group outside the child’s age rather than hiding it', async () => {
    // §5.4a step 2. A group a parent cannot SEE is one they cannot ask about — so it is
    // disabled with a reason, not removed.
    const user = userEvent.setup()
    render(
      <BookingFlow
        slug="judo"
        locale="he"
        client={makeClient()}
        groups={GROUPS}
        signedIn
        today={new Date('2026-09-01')}
      />,
    )
    await user.type(screen.getByLabelText(t('he', 'people.student.birthdate')), '2020-01-01')
    const options = screen.getByTestId('booking-group-0').querySelectorAll('option')
    const competition = [...options].find((option) => option.value === 'g2')
    expect(competition).toBeDisabled()
    expect(competition?.textContent).toContain(t('he', 'people.landing.tooYoung'))
  })

  it('step 3 requires the trial declaration to be confirmed per child', async () => {
    // §5.4a step 3, against the seeded kind='trial' template (L11). This lane builds no
    // template editor, so what it renders is the confirmation, not an author's form.
    const user = userEvent.setup()
    render(<BookingFlow slug="judo" locale="he" client={makeClient()} groups={GROUPS} signedIn />)
    await fillOneChild(user)
    await user.click(screen.getByTestId('booking-to-health'))

    expect(screen.getByTestId('booking-to-slot')).toBeDisabled()
    await user.click(screen.getByLabelText(t('he', 'people.trialHealth.confirm')))
    expect(screen.getByTestId('booking-to-slot')).toBeEnabled()
  })

  it('step 4 greys out a cancelled slot rather than hiding it', async () => {
    // §5.4 — 'the picker greys out a slot rather than hiding it, so a parent can see the
    // class exists and pick a different week instead of concluding there is nothing.'
    const user = userEvent.setup()
    render(<BookingFlow slug="judo" locale="he" client={makeClient()} groups={GROUPS} signedIn />)
    await fillOneChild(user)
    await user.click(screen.getByTestId('booking-to-health'))
    await user.click(screen.getByLabelText(t('he', 'people.trialHealth.confirm')))
    await user.click(screen.getByTestId('booking-to-slot'))

    await screen.findByTestId('booking-slot-child-0')
    expect(slotRadio(0, 's1')).toBeEnabled()
    expect(slotRadio(0, 's2')).toBeDisabled()
  })

  it('submits every child and one declaration each, in order', async () => {
    const user = userEvent.setup()
    const client = makeClient()
    render(<BookingFlow slug="judo" locale="he" client={client} groups={GROUPS} signedIn />)
    await fillOneChild(user)
    await user.click(screen.getByTestId('booking-to-health'))
    await user.click(screen.getByLabelText(t('he', 'people.trialHealth.confirm')))
    await user.click(screen.getByTestId('booking-to-slot'))
    await screen.findByTestId('booking-slot-child-0')
    await user.click(slotRadio(0, 's1')!)
    await user.click(screen.getByTestId('booking-submit'))

    await waitFor(() => expect(client.book).toHaveBeenCalled())
    const body = vi.mocked(client.book).mock.calls[0]![0]
    expect(body.children).toHaveLength(1)
    expect(body.children[0]!.group_id).toBe('g1')
    expect(body.children[0]!.session_id).toBe('s1')
    // One declaration per child, same order — the server validates the pairing.
    expect(body.trial_health_declarations).toHaveLength(body.children.length)
  })

  it('sends each sibling their OWN group and their OWN slot', async () => {
    // §5.4a step 2 is per child — 'groups filtered by the child's age' — and step 4 is
    // 'the next N upcoming sessions of each chosen group, ONE PICK PER CHILD'. The age
    // filter exists for siblings who do not belong in the same group, so applying child
    // 0's choice to everyone breaks the exact case the picker was built for: a 6-year-old
    // silently ends up in the 12-16 squad with their older brother.
    const user = userEvent.setup()
    const client = makeClient()
    render(<BookingFlow slug="judo" locale="he" client={client} groups={GROUPS} signedIn />)

    await user.type(screen.getByLabelText(t('he', 'people.student.firstName')), 'נועה')
    await user.type(screen.getByLabelText(t('he', 'people.student.lastName')), 'לוי')
    await user.selectOptions(screen.getByTestId('booking-group-0'), 'g1')

    await user.click(screen.getByTestId('booking-add-child'))
    await user.type(screen.getAllByLabelText(t('he', 'people.student.firstName'))[1]!, 'יוסי')
    await user.type(screen.getAllByLabelText(t('he', 'people.student.lastName'))[1]!, 'לוי')
    await user.selectOptions(screen.getByTestId('booking-group-1'), 'g2')

    await user.click(screen.getByTestId('booking-to-health'))
    for (const box of screen.getAllByLabelText(t('he', 'people.trialHealth.confirm'))) {
      await user.click(box)
    }
    await user.click(screen.getByTestId('booking-to-slot'))

    // Each child is offered their own group's sessions and nobody else's.
    await screen.findByTestId('booking-slot-child-0')
    await user.click(slotRadio(0, 's1')!)
    await user.click(slotRadio(1, 's9')!)
    expect(slotRadio(1, 's1')).toBeNull()
    expect(slotRadio(0, 's9')).toBeNull()

    await user.click(screen.getByTestId('booking-submit'))
    await waitFor(() => expect(client.book).toHaveBeenCalled())

    const body = vi.mocked(client.book).mock.calls[0]![0]
    expect(body.children).toHaveLength(2)
    expect(body.children[0]!.group_id).toBe('g1')
    expect(body.children[0]!.session_id).toBe('s1')
    expect(body.children[1]!.group_id).toBe('g2')
    expect(body.children[1]!.session_id).toBe('s9')
  })

  // The seam, not the form. The step above proves the fields render and gate the button;
  // this proves what was typed reaches the REQUEST. Without it, `guardian` could be
  // dropped between the form and `client.book` and every other test would still pass —
  // and the booking would arrive with nobody attached to it.
  it('carries the typed details into the booking when nobody signed in', async () => {
    const user = userEvent.setup()
    const client = makeClient()
    render(<BookingFlow slug="judo" locale="he" client={client} groups={GROUPS} />)

    await user.type(screen.getByTestId('booking-you-first-name'), 'רונית')
    await user.type(screen.getByTestId('booking-you-last-name'), 'כהן')
    await user.type(screen.getByTestId('booking-you-email'), 'ronit@example.test')
    await user.type(screen.getByTestId('booking-you-phone'), '050-1112222')
    await user.click(screen.getByTestId('booking-to-children'))

    await user.type(screen.getByLabelText(t('he', 'people.student.firstName')), 'נועה')
    await user.type(screen.getByLabelText(t('he', 'people.student.lastName')), 'כהן')
    await user.selectOptions(screen.getByTestId('booking-group-0'), 'g1')
    await user.click(screen.getByTestId('booking-to-health'))
    await user.click(screen.getByLabelText(t('he', 'people.trialHealth.confirm')))
    await user.click(screen.getByTestId('booking-to-slot'))
    await screen.findByTestId('booking-slot-child-0')
    await user.click(slotRadio(0, 's1')!)
    await user.click(screen.getByTestId('booking-submit'))

    await waitFor(() => expect(client.book).toHaveBeenCalled())
    const body = vi.mocked(client.book).mock.calls[0]![0]
    expect(body.guardian).toEqual({
      first_name: 'רונית',
      last_name: 'כהן',
      email: 'ronit@example.test',
      phone: '050-1112222',
    })
  })

  it('sends no typed details when the parent has a session', async () => {
    // The server ignores a typed address in favour of the verified one, so sending it
    // would be noise at best — and at worst it reads as an attempt to override.
    const user = userEvent.setup()
    const client = makeClient()
    render(<BookingFlow slug="judo" locale="he" client={client} groups={GROUPS} signedIn />)

    await user.type(screen.getByLabelText(t('he', 'people.student.firstName')), 'נועה')
    await user.type(screen.getByLabelText(t('he', 'people.student.lastName')), 'כהן')
    await user.selectOptions(screen.getByTestId('booking-group-0'), 'g1')
    await user.click(screen.getByTestId('booking-to-health'))
    await user.click(screen.getByLabelText(t('he', 'people.trialHealth.confirm')))
    await user.click(screen.getByTestId('booking-to-slot'))
    await screen.findByTestId('booking-slot-child-0')
    await user.click(slotRadio(0, 's1')!)
    await user.click(screen.getByTestId('booking-submit'))

    await waitFor(() => expect(client.book).toHaveBeenCalled())
    expect(vi.mocked(client.book).mock.calls[0]![0].guardian).toBeUndefined()
  })

  it('will not submit until every child has picked a slot of their own', async () => {
    // §5.4a step 4 — 'one pick per child'. Submitting with one sibling unbooked is the
    // silent half of the same bug.
    const user = userEvent.setup()
    render(<BookingFlow slug="judo" locale="he" client={makeClient()} groups={GROUPS} signedIn />)
    await fillOneChild(user)
    await user.click(screen.getByTestId('booking-add-child'))
    await user.type(screen.getAllByLabelText(t('he', 'people.student.firstName'))[1]!, 'יוסי')
    await user.type(screen.getAllByLabelText(t('he', 'people.student.lastName'))[1]!, 'לוי')
    await user.selectOptions(screen.getByTestId('booking-group-1'), 'g2')
    await user.click(screen.getByTestId('booking-to-health'))
    for (const box of screen.getAllByLabelText(t('he', 'people.trialHealth.confirm'))) {
      await user.click(box)
    }
    await user.click(screen.getByTestId('booking-to-slot'))

    await screen.findByTestId('booking-slot-child-0')
    await user.click(slotRadio(0, 's1')!)
    expect(screen.getByTestId('booking-submit')).toBeDisabled()
    await user.click(slotRadio(1, 's9')!)
    expect(screen.getByTestId('booking-submit')).toBeEnabled()
  })

  it.each([
    [409, 'trial_already_used', 'people.landing.alreadyUsed'],
    [429, 'too_many_bookings', 'people.landing.rateLimited'],
    [503, 'schedule_unavailable', 'people.error.scheduleUnavailable'],
  ])('explains a %i without clearing the form', async (statusCode, code, key) => {
    const user = userEvent.setup()
    const client = makeClient(jsonResponse(statusCode, { detail: { code } }))
    render(<BookingFlow slug="judo" locale="he" client={client} groups={GROUPS} signedIn />)
    await fillOneChild(user)
    await user.click(screen.getByTestId('booking-to-health'))
    await user.click(screen.getByLabelText(t('he', 'people.trialHealth.confirm')))
    await user.click(screen.getByTestId('booking-to-slot'))
    await screen.findByTestId('booking-slot-child-0')
    await user.click(slotRadio(0, 's1')!)
    await user.click(screen.getByTestId('booking-submit'))

    expect(await screen.findByTestId('booking-error')).toHaveTextContent(t('he', key))
    // The chosen slot is still chosen — an error that resets the form makes somebody who
    // already hesitated start again.
    expect(slotRadio(0, 's1')).toBeChecked()
  })

  it('renders the confirmation on success', async () => {
    const user = userEvent.setup()
    const client = makeClient(
      jsonResponse(201, {
        studio_slug: 'judo',
        studio_name: 'מועדון',
        group_name: 'מתחילים',
        session_starts_at: '2026-09-06T14:00:00Z',
        students: [{ id: 'st1', first_name: 'נועה', last_name: 'לוי' }],
      }),
    )
    render(<BookingFlow slug="judo" locale="he" client={client} groups={GROUPS} signedIn />)
    await fillOneChild(user)
    await user.click(screen.getByTestId('booking-to-health'))
    await user.click(screen.getByLabelText(t('he', 'people.trialHealth.confirm')))
    await user.click(screen.getByTestId('booking-to-slot'))
    await screen.findByTestId('booking-slot-child-0')
    await user.click(slotRadio(0, 's1')!)
    await user.click(screen.getByTestId('booking-submit'))

    expect(await screen.findByTestId('booking-confirmed')).toBeInTheDocument()
  })

  it('every input has a label', () => {
    // .claude/rules/ui-rtl-a11y.md — 'every input has an associated <label>'.
    render(<BookingFlow slug="judo" locale="he" client={makeClient()} groups={GROUPS} signedIn />)
    for (const input of screen.getAllByRole('textbox')) {
      expect(input).toHaveAccessibleName()
    }
  })

  it('renders no physical CSS', () => {
    const { container } = render(
      <BookingFlow slug="judo" locale="he" client={makeClient()} groups={GROUPS} signedIn />,
    )
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })
})

describe('groupFitsAge', () => {
  const today = new Date('2026-09-01')
  const beginners = GROUPS[0]!

  it('accepts a child inside the range', () => {
    expect(groupFitsAge(beginners, '2020-01-01', today)).toBe(true)
  })

  it('rejects a child below it', () => {
    expect(groupFitsAge(beginners, '2024-01-01', today)).toBe(false)
  })

  it('rejects a child above it', () => {
    expect(groupFitsAge(beginners, '2010-01-01', today)).toBe(false)
  })

  it('counts a birthday that has not happened yet this year', () => {
    // Born 2018-12-31, "today" 2026-09-01 — seven, not eight. An off-by-one here quietly
    // offers or hides a group at exactly the boundary age.
    expect(groupFitsAge(beginners, '2018-12-31', today)).toBe(true)
    expect(groupFitsAge({ ...beginners, age_min: 8 }, '2018-12-31', today)).toBe(false)
  })

  it('offers every group when the child’s birthdate is not filled in yet', () => {
    // The parent has not typed it. Hiding groups at that moment makes the form look broken.
    expect(groupFitsAge(beginners, '', today)).toBe(true)
  })

  it('offers a group with no age range to everybody', () => {
    expect(
      groupFitsAge({ ...beginners, age_min: null, age_max: null }, '2000-01-01', today),
    ).toBe(true)
  })
})


describe('decision 3 (2026-08-27) — one-step chips alone, per-child frames with a sibling', () => {
  it('renders bare chips for a single child, with no fieldset naming anybody', async () => {
    const user = userEvent.setup()
    render(<BookingFlow slug="judo" locale="he" client={makeClient()} groups={GROUPS} signedIn />)
    await fillOneChild(user)
    await user.click(screen.getByTestId('booking-to-health'))
    await user.click(screen.getByLabelText(t('he', 'people.trialHealth.confirm')))
    await user.click(screen.getByTestId('booking-to-slot'))
    const wrapper = await screen.findByTestId('booking-slot-child-0')
    expect(wrapper.closest('fieldset')).toBeNull()
    expect(screen.getByTestId('slot-chips')).toBeInTheDocument()
  })

  it('frames each child once a sibling is added, because a name starts meaning something', async () => {
    const user = userEvent.setup()
    render(<BookingFlow slug="judo" locale="he" client={makeClient()} groups={GROUPS} signedIn />)
    await fillOneChild(user)
    await user.click(screen.getByTestId('booking-add-child'))
    await user.type(screen.getAllByLabelText(t('he', 'people.student.firstName'))[1]!, 'יוסי')
    await user.type(screen.getAllByLabelText(t('he', 'people.student.lastName'))[1]!, 'לוי')
    await user.selectOptions(screen.getByTestId('booking-group-1'), 'g2')
    await user.click(screen.getByTestId('booking-to-health'))
    for (const box of screen.getAllByLabelText(t('he', 'people.trialHealth.confirm'))) {
      await user.click(box)
    }
    await user.click(screen.getByTestId('booking-to-slot'))
    const wrapper = await screen.findByTestId('booking-slot-child-0')
    expect(wrapper.closest('fieldset')).not.toBeNull()
  })
})

describe('landing redesign (2026-08-29) — pre-selected group and step progress', () => {
  it('pre-fills the first child’s group from the landing picker', async () => {
    render(
      <BookingFlow
        slug="judo"
        locale="he"
        client={makeClient()}
        groups={GROUPS}
        signedIn
        initialGroupId="g2"
      />,
    )
    expect(screen.getByTestId('booking-group-0')).toHaveValue('g2')
  })

  it('carries the chosen group through the sign-in round trip', async () => {
    // The parent picked a group, then went to Google. Losing that choice on the way back
    // is the funnel leak §5.4a added sign-in-first to avoid.
    render(
      <BookingFlow
        slug="judo"
        locale="he"
        client={makeClient()}
        groups={GROUPS}
        initialGroupId="g2"
      />,
    )
    expect(screen.getByTestId('booking-sign-in-link')).toHaveAttribute(
      'href',
      expect.stringContaining(encodeURIComponent('/t/judo?book=g2')),
    )
  })

  it('shows the four steps with the current one marked', async () => {
    render(<BookingFlow slug="judo" locale="he" client={makeClient()} groups={GROUPS} signedIn />)
    const progress = screen.getByTestId('booking-progress')
    for (const key of ['you', 'children', 'health', 'slot'] as const) {
      expect(progress).toHaveTextContent(t('he', `people.landing.step.${key}`))
    }
    const current = progress.querySelector('[aria-current="step"]')
    expect(current).toHaveTextContent(t('he', 'people.landing.step.children'))
  })

  it('marks the details step as current for a stranger, and skips it for a member', async () => {
    render(<BookingFlow slug="judo" locale="he" client={makeClient()} groups={GROUPS} />)
    expect(
      screen.getByTestId('booking-progress').querySelector('[aria-current="step"]'),
    ).toHaveTextContent(t('he', 'people.landing.step.you'))
  })
})

// "A person can't go back on the stages — he needs to be able to go back and forth"
// (2026-08-31). Step 2 was the only step with no way back at all, so a parent who mistyped
// their own email had to abandon the booking and start it again.
describe('moving back through the steps', () => {
  const fillYou = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByTestId('booking-you-first-name'), 'רונית')
    await user.type(screen.getByTestId('booking-you-email'), 'ronit@example.test')
    await user.click(screen.getByTestId('booking-to-children'))
  }

  it('goes back from the children to the details, with what was typed still there', async () => {
    const user = userEvent.setup()
    render(<BookingFlow slug="judo" locale="he" client={makeClient()} groups={GROUPS} />)
    await fillYou(user)

    await user.click(screen.getByTestId('booking-to-you'))
    expect(screen.getByTestId('booking-you')).toBeInTheDocument()
    // Going back to correct something must not cost you the rest. The state lives in the
    // flow, not in the step, so every answer survives the trip.
    expect(screen.getByTestId('booking-you-email')).toHaveValue('ronit@example.test')
  })

  it('offers no way back to a details step the signed-in parent never saw', async () => {
    // Their booking starts at the children, so "back" would be a dead end.
    render(<BookingFlow slug="judo" locale="he" client={makeClient()} groups={GROUPS} signedIn />)
    expect(screen.queryByTestId('booking-to-you')).toBeNull()
  })

  it('reopens an earlier step from the progress rail, and keeps the children', async () => {
    const user = userEvent.setup()
    render(<BookingFlow slug="judo" locale="he" client={makeClient()} groups={GROUPS} />)
    await fillYou(user)
    await user.type(screen.getByLabelText(t('he', 'people.student.firstName')), 'נועה')
    await user.type(screen.getByLabelText(t('he', 'people.student.lastName')), 'לוי')
    await user.selectOptions(screen.getByTestId('booking-group-0'), 'g1')
    await user.click(screen.getByTestId('booking-to-health'))

    await user.click(screen.getByTestId('booking-step-children'))
    expect(screen.getByTestId('booking-children')).toBeInTheDocument()
    expect(screen.getByLabelText(t('he', 'people.student.firstName'))).toHaveValue('נועה')
  })

  it('will not let the rail skip a step that has not been answered', async () => {
    // Forward through the rail would walk past the checks between here and there — the
    // group each child belongs to, a declaration per child. Backwards only.
    const user = userEvent.setup()
    render(<BookingFlow slug="judo" locale="he" client={makeClient()} groups={GROUPS} />)
    await fillYou(user)
    expect(screen.queryByTestId('booking-step-health')).toBeNull()
    expect(screen.queryByTestId('booking-step-slot')).toBeNull()
    // The one behind is reachable; the current one is not a button at all.
    expect(screen.getByTestId('booking-step-you')).toBeInTheDocument()
    expect(screen.queryByTestId('booking-step-children')).toBeNull()
  })
})
