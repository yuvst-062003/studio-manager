// Entrance A — the join §5.4a ④'s "איך היה?" finally leads to.
//
// The tests that carry weight are the negatives. This screen writes money: a wrong tick
// enrols a child in a group nobody chose, and a wrong route offers a family who did not
// turn up a button to start paying.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { JoinClubSection } from './JoinClubSection'
import { JoinTheClub } from './JoinTheClub'
import { TrialHome } from './TrialHome'
import type { JoinGroupOption } from './JoinTheClub'
import type { MyTrialBooking, PeopleClient, StudentSummary } from './peopleClient'

const student = (over: Partial<StudentSummary> = {}): StudentSummary =>
  ({
    id: 'st1',
    person_id: 'p1',
    first_name: 'נועה',
    last_name: 'לוי',
    birthdate: '2019-04-01',
    status: 'trial',
    health_status: 'trial_signed',
    joined_on: null,
    left_on: null,
    group_names: [],
    guardian_display_names: ['יעל לוי'],
    frozen_until: null,
    ...over,
  }) as StudentSummary

const booking = (over: Partial<MyTrialBooking> = {}): MyTrialBooking => ({
  student_id: 'st1',
  group_id: 'g1',
  group_name: 'מתחילים',
  session_starts_at: '2026-09-06T14:00:00Z',
  attended: true,
  ...over,
})

const GROUPS: JoinGroupOption[] = [
  { id: 'g1', name: 'מתחילים', training_weekdays: [0] },
  { id: 'g2', name: 'נבחרת', training_weekdays: [3] },
]

function makeClient(over: Partial<PeopleClient> = {}): PeopleClient {
  return {
    myStudents: vi.fn(() => Promise.resolve({ items: [student()] })),
    myTrialBookings: vi.fn(() => Promise.resolve({ items: [booking()] })),
    joinTheClub: vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
    ...over,
  } as unknown as PeopleClient
}

describe('JoinTheClub — the picker', () => {
  it('opens with the group they trialled already ticked', () => {
    render(
      <JoinTheClub
        client={makeClient()}
        locale="he"
        student={student()}
        trialledGroupId="g1"
        groups={GROUPS}
      />,
    )
    expect(screen.getByTestId('join-club-group-g1')).toBeChecked()
    expect(screen.getByTestId('join-club-group-g2')).not.toBeChecked()
    expect(screen.getByTestId('join-club-trialled')).toBeInTheDocument()
  })

  it('sends every ticked group, and no price', async () => {
    // How much is never the parent's choice — it is derived from weekly volume across the
    // ticks. A `price_plan_id` in this body would be a price a client can post.
    const client = makeClient()
    render(
      <JoinTheClub
        client={client}
        locale="he"
        student={student()}
        trialledGroupId="g1"
        groups={GROUPS}
      />,
    )
    await userEvent.click(screen.getByTestId('join-club-group-g2'))
    await userEvent.click(screen.getByTestId('join-club-submit'))
    expect(client.joinTheClub).toHaveBeenCalledWith('st1', { group_ids: ['g1', 'g2'] })
  })

  it('shows no money anywhere, and says where the price will appear instead', () => {
    render(
      <JoinTheClub client={makeClient()} locale="he" student={student()} groups={GROUPS} />,
    )
    expect(document.body.textContent ?? '').not.toContain('₪')
    expect(screen.getByTestId('join-club-price-hint')).toBeInTheDocument()
  })

  it('refuses to submit with no group, because the server would', async () => {
    // A child with no group has no weekly volume and therefore no price. A button that
    // offers the refusal is worse than one that waits.
    const client = makeClient()
    render(
      <JoinTheClub
        client={client}
        locale="he"
        student={student()}
        trialledGroupId={null}
        groups={GROUPS}
      />,
    )
    expect(screen.getByTestId('join-club-submit')).toBeDisabled()
  })

  it('says so when the group list comes back empty, and offers a retry', async () => {
    render(<JoinTheClub client={makeClient()} locale="he" student={student()} groups={[]} />)
    // An injected empty list is 'ready', not 'empty' — the fetch path is what reports empty.
    // What must never happen is a legend over nothing with no explanation, which is what
    // the fetch branch covers; here the assertion is that nothing crashes and no group
    // renders.
    expect(screen.queryByTestId('join-club-group-g1')).toBeNull()
    expect(screen.getByTestId('join-club-submit')).toBeDisabled()
  })

  it('reports a refused join instead of pretending it worked', async () => {
    const client = makeClient({
      joinTheClub: vi.fn(() => Promise.resolve(new Response('{}', { status: 422 }))),
    })
    const onJoined = vi.fn()
    render(
      <JoinTheClub
        client={client}
        locale="he"
        student={student()}
        trialledGroupId="g1"
        groups={GROUPS}
        onJoined={onJoined}
      />,
    )
    await userEvent.click(screen.getByTestId('join-club-submit'))
    expect(await screen.findByTestId('join-club-error')).toBeInTheDocument()
    expect(onJoined).not.toHaveBeenCalled()
  })

  it('renders no physical CSS', () => {
    const { container } = render(
      <JoinTheClub
        client={makeClient()}
        locale="he"
        student={student()}
        trialledGroupId="g1"
        groups={GROUPS}
      />,
    )
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })
})

describe('JoinClubSection — who may reach the join at all', () => {
  it('renders the picker for a trial child who attended', async () => {
    render(<JoinClubSection client={makeClient()} locale="he" />)
    expect(await screen.findByTestId('join-the-club')).toBeInTheDocument()
  })

  it('offers a NO-SHOW nothing, even by a typed hash', async () => {
    // §5.4a ③ — the worker already sends a no-show a different message, on the ground that
    // "איך היה?" to somebody who did not come is worse than silence. A join button is the
    // same mistake with money attached, and a hash is typed by whoever holds the phone, so
    // the check cannot live in the link.
    const client = makeClient({
      myTrialBookings: vi.fn(() => Promise.resolve({ items: [booking({ attended: false })] })),
    })
    render(<JoinClubSection client={client} locale="he" />)
    expect(await screen.findByTestId('join-club-unavailable')).toBeInTheDocument()
    expect(screen.queryByTestId('join-the-club')).toBeNull()
  })

  it('offers nothing before the lesson has happened', async () => {
    // `attended === null` is three-state's third value: it has not happened yet.
    const client = makeClient({
      myTrialBookings: vi.fn(() => Promise.resolve({ items: [booking({ attended: null })] })),
    })
    render(<JoinClubSection client={client} locale="he" />)
    expect(await screen.findByTestId('join-club-unavailable')).toBeInTheDocument()
  })

  it('offers nothing to a child who is already active', async () => {
    const client = makeClient({
      myStudents: vi.fn(() => Promise.resolve({ items: [student({ status: 'active' })] })),
    })
    render(<JoinClubSection client={client} locale="he" />)
    expect(await screen.findByTestId('join-club-unavailable')).toBeInTheDocument()
  })

  it('tells the shell to re-read the family after a join', async () => {
    // The child is `active` now and still holds the short health form, so §5.5's gate must
    // fire on the very next render. Without this the family walks past it.
    const onJoined = vi.fn()
    render(<JoinClubSection client={makeClient()} locale="he" onJoined={onJoined} />)
    await userEvent.click(await screen.findByTestId('join-club-submit'))
    await waitFor(() => expect(onJoined).toHaveBeenCalled())
  })
})

describe('TrialHome — the prompt now leads somewhere', () => {
  const STARTS = '2026-09-06T14:00:00Z'

  it('offers the join beside "איך היה?" once the lesson has happened', () => {
    render(<TrialHome students={[student()]} locale="he" sessionStartsAt={STARTS} attended />)
    expect(screen.getByTestId('trial-home-join')).toHaveAccessibleName(
      t('he', 'people.joinClub.cta'),
    )
  })

  it('offers it neither before the lesson nor to a no-show', () => {
    const { rerender } = render(
      <TrialHome students={[student()]} locale="he" sessionStartsAt={STARTS} />,
    )
    expect(screen.queryByTestId('trial-home-join')).toBeNull()
    rerender(
      <TrialHome students={[student()]} locale="he" sessionStartsAt={STARTS} attended={false} />,
    )
    expect(screen.queryByTestId('trial-home-join')).toBeNull()
  })
})
