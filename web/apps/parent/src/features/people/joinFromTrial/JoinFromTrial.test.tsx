// Entrance A — the join §5.4a ④'s "איך היה?" finally leads to.
//
// The tests that carry weight are the negatives. This flow writes money: a wrong tick
// enrols a child in a group nobody chose, and a wrong route offers a family who did not
// turn up a button to start paying.
//
// **Rewritten 2026-09-12 for the three-step conversion.** `JoinTheClub`'s own block asserted
// two things the owner reversed: that the screen shows no money ("There is no description of
// what you paid" is the same complaint in a different place), and that it sends no plan. Both
// were deliberate and both were wrong on the same ground — a family was asked to join at a
// price nobody had named. The gate tests below did not change and are the reason this file
// was rewritten rather than replaced.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { JoinClubSection } from '../JoinClubSection'
import { JoinFromTrial } from './JoinFromTrial'
import { TrialHome } from '../TrialHome'
import type { JoinGroupOption } from './joinFromTrialClient'
import type { HealthClient, TemplateSchema } from '../../health/healthClient'
import type { WizardPlan } from '../../onboarding/wizard/types'
import type { MyTrialBooking, PeopleClient, StudentSummary } from '../peopleClient'

// The pad is mocked, as `ParentHealth.test.tsx` mocks 12c's for the same reason: jsdom's
// canvas has no 2d context, so `getContext('2d')` is null, no stroke is ever recorded and a
// real pad can never produce a signature here. What this file is testing is the SEQUENCE —
// that an unsigned step 1 does not advance and that a signed one files the right body — and
// a stub that hands back one fixed data URL tests exactly that.
vi.mock('../../onboarding/wizard/parts/SignatureField', () => ({
  SignatureField: ({
    error,
    onChange,
  }: {
    error?: string | null
    onChange: (dataUrl: string) => void
  }) => (
    <div>
      {/* No label: G4 forbids an inlined user-facing string even in a stub, and the tests
          reach this by `data-testid`. */}
      <button type="button" data-testid="sign" onClick={() => onChange(SIGNATURE)} />
      {error ? <span data-testid="signature-error">{error}</span> : null}
    </div>
  ),
}))

const SIGNATURE = 'data:image/png;base64,AAAA'

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
  { id: 'g1', name: 'מתחילים', training_weekdays: [0], kind: 'base' },
  { id: 'g2', name: 'בוגרים', training_weekdays: [3], kind: 'base' },
  // The competition squad. `GROUP_KINDS`: "students put THEMSELVES on the competition
  // teams, which is exactly an extra" — so it is not a team a family joins the club by
  // choosing, and this picker must not offer it.
  { id: 'g3', name: 'נבחרת', training_weekdays: [5], kind: 'extra' },
]

const PLANS: WizardPlan[] = [
  { id: 'pl1', title: 'פעם בשבוע', subtitle: '1 בשבוע', pricePerMonthAgorot: 30_000, features: [] },
  { id: 'pl2', title: 'פעמיים בשבוע', subtitle: '2 בשבוע', pricePerMonthAgorot: 40_000, features: [] },
]

/** The template the booking form rendered — `kind=full` minus its clause — so the stored
 *  answers below are already in its own id-space and nothing maps between the two. */
const SCHEMA: TemplateSchema = {
  sections: [
    {
      title: 'בריאות',
      questions: [
        { id: 'q_asthma', label: 'אסתמה?', type: 'boolean', flag: true },
        { id: 'clause_confirmed', label: '', type: 'clause' },
      ],
    },
  ],
} as unknown as TemplateSchema

function makeClient(over: Partial<PeopleClient> = {}): PeopleClient {
  return {
    myStudents: vi.fn(() => Promise.resolve({ items: [student()] })),
    myTrialBookings: vi.fn(() => Promise.resolve({ items: [booking()] })),
    joinTheClub: vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
    ...over,
  } as unknown as PeopleClient
}

function makeHealth(over: Partial<HealthClient> = {}): HealthClient {
  return {
    template: vi.fn(() => Promise.resolve({ id: 'tpl1', version: 2, schema: SCHEMA })),
    submit: vi.fn(() => Promise.resolve({ id: 'hd1' })),
    ...over,
  } as unknown as HealthClient
}

/** The stored trial answers, which `JoinFromTrial` reads through `apiFetch`. */
function stubTrialRead(body: Record<string, unknown> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('trial-declaration')) {
        return new Response(
          JSON.stringify({
            template_id: 'tpl1',
            answers: { q_asthma: false },
            declared_by: 'יעל לוי',
            declared_at: '2026-09-06T10:00:00Z',
            ...body,
          }),
          { status: 200 },
        )
      }
      return new Response('{"items":[]}', { status: 200 })
    }),
  )
}

/** Step 1, satisfied: confirm the clause, sign, and press on. */
async function passDeclaration() {
  await userEvent.click(await screen.findByTestId('join-declaration-confirm'))
  await userEvent.click(screen.getByTestId('sign'))
  await userEvent.click(screen.getByTestId('join-club-submit'))
}

describe('JoinFromTrial — the three steps', () => {
  const renderFlow = (over: Partial<PeopleClient> = {}, health = makeHealth()) => {
    stubTrialRead()
    const client = makeClient(over)
    render(
      <JoinFromTrial
        client={client}
        healthClient={health}
        locale="he"
        student={student()}
        trialledGroupId="g1"
        catalogue={{ groups: GROUPS, plans: PLANS }}
      />,
    )
    return client
  }

  it('shows what the family already answered instead of asking again', async () => {
    // The point of the rewrite. They answered the thirteen questions on the booking form an
    // hour earlier, and the form they answered was this same `kind=full` template.
    renderFlow()
    const recap = await screen.findByTestId('join-declaration-recap')
    expect(recap).toHaveTextContent('אסתמה?')
    expect(recap).toHaveTextContent(t('he', 'health.declaration.no'))
  })

  it('names who declared it and when, because that is what was signed at the trial', async () => {
    renderFlow()
    expect(await screen.findByTestId('join-declaration-provenance')).toHaveTextContent('יעל לוי')
  })

  it('will not leave step 1 unsigned', async () => {
    // `decode_signature` refuses an empty signature outright — "a declaration is not signed
    // until it is signed" — so a step that advanced without one would reach a 422 with the
    // family already two screens further on.
    const health = makeHealth()
    renderFlow({}, health)
    await userEvent.click(await screen.findByTestId('join-declaration-confirm'))
    await userEvent.click(screen.getByTestId('join-club-submit'))
    expect(health.submit).not.toHaveBeenCalled()
    expect(screen.getByTestId('join-step-declaration')).toBeInTheDocument()
  })

  it('files the declaration against the template the answers were given on', async () => {
    const health = makeHealth()
    renderFlow({}, health)
    await passDeclaration()
    await waitFor(() => expect(health.submit).toHaveBeenCalled())
    const call = (health.submit as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call).toBeDefined()
    const [studentId, body] = call!
    expect(studentId).toBe('st1')
    expect(body.template_id).toBe('tpl1')
    // The clause is DERIVED from the answers, never chosen: nothing was declared, so this
    // family is entitled to "no medical limitations of any kind" and to nothing else.
    expect(body.answers.clause_confirmed).toBe('none')
    // The pad's data-URL prefix is stripped; the API takes the base64 payload alone.
    expect(body.signature_image_base64).toBe('AAAA')
  })

  it('opens the group picker with the group they trialled already chosen', async () => {
    renderFlow()
    await passDeclaration()
    const trialled = (await screen.findByTestId('join-club-group-g1')) as HTMLInputElement
    expect(trialled.checked).toBe(true)
    expect((screen.getByTestId('join-club-group-g2') as HTMLInputElement).checked).toBe(false)
  })

  it('offers ONE base team and never an extra', async () => {
    // Base training is included in every plan and the PLAN buys the extra sessions
    // (`app/models/training_plan.py`), so joining is a single base team — a multi-select
    // here would ask the same question the plan cards ask, in a contradictory way.
    renderFlow()
    await passDeclaration()
    const first = (await screen.findByTestId('join-club-group-g1')) as HTMLInputElement
    expect(first.type).toBe('radio')
    expect(screen.queryByTestId('join-club-group-g3')).toBeNull()
  })

  it('replaces the choice rather than adding to it', async () => {
    const client = renderFlow()
    await passDeclaration()
    await userEvent.click(await screen.findByTestId('join-club-group-g2'))
    await userEvent.click(screen.getByTestId('join-club-submit'))
    await waitFor(() => expect(client.joinTheClub).toHaveBeenCalled())
    expect(client.joinTheClub).toHaveBeenCalledWith('st1', { group_ids: ['g2'] })
  })

  it('shows the monthly price rather than promising one on a later screen', async () => {
    // The owner's complaint, and the reason the old block asserted the opposite: a family
    // was asked to join a club at a price nobody had named.
    renderFlow()
    await passDeclaration()
    expect(await screen.findByText(/₪\s*300/)).toBeInTheDocument()
  })

  it('sends the chosen base team AND the plan the family chose', async () => {
    const client = renderFlow()
    await passDeclaration()
    await userEvent.click(await screen.findByTestId('join-club-group-g2'))
    await userEvent.click(screen.getByLabelText(/פעמיים בשבוע/))
    await userEvent.click(screen.getByTestId('join-club-submit'))
    await waitFor(() => expect(client.joinTheClub).toHaveBeenCalled())
    expect(client.joinTheClub).toHaveBeenCalledWith('st1', {
      group_ids: ['g2'],
      price_plan_id: 'pl2',
    })
  })

  it('sends no plan at all when the club publishes none, rather than inventing one', async () => {
    // `price_plan_id` is optional on the way out for exactly this club: the picker
    // disappears and the server's volume rule prices the child as it always did.
    stubTrialRead()
    const client = makeClient()
    render(
      <JoinFromTrial
        client={client}
        healthClient={makeHealth()}
        locale="he"
        student={student()}
        trialledGroupId="g1"
        catalogue={{ groups: GROUPS, plans: [] }}
      />,
    )
    await passDeclaration()
    await userEvent.click(await screen.findByTestId('join-club-submit'))
    await waitFor(() => expect(client.joinTheClub).toHaveBeenCalled())
    expect(client.joinTheClub).toHaveBeenCalledWith('st1', { group_ids: ['g1'] })
  })

  it('refuses to join with no team, because the server would', async () => {
    // A radio cannot be un-picked, so this is the child who trialled nowhere: no
    // `trialledGroupId` to pre-set, and nothing pressed.
    stubTrialRead()
    const client = makeClient()
    render(
      <JoinFromTrial
        client={client}
        healthClient={makeHealth()}
        locale="he"
        student={student()}
        catalogue={{ groups: GROUPS, plans: PLANS }}
      />,
    )
    await passDeclaration()
    await userEvent.click(await screen.findByTestId('join-club-submit'))
    expect(client.joinTheClub).not.toHaveBeenCalled()
  })

  it('reports a refused join instead of pretending it worked', async () => {
    const client = renderFlow({
      joinTheClub: vi.fn(() => Promise.resolve(new Response('{}', { status: 422 }))),
    })
    await passDeclaration()
    await userEvent.click(await screen.findByTestId('join-club-submit'))
    await waitFor(() => expect(client.joinTheClub).toHaveBeenCalled())
    expect(await screen.findByTestId('join-club-error')).toBeInTheDocument()
  })

  it('renders no physical CSS', async () => {
    const { container } = render(
      <JoinFromTrial
        client={makeClient()}
        healthClient={makeHealth()}
        locale="he"
        student={student()}
        trialledGroupId="g1"
        catalogue={{ groups: GROUPS, plans: PLANS }}
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
    render(<JoinClubSection client={makeClient()} healthClient={makeHealth()} locale="he" />)
    expect(await screen.findByTestId('join-from-trial')).toBeInTheDocument()
  })

  it('offers a NO-SHOW nothing, even by a typed hash', async () => {
    // §5.4a ③ — the worker already sends a no-show a different message, on the ground that
    // "איך היה?" to somebody who did not come is worse than silence. A join button is the
    // same mistake with money attached, and a hash is typed by whoever holds the phone, so
    // the check cannot live in the link.
    const client = makeClient({
      myTrialBookings: vi.fn(() => Promise.resolve({ items: [booking({ attended: false })] })),
    })
    render(<JoinClubSection client={client} healthClient={makeHealth()} locale="he" />)
    expect(await screen.findByTestId('join-club-unavailable')).toBeInTheDocument()
    expect(screen.queryByTestId('join-from-trial')).toBeNull()
  })

  it('offers nothing before the lesson has happened', async () => {
    // `attended === null` is three-state's third value: it has not happened yet.
    const client = makeClient({
      myTrialBookings: vi.fn(() => Promise.resolve({ items: [booking({ attended: null })] })),
    })
    render(<JoinClubSection client={client} healthClient={makeHealth()} locale="he" />)
    expect(await screen.findByTestId('join-club-unavailable')).toBeInTheDocument()
  })

  it('offers nothing to a child who is already active', async () => {
    const client = makeClient({
      myStudents: vi.fn(() => Promise.resolve({ items: [student({ status: 'active' })] })),
    })
    render(<JoinClubSection client={client} healthClient={makeHealth()} locale="he" />)
    expect(await screen.findByTestId('join-club-unavailable')).toBeInTheDocument()
  })

  it('tells the shell to re-read the family after a join', async () => {
    // The child is `active` now and still holds the short health form, so §5.5's gate must
    // fire on the very next render. Without this the family walks past it.
    const onJoined = vi.fn()
    stubTrialRead()
    render(
      <JoinClubSection client={makeClient()} healthClient={makeHealth()} locale="he" onJoined={onJoined} />,
    )
    await passDeclaration()
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
