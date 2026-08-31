// §6.1's staff first-launch branch, all three arms:
//
//   owner who has not dismissed the wizard → studio setup wizard, resumable
//   manager / coach with role assignments  → 3-screen tour → offline priming → Today
//   no role assignment anywhere            → the refusal screen
//
// §6.1 words the first arm as 'owner of a studio with no classes yet', which is what this
// file used to route on. That reading has a defect §5.1 makes visible: 'each step can be
// skipped'. An owner who skips step 3 has no classes, so a classes-based rule throws them
// back into the wizard on every launch, forever. `dismissed_at` is the persisted
// signal §5.1 actually asks for, and it is what this routes on now.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { Resolve, decideOutcome } from './Resolve'
import type { Session } from '@studio/core'

afterEach(() => vi.unstubAllGlobals())

const BASE_STUDIO = {
  studio_id: 's',
  studio_name: 'מועדון',
  studio_is_demo: false,
  person_id: 'p',
  roles: ['owner'] as string[],
  is_guardian: false,
}

function session(over: Partial<Session> = {}): Session {
  return {
    status: 'signed-in',
    access: { staff: true, parent: false },
    studios: [BASE_STUDIO],
    activeStudioId: 's',
    devTools: false,
    isPlatformAdmin: false,
    actingAsPersonId: null,
    actingAsLabel: null,
    activeStudioName: 'מועדון',
    reload: vi.fn(),
    signOut: vi.fn(),
    ...over,
  } as Session
}

function stubSetup(dismissedAt: string | null, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ steps: [], complete: false, dismissed_at: dismissedAt }), {
          status,
        }),
    ),
  )
}

describe('decideOutcome', () => {
  it('refuses an identity with no role assignment anywhere', () => {
    // §3.1 — the staff app asks 'do you hold any role assignment?', which is a QUERY.
    expect(
      decideOutcome(
        session({ access: { staff: false, parent: true } }),
        '2026-08-25T10:00:00+00:00',
      ),
    ).toBe('refused')
  })

  it('refuses before it even asks about setup', () => {
    // The refusal does not depend on the studio's state, so it must not wait on a request
    // that will never be authorised anyway.
    expect(decideOutcome(session({ access: { staff: false, parent: false } }), undefined)).toBe(
      'refused',
    )
  })

  it('waits rather than flashing the wizard while the answer is unknown', () => {
    expect(decideOutcome(session(), undefined)).toBe('loading')
  })

  it('routes an owner who has not dismissed the wizard into it', () => {
    expect(decideOutcome(session(), null)).toBe('wizard')
  })

  it('routes an owner who dismissed the wizard to the tour', () => {
    expect(decideOutcome(session(), '2026-08-25T10:00:00+00:00')).toBe('tour')
  })

  it('does not re-open the wizard for an owner who SKIPPED every step', () => {
    // The defect this rule replaces. Under 'does this studio have classes?', an owner who
    // skipped step 3 has no classes and is thrown back in on every launch, forever.
    expect(decideOutcome(session(), '2026-08-25T10:00:00+00:00')).toBe('tour')
  })

  it('never routes a coach to the wizard', () => {
    // §3.2 — 'Studio settings, training year, rollover: owner ✓ manager ✓' and nothing
    // else. A coach who reached the wizard could create the studio's whole structure.
    const coach = session({
      studios: [{ ...BASE_STUDIO, roles: ['lead_coach'] }],
    })
    expect(decideOutcome(coach, null)).toBe('tour')
  })

  it('never routes a manager to the wizard either', () => {
    // §5.1's wizard is the OWNER's: 'Once the owner accepts, the staff app and dashboard
    // route them into a resumable wizard.'
    const manager = session({
      studios: [{ ...BASE_STUDIO, roles: ['manager'] }],
    })
    expect(decideOutcome(manager, null)).toBe('tour')
  })
})

describe('Resolve', () => {
  it('never asks /setup on behalf of a coach (S4.1)', async () => {
    // §3.2 keeps /setup at owner+manager and decideOutcome routes only an OWNER into the
    // wizard — so asking for anyone else bought a guaranteed 403 on every launch.
    const fetchSpy = vi.fn(async () => new Response('', { status: 403 }))
    vi.stubGlobal('fetch', fetchSpy)
    render(
      <Resolve
        session={session({ studios: [{ ...BASE_STUDIO, roles: ['coach'] }] })}
        locale="he"
        wizard={<p data-testid="wizard-stub" />}
      />,
    )
    await waitFor(() => expect(screen.getByTestId('staff-tour')).toBeInTheDocument())
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows the refusal to an identity with no role assignment', async () => {
    render(
      <Resolve
        session={session({ access: { staff: false, parent: true }, studios: [] })}
        locale="he"
        wizard={null}
      />,
    )
    await waitFor(() => expect(screen.getByTestId('staff-refusal')).toBeInTheDocument())
  })

  it('routes an owner who has never dismissed the wizard into it', async () => {
    stubSetup(null)
    render(<Resolve session={session()} locale="he" wizard={<p data-testid="wizard-stub" />} />)
    await waitFor(() => expect(screen.getByTestId('staff-wizard')).toBeInTheDocument())
  })

  it('routes an owner who dismissed it into the tour', async () => {
    stubSetup('2026-08-25T10:00:00+00:00')
    render(<Resolve session={session()} locale="he" wizard={<p data-testid="wizard-stub" />} />)
    await waitFor(() => expect(screen.getByTestId('staff-tour')).toBeInTheDocument())
  })

  it('survives the wizard being reopened by hand after a dismiss', async () => {
    // The rail's own entry points stay reachable from Settings; what dismiss stops is the
    // AUTO-routing, which is exactly the distinction §5.1 draws.
    stubSetup('2026-08-25T10:00:00+00:00')
    render(<Resolve session={session()} locale="he" wizard={<p data-testid="wizard-stub" />} />)
    await waitFor(() => expect(screen.queryByTestId('staff-wizard')).not.toBeInTheDocument())
  })

  it('assumes the wizard was dismissed when the question cannot be answered', async () => {
    // §10.2 — the staff app works offline. Routing a returning owner into a setup wizard
    // because their train went into a tunnel would be far worse than skipping it.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline')
      }),
    )
    render(<Resolve session={session()} locale="he" wizard={<p data-testid="wizard-stub" />} />)
    await waitFor(() => expect(screen.getByTestId('staff-tour')).toBeInTheDocument())
  })
})

// -- the invited coach who has not redeemed yet -------------------------------
//
// F5's invitation is a code the manager copies off the dashboard and hands over; there is
// no mailer anywhere in this product. The dashboard says so on the invite screen, in as
// many words: 'קוד ההזמנה מוצג פעם אחת בלבד — שלחו אותו למוזמן. בכניסה לאפליקציה בוחרים
// "יש לי קוד הזמנה".'
//
// Until that code is redeemed the invited coach holds no Person bound to their identity,
// so §6.1's `access.staff` query answers false and this component takes the refusal arm.
// The refusal arm has to carry the redemption, because it is the ONLY screen an invited
// coach can reach — which is exactly why the parent app renders the same code entry
// beneath its own refusal.
describe('the invited coach', () => {
  it('can enter the invitation code the dashboard told them to enter', async () => {
    render(
      <Resolve
        session={session({ access: { staff: false, parent: false }, studios: [] })}
        locale="he"
        wizard={null}
      />,
    )
    await waitFor(() => expect(screen.getByTestId('staff-refusal')).toBeInTheDocument())
    expect(
      screen.getByRole('button', { name: t('he', 'common.auth.haveInviteCode') }),
    ).toBeInTheDocument()
  })

  it('labels the invitation-code input', async () => {
    // .claude/rules/ui-rtl-a11y.md — every input has an associated <label>.
    render(
      <Resolve
        session={session({ access: { staff: false, parent: false }, studios: [] })}
        locale="he"
        wizard={null}
      />,
    )
    await waitFor(() => expect(screen.getByTestId('staff-refusal')).toBeInTheDocument())
    expect(screen.getByLabelText(t('he', 'common.auth.inviteCodeLabel'))).toBeInTheDocument()
  })

  it('redeems the typed code and reloads the session', async () => {
    // The seam, not the control: a rendered button and a labelled input prove nothing
    // about whether the code reaches `accept-invitation`. This asserts the whole mapping
    // — typing → POST → reload — because a button wired to nothing renders identically.
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response('{}', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const s = session({ access: { staff: false, parent: false }, studios: [] })
    render(<Resolve session={s} locale="he" wizard={null} />)

    await waitFor(() => expect(screen.getByTestId('staff-refusal')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(t('he', 'common.auth.inviteCodeLabel')), {
      target: { value: 'tok-coach' },
    })
    fireEvent.click(screen.getByRole('button', { name: t('he', 'common.auth.haveInviteCode') }))

    await waitFor(() => expect(s.reload).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/auth/accept-invitation')
    expect(String(init?.body)).toContain('tok-coach')
  })

  it('leaves the code on screen when the redeem is refused', async () => {
    // A wrong or spent code must not reload into the same refusal with the field wiped —
    // that is a coach retyping a 43-character token with nothing telling them why.
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response('{}', { status: 400 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const s = session({ access: { staff: false, parent: false }, studios: [] })
    render(<Resolve session={s} locale="he" wizard={null} />)

    await waitFor(() => expect(screen.getByTestId('staff-refusal')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(t('he', 'common.auth.inviteCodeLabel')), {
      target: { value: 'tok-bad' },
    })
    fireEvent.click(screen.getByRole('button', { name: t('he', 'common.auth.haveInviteCode') }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(s.reload).not.toHaveBeenCalled()
    expect(screen.getByLabelText(t('he', 'common.auth.inviteCodeLabel'))).toHaveValue('tok-bad')
  })
})
