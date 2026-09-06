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

/** A club with everything filled in, so the המועדון sheet draws every control it can. */
const CLUB = {
  id: 'st-1',
  name: 'גלדיאטור',
  slug: 'gladiator',
  address: 'ששת הימים 4, נתניה',
  phone: '054-2778878',
  email: 'club@example.invalid',
}

/** Answers `/me/studio` with a real club and every other read with an empty list. */
function stubClub(club: Partial<typeof CLUB> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const body = url.includes('/me/studio')
        ? JSON.stringify({ ...CLUB, ...club })
        : '{"items":[]}'
      return new Response(body, { status: 200 })
    }),
  )
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

// The המועדון sheet, after the owner's review of 2026-09-06: two labelled groups rather
// than one run of buttons, email first, and a way to actually navigate there.
describe('the המועדון sheet', () => {
  async function openClub() {
    renderScreen()
    await userEvent.click(await screen.findByTestId('profile-row-club'))
    return screen.findByTestId('sheet-club')
  }

  it('offers email, WhatsApp and a call, with email first', async () => {
    stubClub()
    const sheet = await openClub()
    const actions = ['profile-contact-email', 'profile-contact-whatsapp', 'profile-contact-call']
    for (const id of actions) expect(sheet).toContainElement(screen.getByTestId(id))
    // Order is the owner's ask, so it is asserted rather than left to source position:
    // email leads because it is the one that interrupts nobody.
    const rendered = actions.map((id) => screen.getByTestId(id))
    expect(rendered[0]!.compareDocumentPosition(rendered[1]!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('draws no email button for a club that has not set one', async () => {
    // The reason none was visible on staging: the code was right and the column was empty.
    // A mailto: to a guessed address is a message the club never receives.
    stubClub({ email: undefined })
    const sheet = await openClub()
    expect(sheet).toContainElement(screen.getByTestId('profile-contact-call'))
    expect(screen.queryByTestId('profile-contact-email')).toBeNull()
  })

  it('opens Waze and Maps behind one הוראות הגעה press, both carrying the address', async () => {
    stubClub()
    await openClub()
    // Collapsed until asked: the parent said "directions", not "choose an app".
    expect(screen.getByTestId('club-route-waze')).not.toBeVisible()

    await userEvent.click(screen.getByTestId('club-directions-open'))

    const waze = screen.getByTestId('club-route-waze')
    const maps = screen.getByTestId('club-route-maps')
    expect(waze).toBeVisible()
    const address = encodeURIComponent(CLUB.address)
    // https and not waze:// — an app scheme opens nothing when the app is absent, which is
    // a dead tap with no error.
    expect(waze).toHaveAttribute('href', `https://waze.com/ul?q=${address}&navigate=yes`)
    expect(maps).toHaveAttribute(
      'href',
      `https://www.google.com/maps/search/?api=1&query=${address}`,
    )
  })

  it('offers no navigation at all for a club with no address', async () => {
    // A route link with an empty query opens a map of nowhere.
    stubClub({ address: undefined })
    await openClub()
    expect(screen.queryByTestId('club-directions-open')).toBeNull()
    expect(screen.getByText(t('he', 'people.profile.dojoNoAddress'))).toBeInTheDocument()
  })
})

// נגישות moved into פרופיל → הגדרות, and off every other signed-in screen. `App.tsx` holds
// the other half of this rule; here we prove the row exists and opens the real panel, so
// "removed from everywhere" cannot quietly mean "removed".
describe('the accessibility menu inside הגדרות', () => {
  it('opens the same adjustments panel from a settings row', async () => {
    stubClub()
    renderScreen()
    await userEvent.click(await screen.findByTestId('profile-row-settings'))
    const trigger = await screen.findByTestId('a11y-open')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(trigger)

    expect(await screen.findByRole('dialog', { name: t('he', 'common.a11y.title') })).toBeInTheDocument()
    expect(screen.getByText(t('he', 'common.a11y.statement.title'))).toBeInTheDocument()
  })
})
