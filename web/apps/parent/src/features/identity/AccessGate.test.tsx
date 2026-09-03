// §6.1's parent first-launch refusal, and the invitation-link race in front of it.
//
// Split out of `Resolve.test.tsx` (2026-09-02) when the refusal itself moved out of
// `Resolve` and into this component — see `AccessGate.tsx`'s header for why. Everything
// this file asserts used to be asserted against `<Resolve>` directly; the behavior is
// unchanged, only which component owns it.
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { AccessGate } from './AccessGate'
import type { Session } from '@studio/core'

function studio(id: string, name: string) {
  return {
    studio_id: id,
    studio_name: name,
    studio_is_demo: false,
    person_id: `p-${id}`,
    roles: [] as string[],
    is_guardian: true,
  }
}

function session(over: Partial<Session> = {}): Session {
  return {
    status: 'signed-in',
    access: { staff: false, parent: true },
    studios: [studio('a', 'מועדון א')],
    activeStudioId: 'a',
    devTools: false,
    isPlatformAdmin: false,
    actingAsPersonId: null,
    actingAsLabel: null,
    activeStudioName: 'מועדון א',
    displayName: null,
    email: null,
    reload: vi.fn(),
    signOut: vi.fn(),
    ...over,
  } as Session
}

const protectedContent = <div data-testid="protected-content" />

describe('AccessGate', () => {
  it('renders the children once access.parent is confirmed', () => {
    render(
      <AccessGate session={session()} locale="he">
        {protectedContent}
      </AccessGate>,
    )
    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    expect(screen.queryByTestId('parent-refusal')).toBeNull()
  })

  it('refuses a staff member with no children, without rendering the children at all', async () => {
    // §6.1's table — 'owner / manager: ✓ parent app IF they are also a guardian.' A
    // manager with no children lands on the second refusal screen, and it must be
    // decided by the guardian query rather than by access.staff.
    render(
      <AccessGate
        session={session({ access: { staff: true, parent: false }, studios: [] })}
        locale="he"
      >
        {protectedContent}
      </AccessGate>,
    )
    await waitFor(() => expect(screen.getByTestId('parent-refusal')).toBeInTheDocument())
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
    await waitFor(() => expect(screen.getByTestId('parent-refusal')).toBeInTheDocument())
    expect(screen.getByTestId('refusal-account')).toHaveTextContent(
      'wrong.account@example.invalid',
    )
  })

  it('offers the invitation-code path when nothing matched', async () => {
    // §6.1 step 3 — 'no match → "לא מצאנו אותך" [ יש לי קוד הזמנה ]'. Without it a
    // correctly-invited parent whose email differs by a character has no way forward.
    render(
      <AccessGate session={session({ access: { staff: false, parent: false } })} locale="he">
        {protectedContent}
      </AccessGate>,
    )
    await waitFor(() =>
      expect(screen.getByText(t('he', 'common.auth.notFound'))).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('button', { name: t('he', 'common.auth.haveInviteCode') }),
    ).toBeInTheDocument()
  })

  it('labels the invitation-code input', () => {
    // .claude/rules/ui-rtl-a11y.md — every input has an associated <label>.
    render(
      <AccessGate session={session({ access: { staff: false, parent: false } })} locale="he">
        {protectedContent}
      </AccessGate>,
    )
    expect(screen.getByLabelText(t('he', 'common.auth.inviteCodeLabel'))).toBeInTheDocument()
  })

  it('leaks nothing about the staff app in the refusal', () => {
    const { container } = render(
      <AccessGate
        session={session({ access: { staff: true, parent: false }, studios: [] })}
        locale="he"
      >
        {protectedContent}
      </AccessGate>,
    )
    expect(container.textContent).not.toMatch(/(מנהל|מאמן)\s*\d/)
  })
})

describe('the invitation LINK (2026-08-30)', () => {
  it('redeems ?invite= on arrival and reloads the session', async () => {
    // The manager's add-a-student screen hands the parent a URL carrying the token;
    // arriving with it IS the consent, so the field is pre-filled and the redeem fires
    // without retyping.
    window.history.replaceState(null, '', '/?invite=tok-123')
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response('{}', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const s = session({ access: { staff: false, parent: false } })
    render(
      <AccessGate session={s} locale="he">
        {protectedContent}
      </AccessGate>,
    )
    await waitFor(() => expect(s.reload).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/auth/accept-invitation')
    expect(String(init?.body)).toContain('tok-123')
    expect(screen.getByLabelText(t('he', 'common.auth.inviteCodeLabel'))).toHaveValue('tok-123')
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', '/')
  })

  it('does not accuse an invited parent of having no access while the redeem runs', async () => {
    // A parent who followed the manager's link is not refused -- they are mid-join. The
    // refusal screen renders on `!access.parent`, which is true for the whole round trip,
    // so the first thing the invited parent saw was "you do not have access here". That
    // is the one audience it must never show to: they are holding the club's own link.
    window.history.replaceState(null, '', '/?invite=tok-123')
    let release: (r: Response) => void = () => {}
    const pending = new Promise<Response>((resolve) => {
      release = resolve
    })
    vi.stubGlobal('fetch', vi.fn(() => pending))
    const s = session({ access: { staff: false, parent: false } })
    render(
      <AccessGate session={s} locale="he">
        {protectedContent}
      </AccessGate>,
    )

    // While the redeem is in flight: no refusal, and something that says what is going on.
    await waitFor(() => expect(screen.getByTestId('parent-joining')).toBeInTheDocument())
    expect(screen.queryByTestId('parent-refusal')).toBeNull()
    expect(screen.queryByTestId('protected-content')).toBeNull()

    release(new Response('{}', { status: 200 }))
    await waitFor(() => expect(s.reload).toHaveBeenCalled())
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', '/')
  })

  it('leaves the pre-filled manual path standing when the redeem fails', async () => {
    window.history.replaceState(null, '', '/?invite=tok-bad')
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response('{}', { status: 410 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const s = session({ access: { staff: false, parent: false } })
    render(
      <AccessGate session={s} locale="he">
        {protectedContent}
      </AccessGate>,
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(s.reload).not.toHaveBeenCalled()
    expect(screen.getByLabelText(t('he', 'common.auth.inviteCodeLabel'))).toHaveValue('tok-bad')
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', '/')
  })
})
