// פרופיל, and the difference between "nothing" and "we could not find out".
//
// Every read on this screen used to end `.catch(() => setChildren([]))`. A parent on a
// train was told they had no trainees; the payments sheet span on 'טוען…' for ever,
// because `coverage` is null until both the balance and the charges have landed and
// nothing ever set them. An empty list is an ANSWER. A failed read is not one, and the
// tests below are all about that distinction.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@studio/ui'
import { t } from '@studio/i18n'
import { ProfileScreen } from './ProfileScreen'

afterEach(() => vi.unstubAllGlobals())

const ACCOUNT = {
  locale: 'he' as const,
  studios: [],
  activeStudioId: null,
  onSwitchStudio: vi.fn(),
  onSignOut: vi.fn(),
}

/** Every read answers `status`, so one number puts the whole screen in one state. */
function stubAll(status: number, body = '{"items":[]}') {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input))
      return new Response(status === 200 ? body : 'nope', { status })
    }),
  )
  return calls
}

function renderScreen() {
  render(
    // `ProfileScreen` reads `useTheme()` for the הגדרות sheet's light/dark control.
    <ThemeProvider>
      <ProfileScreen locale="he" onLocaleChange={vi.fn()} account={ACCOUNT as never} />
    </ThemeProvider>,
  )
}

describe('when a read fails', () => {
  it('does NOT tell a family they have no trainees', async () => {
    stubAll(500)
    renderScreen()
    await userEvent.click(await screen.findByTestId('profile-row-trainees'))
    const sheet = await screen.findByTestId('sheet-trainees')
    expect(sheet).toContainElement(screen.getByTestId('profile-sheet-failed'))
  })

  it('does not leave the payments sheet spinning for ever', async () => {
    // `coverage` stays null until BOTH the balance and the charges land. Before the flag,
    // a failure on either left 'טוען…' on screen with nothing that could ever clear it.
    stubAll(500)
    renderScreen()
    await userEvent.click(await screen.findByTestId('profile-row-payments'))
    expect(await screen.findByTestId('profile-sheet-failed')).toBeInTheDocument()
    expect(screen.queryByText(t('he', 'people.profile.loading'))).toBeNull()
  })

  it('does not blame the club for the network', async () => {
    // Without the flag the sheet reads "המועדון לא הגדיר כתובת" and "המועדון עדיין לא הגדיר
    // פרטי יצירת קשר" — two statements about the CLUB made out of a failed request.
    stubAll(500)
    renderScreen()
    await userEvent.click(await screen.findByTestId('profile-row-club'))
    expect(await screen.findByTestId('profile-sheet-failed')).toBeInTheDocument()
  })

  it('re-reads when the parent retries, rather than only clearing the message', async () => {
    const calls = stubAll(500)
    renderScreen()
    await userEvent.click(await screen.findByTestId('profile-row-trainees'))
    await screen.findByTestId('profile-sheet-failed')
    const before = calls.length
    await userEvent.click(screen.getByTestId('profile-sheet-retry'))
    await waitFor(() => expect(calls.length).toBeGreaterThan(before))
  })

  it('does not leave the פרטים אישיים row doing nothing when its read failed', async () => {
    // The sheet is gated on `details`, so a failed read turned that row into a button that
    // opened nothing at all — the worst of the three, because it looks like a broken app
    // rather than a broken network.
    stubAll(500)
    renderScreen()
    await userEvent.click(await screen.findByTestId('profile-row-personal'))
    expect(await screen.findByTestId('sheet-personal-failed')).toBeInTheDocument()
    expect(screen.getByTestId('profile-sheet-failed')).toBeInTheDocument()
  })

  it('says nothing when the reads succeed', async () => {
    stubAll(200)
    renderScreen()
    await userEvent.click(await screen.findByTestId('profile-row-trainees'))
    await screen.findByTestId('sheet-trainees')
    expect(screen.queryByTestId('profile-sheet-failed')).toBeNull()
  })
})
