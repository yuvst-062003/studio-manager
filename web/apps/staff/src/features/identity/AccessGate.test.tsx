// §6.1's staff first-launch refusal, and the invited coach's redemption in front of it.
//
// Split out of `Resolve.test.tsx` (2026-09-02) when the refusal itself moved out of
// `Resolve` and into this component — see `AccessGate.tsx`'s header for why. Everything
// this file asserts used to be asserted against `<Resolve>` directly; the behavior is
// unchanged, only which component owns it.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { AccessGate } from './AccessGate'
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
    displayName: null,
    email: null,
    reload: vi.fn(),
    signOut: vi.fn(),
    ...over,
  } as Session
}

const protectedContent = <div data-testid="protected-content" />

describe('AccessGate', () => {
  it('renders the children once access.staff is confirmed', () => {
    render(
      <AccessGate session={session()} locale="he">
        {protectedContent}
      </AccessGate>,
    )
    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    expect(screen.queryByTestId('staff-refusal')).toBeNull()
  })

  it('refuses an identity with no role assignment anywhere, without mounting the children', async () => {
    render(
      <AccessGate session={session({ access: { staff: false, parent: true }, studios: [] })} locale="he">
        {protectedContent}
      </AccessGate>,
    )
    await waitFor(() => expect(screen.getByTestId('staff-refusal')).toBeInTheDocument())
    // The point of this component: whatever the caller wrapped (AppShell, in App.tsx)
    // never mounts for a refused session.
    expect(screen.queryByTestId('protected-content')).toBeNull()
  })

  it('tells a refused visitor which account they are signed in as (2026-09-03)', async () => {
    // The seam, not the component: `RefusalScreen`'s own tests prove it renders an
    // `email` prop it is handed. This proves `AccessGate` actually hands it one, from
    // the real session — a field dropped between fetch and prop passes every test that
    // only constructs `RefusalScreen`'s props by hand.
    render(
      <AccessGate
        session={session({
          access: { staff: false, parent: false },
          studios: [],
          email: 'wrong.account@example.invalid',
        })}
        locale="he"
      >
        {protectedContent}
      </AccessGate>,
    )
    await waitFor(() => expect(screen.getByTestId('staff-refusal')).toBeInTheDocument())
    expect(screen.getByTestId('refusal-account')).toHaveTextContent(
      'wrong.account@example.invalid',
    )
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
      <AccessGate session={session({ access: { staff: false, parent: false }, studios: [] })} locale="he">
        {protectedContent}
      </AccessGate>,
    )
    await waitFor(() => expect(screen.getByTestId('staff-refusal')).toBeInTheDocument())
    expect(
      screen.getByRole('button', { name: t('he', 'common.auth.haveInviteCode') }),
    ).toBeInTheDocument()
  })

  it('labels the invitation-code input', async () => {
    // .claude/rules/ui-rtl-a11y.md — every input has an associated <label>.
    render(
      <AccessGate session={session({ access: { staff: false, parent: false }, studios: [] })} locale="he">
        {protectedContent}
      </AccessGate>,
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
    render(
      <AccessGate session={s} locale="he">
        {protectedContent}
      </AccessGate>,
    )

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
    render(
      <AccessGate session={s} locale="he">
        {protectedContent}
      </AccessGate>,
    )

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
