// **Proof that 9a/1d and 9b are reachable, not merely built.**
//
// The lane shipped these screens with passing component tests and no way to click to
// them: both `App.tsx` files imported nothing from this folder. Component tests cannot
// catch that — they render the component directly, which is exactly the thing a user
// cannot do. This file renders `App` and navigates the way a coach does, by the hash.
//
// It lives in `features/schedule/` rather than beside `App.test.tsx` because
// `src/App.test.tsx` belongs to M1. It reaches up into `App` deliberately: the assertion
// is about the wiring between the two, and it belongs with the half that keeps changing.
//
// **`staff-today` alone is not the assertion.** `features/identity/StaffTour.tsx` renders
// that same test id once the tour is finished, so a test pinned to it would pass on a
// screen this lane did not draw. `open-date-picker` exists only in `ScheduleSection`.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import App from '../../App'

const STUDIO = {
  studio_id: 'st-1',
  studio_name: 'מועדון בדיקה',
  studio_is_demo: false,
  person_id: 'p-coach',
  roles: ['lead_coach'],
  is_guardian: false,
}

/**
 * A signed-in staff session, served to both calls `useSession` makes.
 *
 * `/auth/me` must carry `access`, `studios` and `active_studio_id` as well as the dev
 * flag: `useSession` REPLACES the refresh's state with that body, defaulting a missing
 * `access` to `{ staff: false, parent: false }`. A stub that answered `{ dev_tools: false }`
 * would sign the user back out one tick after signing them in, and the app would render
 * §6.1's refusal — which is what an earlier draft of this file actually observed.
 */
function signedInAs(roles: string[]) {
  const body = {
    access: { staff: roles.length > 0, parent: false },
    studios: [{ ...STUDIO, roles }],
    active_studio_id: 'st-1',
  }
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/auth/refresh')) {
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 900, ...body }), {
        status: 200,
      })
    }
    if (url.includes('/auth/me')) {
      return new Response(JSON.stringify({ ...body, dev_tools: false }), { status: 200 })
    }
    return new Response(JSON.stringify({ items: [] }), { status: 200 })
  })
}

beforeEach(() => {
  // §6.5 gates the whole staff app behind standalone display mode, and jsdom reports
  // `browser`. Without this the app renders the install walkthrough and nothing else —
  // which is why the existing App.test.tsx never reaches any signed-in screen.
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('standalone'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  globalThis.location.hash = ''
})

describe('the staff app mounts lane SCHEDULE', () => {
  it('renders 9a/1d היום at #/schedule', async () => {
    globalThis.location.hash = '#/schedule'
    vi.stubGlobal('fetch', signedInAs(['lead_coach']))

    render(<App />)

    await waitFor(() => expect(screen.getByTestId('staff-today')).toBeInTheDocument())
    // The half of the screen the tour cannot fake.
    expect(screen.getByTestId('open-date-picker')).toBeInTheDocument()
  })

  it('renders 9b at #/schedule/date', async () => {
    globalThis.location.hash = '#/schedule/date'
    vi.stubGlobal('fetch', signedInAs(['manager']))

    render(<App />)

    await waitFor(() => expect(screen.getByTestId('jump-to-today')).toBeInTheDocument())
  })

  it('offers the schedule in the nav drawer, so the hash is not the only way in', async () => {
    // A screen reachable only by typing a URL is not reachable on a phone. The drawer
    // renders nothing while closed, so this opens it the way a coach does.
    globalThis.location.hash = ''
    vi.stubGlobal('fetch', signedInAs(['lead_coach']))

    render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: t('he', 'common.nav.menu') }))
    // Two ways in exist since the design pass — the drawer entry and the tab bar —
    // and both must point at the same place. The assertion keeps covering both.
    const links = await screen.findAllByRole('link', { name: t('he', 'common.nav.schedule') })
    for (const link of links) expect(link).toHaveAttribute('href', '#/schedule')
    expect(links.length).toBeGreaterThan(0)
  })

  it('leaves §6.1 first-run routing alone on every other hash', async () => {
    // The schedule branch must not become the app's default screen: `Resolve` still owns
    // the wizard/tour/refusal decision.
    globalThis.location.hash = ''
    vi.stubGlobal('fetch', signedInAs(['lead_coach']))

    render(<App />)

    await waitFor(() => expect(screen.getByTestId('staff-tour')).toBeInTheDocument())
    expect(screen.queryByTestId('open-date-picker')).toBeNull()
  })

  it('refuses a guardian the schedule even at #/schedule', async () => {
    // §6.1's third arm. A hash is typed by whoever is holding the phone, so the access
    // check cannot live in the link.
    globalThis.location.hash = '#/schedule'
    vi.stubGlobal('fetch', signedInAs([]))

    render(<App />)

    await waitFor(() => expect(screen.getByTestId('staff-refusal')).toBeInTheDocument())
    expect(screen.queryByTestId('open-date-picker')).toBeNull()
  })
})
