// §6.1's staff first-launch branch, all three arms:
//
//   owner of a studio with no classes yet → studio setup wizard, resumable
//   manager / coach with role assignments → 3-screen tour → offline priming → Today
//   no role assignment anywhere           → the refusal screen
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
    actingAsPersonId: null,
    actingAsLabel: null,
    activeStudioName: 'מועדון',
    reload: vi.fn(),
    signOut: vi.fn(),
    ...over,
  } as Session
}

function stubClasses(items: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ items }), { status: 200 })),
  )
}

describe('decideOutcome', () => {
  it('refuses an identity with no role assignment anywhere', () => {
    // §3.1 — the staff app asks 'do you hold any role assignment?', which is a QUERY.
    expect(decideOutcome(session({ access: { staff: false, parent: true } }), true)).toBe('refused')
  })

  it('refuses before it even asks about classes', () => {
    // The refusal does not depend on the studio's state, so it must not wait on a request
    // that will never be authorised anyway.
    expect(decideOutcome(session({ access: { staff: false, parent: false } }), null)).toBe(
      'refused',
    )
  })

  it('routes an owner with no classes to the wizard', () => {
    expect(decideOutcome(session(), false)).toBe('wizard')
  })

  it('routes an owner whose studio already has classes to the tour', () => {
    expect(decideOutcome(session(), true)).toBe('tour')
  })

  it('never routes a coach to the wizard', () => {
    // §3.2 — 'Studio settings, training year, rollover: owner ✓ manager ✓' and nothing
    // else. A coach who reached the wizard could create the studio's whole structure.
    const coach = session({
      studios: [{ ...BASE_STUDIO, roles: ['lead_coach'] }],
    })
    expect(decideOutcome(coach, false)).toBe('tour')
  })

  it('never routes a manager to the wizard either', () => {
    // §5.1's wizard is the OWNER's: 'Once the owner accepts, the staff app and dashboard
    // route them into a resumable wizard.'
    const manager = session({
      studios: [{ ...BASE_STUDIO, roles: ['manager'] }],
    })
    expect(decideOutcome(manager, false)).toBe('tour')
  })
})

describe('Resolve', () => {
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

  it('routes an owner with no classes into the wizard', async () => {
    stubClasses([])
    render(<Resolve session={session()} locale="he" wizard={<p data-testid="wizard-stub" />} />)
    await waitFor(() => expect(screen.getByTestId('setup-wizard')).toBeInTheDocument())
  })

  it('routes an owner with classes into the tour', async () => {
    stubClasses([{ id: 'c', name: "ג'ודו" }])
    render(<Resolve session={session()} locale="he" wizard={<p data-testid="wizard-stub" />} />)
    await waitFor(() => expect(screen.getByTestId('staff-tour')).toBeInTheDocument())
  })

  it('assumes the studio is set up when the question cannot be answered', async () => {
    // §10.2 — the staff app works offline. Routing a returning coach into a setup wizard
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
