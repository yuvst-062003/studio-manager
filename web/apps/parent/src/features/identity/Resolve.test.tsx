// §6.1's parent first-launch branch.
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { Resolve } from './Resolve'
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
    reload: vi.fn(),
    signOut: vi.fn(),
    ...over,
  } as Session
}

describe('Resolve', () => {
  it('refuses a staff member with no children', async () => {
    // §6.1's table — 'owner / manager: ✓ parent app IF they are also a guardian.' A
    // manager with no children lands on the second refusal screen, and it must be
    // decided by the guardian query rather than by access.staff.
    render(
      <Resolve
        session={session({ access: { staff: true, parent: false }, studios: [] })}
        locale="he"
      />,
    )
    await waitFor(() => expect(screen.getByTestId('parent-refusal')).toBeInTheDocument())
  })

  it('offers the invitation-code path when nothing matched', async () => {
    // §6.1 step 3 — 'no match → "לא מצאנו אותך" [ יש לי קוד הזמנה ]'. Without it a
    // correctly-invited parent whose email differs by a character has no way forward.
    render(<Resolve session={session({ access: { staff: false, parent: false } })} locale="he" />)
    await waitFor(() =>
      expect(screen.getByText(t('he', 'common.auth.notFound'))).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('button', { name: t('he', 'common.auth.haveInviteCode') }),
    ).toBeInTheDocument()
  })

  it('labels the invitation-code input', () => {
    // .claude/rules/ui-rtl-a11y.md — every input has an associated <label>.
    render(<Resolve session={session({ access: { staff: false, parent: false } })} locale="he" />)
    expect(screen.getByLabelText(t('he', 'common.auth.inviteCodeLabel'))).toBeInTheDocument()
  })

  it('shows the studio picker to a guardian at more than one studio', async () => {
    // §6.1 step 4 — 'only shown if she belongs to more than one studio'.
    render(
      <Resolve
        session={session({
          studios: [studio('a', 'מועדון א'), studio('b', 'מועדון ב')],
          activeStudioId: null,
        })}
        locale="he"
      />,
    )
    await waitFor(() => expect(screen.getByTestId('studio-picker')).toBeInTheDocument())
  })

  it('skips the picker for a guardian at one studio', () => {
    render(<Resolve session={session()} locale="he" />)
    expect(screen.queryByTestId('studio-picker')).toBeNull()
    expect(screen.getByTestId('parent-home')).toBeInTheDocument()
  })

  it('leaks nothing about the staff app in the refusal', () => {
    const { container } = render(
      <Resolve
        session={session({ access: { staff: true, parent: false }, studios: [] })}
        locale="he"
      />,
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
    render(<Resolve session={s} locale="he" />)
    await waitFor(() => expect(s.reload).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/auth/accept-invitation')
    expect(String(init?.body)).toContain('tok-123')
    expect(screen.getByLabelText(t('he', 'common.auth.inviteCodeLabel'))).toHaveValue('tok-123')
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
    render(<Resolve session={s} locale="he" />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(s.reload).not.toHaveBeenCalled()
    expect(screen.getByLabelText(t('he', 'common.auth.inviteCodeLabel'))).toHaveValue('tok-bad')
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', '/')
  })
})
