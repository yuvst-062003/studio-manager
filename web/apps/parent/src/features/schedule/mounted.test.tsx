// **Proof that 12b is reachable, not merely built.**
//
// The staff app's twin of this file explains the reason at length: the lane shipped this
// screen with passing component tests and no way to click to it, because `App.tsx`
// imported nothing from this folder. A component test renders the component directly,
// which is exactly the thing a guardian cannot do. This one renders `App` and navigates
// the way a guardian does — by the hash, and by the nav drawer.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import App from '../../App'

const STUDIO = {
  studio_id: 'st-1',
  studio_name: 'מועדון בדיקה',
  studio_is_demo: false,
  person_id: 'p-guardian',
  roles: [],
  is_guardian: true,
}

/**
 * A signed-in guardian, served to both calls `useSession` makes.
 *
 * `/auth/me` carries the full session shape and not only `dev_tools`: `useSession`
 * REPLACES the refresh's state with that body and defaults a missing `access` to
 * `{ staff: false, parent: false }`, so a thinner stub signs the guardian straight back
 * out and the app renders §6.1's refusal instead of the screen under test.
 */
function signedInAs({ parent }: { parent: boolean }) {
  const body = {
    access: { staff: false, parent },
    studios: [{ ...STUDIO, is_guardian: parent }],
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
  // §6.5 gates the parent app behind standalone display mode too, and jsdom reports
  // `browser`. Without this the app renders the install walkthrough and nothing else.
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

describe('the parent app mounts lane SCHEDULE', () => {
  it('renders 12b לוח הילד at #/calendar', async () => {
    globalThis.location.hash = '#/calendar'
    vi.stubGlobal('fetch', signedInAs({ parent: true }))

    render(<App />)

    await waitFor(() => expect(screen.getByTestId('child-calendar')).toBeInTheDocument())
  })

  it('offers the calendar in the nav drawer, so the hash is not the only way in', async () => {
    // A screen reachable only by typing a URL is not reachable on a phone. The drawer
    // renders nothing while closed, so this opens it the way a guardian does.
    globalThis.location.hash = ''
    vi.stubGlobal('fetch', signedInAs({ parent: true }))

    render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: t('he', 'common.nav.menu') }))
    const link = await screen.findByRole('link', { name: t('he', 'schedule.calendar.title') })
    expect(link).toHaveAttribute('href', '#/calendar')
  })

  it('leaves home as home on every other hash', async () => {
    // Unlike the staff app, an unknown hash is NOT the calendar: the parent app's default
    // screen is M1's home, and claiming the fallback would quietly replace it.
    globalThis.location.hash = ''
    vi.stubGlobal('fetch', signedInAs({ parent: true }))

    render(<App />)

    await waitFor(() => expect(screen.getByTestId('parent-home')).toBeInTheDocument())
    expect(screen.queryByTestId('child-calendar')).toBeNull()
  })

  it('refuses a non-guardian the calendar even at #/calendar', async () => {
    // §6.1's refusal arm. A hash is typed by whoever is holding the phone, so the access
    // check cannot live in the link.
    globalThis.location.hash = '#/calendar'
    vi.stubGlobal('fetch', signedInAs({ parent: false }))

    render(<App />)

    await waitFor(() => expect(screen.getByTestId('parent-refusal')).toBeInTheDocument())
    expect(screen.queryByTestId('child-calendar')).toBeNull()
  })
})
