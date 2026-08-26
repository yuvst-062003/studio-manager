// Parent artboards 13a (mobile) and 13c (desktop). One component, two widths.
//
// The tests that matter are the ones about what a STRANGER sees: this is the only screen in
// the product somebody reaches with no account, and §5.4a calls it "the club's shop window,
// not a form".
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { DIRECTION, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { THEME_STORAGE_KEY, ThemeProvider } from '@studio/ui'
import type { ResolvedTheme } from '@studio/ui'
import { PublicLanding } from './PublicLanding'
import type { LandingClient, PublicLanding as Landing } from './landingClient'

const LANDING: Landing = {
  studio_name: 'מועדון ג׳ודו תל אביב',
  slug: 'judo-tel-aviv',
  logo_url: null,
  default_locale: 'he',
  headline: 'ג׳ודו לילדים מגיל 5',
  about: 'מתאמנים באולם מוארך',
  address: 'הרצל 12, תל אביב',
  photo_urls: [],
  groups: [
    {
      id: 'g1',
      name: 'מתחילים',
      description: 'צעד ראשון',
      age_min: 5,
      age_max: 8,
      training_weekdays: [0, 3],
    },
  ],
}

function clientReturning(landing: Landing | Error): LandingClient {
  return {
    landing: vi.fn(() =>
      landing instanceof Error ? Promise.reject(landing) : Promise.resolve(landing),
    ),
    trialSlots: vi.fn(() => Promise.resolve({ items: [] })),
    book: vi.fn(() => Promise.resolve(new Response(null, { status: 201 }))),
  } as unknown as LandingClient
}

const DIRECTIONS = [
  { locale: 'he', dir: 'rtl' },
  { locale: 'en', dir: 'ltr' },
] as const satisfies readonly { locale: Locale; dir: 'rtl' | 'ltr' }[]

function renderIn(
  ui: ReactElement,
  { locale = 'he', theme = 'light' }: { locale?: Locale; theme?: ResolvedTheme } = {},
) {
  globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme)
  document.documentElement.lang = locale
  document.documentElement.dir = DIRECTION[locale]
  return render(<ThemeProvider>{ui}</ThemeProvider>)
}

describe('PublicLanding — 13a / 13c', () => {
  it('renders the club’s own name as the heading', async () => {
    // The club's name is DATA, not a translated string: it is what the club calls itself.
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    expect(
      await screen.findByRole('heading', { level: 1, name: /מועדון ג׳ודו תל אביב/ }),
    ).toBeInTheDocument()
  })

  it('renders the one offer §5.4a allows', async () => {
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    expect(
      await screen.findByRole('heading', { name: t('he', 'people.landing.title') }),
    ).toBeInTheDocument()
  })

  it('shows the club and its groups with NO session at all', async () => {
    // §5.4a — the shop window is readable by a stranger. The sign-in wall stands in front
    // of *booking*, never in front of *reading*, and a wall here is a marketing asset
    // nobody can read.
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    expect(await screen.findByTestId('landing-group-name')).toHaveTextContent('מתחילים')
    expect(screen.getByTestId('landing-headline')).toBeInTheDocument()
    expect(screen.getByTestId('landing-address')).toBeInTheDocument()
  })

  it('renders each group’s training days', async () => {
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    const days = await screen.findByTestId('landing-group-days')
    expect(days).toHaveTextContent(t('he', 'people.weekdays.0'))
    expect(days).toHaveTextContent(t('he', 'people.weekdays.3'))
  })

  it('says a group has no timetable rather than rendering a blank line', async () => {
    const noSchedule: Landing = {
      ...LANDING,
      groups: [{ ...LANDING.groups![0]!, training_weekdays: [] }],
    }
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(noSchedule)} />)
    expect(await screen.findByTestId('landing-group-no-schedule')).toHaveTextContent(
      t('he', 'people.weekdays.noSchedule'),
    )
  })

  it('renders each group’s age range so the page can filter by the child’s age', async () => {
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    expect(await screen.findByTestId('landing-group-ages')).toHaveTextContent('5')
  })

  it('tells an unknown slug apart from a club with no timetable', async () => {
    // Two different situations, two different sentences. "Something went wrong" for both
    // would send somebody to the wrong club hunting for a typo.
    render(
      <PublicLanding
        slug="nope"
        locale="he"
        client={clientReturning(new Error('404 not found'))}
      />,
    )
    expect(await screen.findByText(t('he', 'people.landing.notFound'))).toBeInTheDocument()
  })

  it('explains a club whose timetable is not built yet', async () => {
    render(
      <PublicLanding
        slug="judo-tel-aviv"
        locale="he"
        client={clientReturning(new Error('503 unavailable'))}
      />,
    )
    expect(
      await screen.findByText(t('he', 'people.landing.scheduleComeLater')),
    ).toBeInTheDocument()
  })

  it('starts the booking flow behind the sign-in wall', async () => {
    // §5.4a step 1 — the parent authenticates BEFORE entering child details.
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    await userEvent.click(await screen.findByTestId('landing-start-booking'))
    expect(screen.getByTestId('booking-sign-in')).toBeInTheDocument()
    expect(screen.queryByTestId('booking-children')).toBeNull()
  })

  it('gives the logo an accessible name when the club has one', async () => {
    const withLogo: Landing = { ...LANDING, logo_url: '/api/v1/public/studios/x/logo' }
    render(<PublicLanding slug="x" locale="he" client={clientReturning(withLogo)} />)
    expect(await screen.findByTestId('landing-logo')).toHaveAccessibleName(LANDING.studio_name)
  })

  it.each(DIRECTIONS)('renders in $locale ($dir) with no physical CSS', async ({ locale }) => {
    // SPEC §9 — genuinely bidirectional. This is the first screen a stranger sees, in
    // whichever language their phone is set to.
    const { container } = renderIn(
      <PublicLanding slug="judo-tel-aviv" locale={locale} client={clientReturning(LANDING)} />,
      { locale },
    )
    await waitFor(() => expect(screen.getByTestId('public-landing')).toBeInTheDocument())
    const styles = [...container.querySelectorAll<HTMLElement>('[style]')].map(
      (node) => node.getAttribute('style') ?? '',
    )
    for (const style of styles) {
      expect(style).not.toMatch(/margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/)
    }
  })

  it.each(['light', 'dark'] as const)('renders in %s', async (theme) => {
    renderIn(
      <PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />,
      { theme },
    )
    await waitFor(() => expect(screen.getByTestId('public-landing')).toBeInTheDocument())
    expect(document.documentElement).toHaveAttribute('data-theme', theme)
  })

  it('is one component at both widths, not two trees', async () => {
    // 13a and 13c differ by a CSS grid that collapses. Two components would be two places
    // to change the club's copy, and the desktop one would rot first.
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    const page = await screen.findByTestId('public-landing')
    expect(page).toHaveStyle({ display: 'grid' })
  })
})
