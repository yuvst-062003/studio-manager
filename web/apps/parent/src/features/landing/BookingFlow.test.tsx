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

function makeClient(bookResponse = new Response(null, { status: 201 })): LandingClient {
  return {
    landing: vi.fn(),
    trialSlots: vi.fn(() => Promise.resolve({ items: SLOTS })),
    book: vi.fn(() => Promise.resolve(bookResponse)),
  } as unknown as LandingClient
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function fillOneChild(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(t('he', 'people.student.firstName')), 'נועה')
  await user.type(screen.getByLabelText(t('he', 'people.student.lastName')), 'לוי')
  await user.selectOptions(screen.getByTestId('booking-group-0'), 'g1')
}

describe('BookingFlow — §5.4a steps 1-4', () => {
  it('step 1 is SIGN IN, and no child form exists until it is done', async () => {
    // §5.4a: "The parent authenticates **before** entering child details." Rendering the
    // child form first and asking for sign-in at submit would throw away everything typed.
    render(<BookingFlow slug="judo" locale="he" client={makeClient()} groups={GROUPS} />)
    expect(screen.getByTestId('booking-sign-in')).toBeInTheDocument()
    expect(screen.queryByTestId('booking-children')).toBeNull()
    expect(screen.queryByLabelText(t('he', 'people.student.firstName'))).toBeNull()
  })

  it('the sign-in link returns to this exact club', async () => {
    // Otherwise the provider round trip drops them on a generic home screen and the funnel
    // leaks at the one step §5.4a added sign-in-first to protect.
    render(<BookingFlow slug="judo-tel-aviv" locale="he" client={makeClient()} groups={GROUPS} />)
    const link = screen.getByTestId('booking-sign-in-link')
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining(encodeURIComponent('/t/judo-tel-aviv')),
    )
    expect(link).toHaveAccessibleName(t('he', 'people.landing.signInFirst'))
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

    expect(await screen.findByTestId('booking-slot-s1')).toBeEnabled()
    expect(screen.getByTestId('booking-slot-s2')).toBeDisabled()
  })

  it('submits every child and one declaration each, in order', async () => {
    const user = userEvent.setup()
    const client = makeClient()
    render(<BookingFlow slug="judo" locale="he" client={client} groups={GROUPS} signedIn />)
    await fillOneChild(user)
    await user.click(screen.getByTestId('booking-to-health'))
    await user.click(screen.getByLabelText(t('he', 'people.trialHealth.confirm')))
    await user.click(screen.getByTestId('booking-to-slot'))
    await user.click(await screen.findByTestId('booking-slot-s1'))
    await user.click(screen.getByTestId('booking-submit'))

    await waitFor(() => expect(client.book).toHaveBeenCalled())
    const body = vi.mocked(client.book).mock.calls[0]![0]
    expect(body.group_id).toBe('g1')
    expect(body.session_id).toBe('s1')
    expect(body.children).toHaveLength(1)
    // One declaration per child, same order — the server validates the pairing.
    expect(body.trial_health_declarations).toHaveLength(body.children.length)
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
    await user.click(await screen.findByTestId('booking-slot-s1'))
    await user.click(screen.getByTestId('booking-submit'))

    expect(await screen.findByTestId('booking-error')).toHaveTextContent(t('he', key))
    // The chosen slot is still chosen — an error that resets the form makes somebody who
    // already hesitated start again.
    expect(screen.getByTestId('booking-slot-s1')).toBeChecked()
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
    await user.click(await screen.findByTestId('booking-slot-s1'))
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
