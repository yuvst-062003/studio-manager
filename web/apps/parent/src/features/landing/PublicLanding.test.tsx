// The public landing page, in its two modes: the designed Gladiator page (the user's
// Stitch screens, hardcoded content — clubContent.ts) and the data-driven page every
// other slug gets.
//
// The tests that matter are the ones about what a STRANGER sees: this is the only screen
// in the product somebody reaches with no account, and §5.4a calls it "the club's shop
// window, not a form".
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
  phone: '052-1234567',
  photo_urls: [],
  belt_ladder: [
    { name: 'לבנה', color_hex: '#fffefb', secondary_color_hex: null },
    { name: 'צהובה', color_hex: '#f5d000', secondary_color_hex: null },
  ],
  trial_steps: ['מגיעים עשר דקות לפני', 'מתאמנים', 'מדברים עם המאמן'],
  groups: [
    {
      id: 'g1',
      name: 'מתחילים',
      description: 'צעד ראשון',
      age_min: 5,
      age_max: 8,
      training_weekdays: [0, 3],
      training_times: ['16:00'],
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

describe('PublicLanding — the shop window', () => {
  it('renders the club’s own name as the heading', async () => {
    // The club's name is DATA, not a translated string: it is what the club calls itself.
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    expect(
      await screen.findByRole('heading', { level: 1, name: /מועדון ג׳ודו תל אביב/ }),
    ).toBeInTheDocument()
  })

  it('offers the free trial as the hero’s one ask', async () => {
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    expect(await screen.findByTestId('landing-hero-cta')).toHaveTextContent(
      t('he', 'people.landing.freeTrial'),
    )
  })

  it('shows the club and its groups with NO session at all', async () => {
    // §5.4a — the shop window is readable by a stranger. The sign-in wall stands in front
    // of *booking*, never in front of *reading*, and a wall here is a marketing asset
    // nobody can read.
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    const names = await screen.findAllByTestId('landing-group-name')
    expect(names[0]).toHaveTextContent('מתחילים')
    expect(screen.getByTestId('landing-headline')).toBeInTheDocument()
    expect(screen.getByTestId('landing-address')).toBeInTheDocument()
  })

  it('places each group in every day column it trains on', async () => {
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    const week = await screen.findByTestId('landing-schedule')
    expect(week).toHaveTextContent(t('he', 'people.weekdays.0'))
    expect(week).toHaveTextContent(t('he', 'people.weekdays.3'))
    for (const day of [0, 3]) {
      const slot = screen.getByTestId(`landing-slot-${day}-g1`)
      expect(slot).toHaveTextContent('16:00')
      expect(slot).toHaveTextContent('מתחילים')
    }
    // A day nobody trains on is not a column — the phone pager has no empty pages.
    expect(week).not.toHaveTextContent(t('he', 'people.weekdays.1'))
  })

  it('renders no schedule section when no group has a timetable yet', async () => {
    render(
      <PublicLanding
        slug="judo-tel-aviv"
        locale="he"
        client={clientReturning({
          ...LANDING,
          groups: [{ ...LANDING.groups![0]!, training_weekdays: [] }],
        })}
      />,
    )
    await screen.findByTestId('landing-hero')
    expect(screen.queryByTestId('landing-schedule')).toBeNull()
  })

  it('renders each group’s age range low-first, so the page can filter by the child’s age', async () => {
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    const ages = await screen.findAllByTestId('landing-group-ages')
    // RangeText's LTR island — bidi must not reorder 5–8 into 8–5.
    expect(ages[0]!.querySelector('bdi[dir="ltr"]')).toHaveTextContent('5–8')
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

  it('keeps the flow closed on load — reading first, booking on request', async () => {
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    await screen.findByTestId('landing-hero')
    expect(screen.queryByTestId('booking-dialog')).toBeNull()
    expect(screen.queryByTestId('booking-sign-in')).toBeNull()
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
    // The phone and the desk differ by CSS that collapses. Two components would be two
    // places to change the club's copy, and the desktop one would rot first.
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    const page = await screen.findByTestId('public-landing')
    expect(page).toHaveStyle({ display: 'grid' })
  })
})

describe('the header and footer chrome', () => {
  it('carries the brand row — name, phone — and one way in that opens the flow', async () => {
    const user = userEvent.setup()
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    const header = await screen.findByTestId('landing-header')
    expect(header).toHaveTextContent(LANDING.studio_name)
    expect(screen.getByTestId('landing-phone')).toHaveAttribute('href', 'tel:0521234567')
    await user.click(screen.getByTestId('landing-join'))
    expect(screen.getByTestId('booking-dialog')).toBeInTheDocument()
  })

  it('links only the sections that exist — a club with no address gets no dead anchor', async () => {
    render(
      <PublicLanding
        slug="judo-tel-aviv"
        locale="he"
        client={clientReturning({ ...LANDING, address: null })}
      />,
    )
    const nav = await screen.findByRole('navigation', {
      name: t('he', 'people.landing.siteNav'),
    })
    expect(nav).toHaveTextContent(t('he', 'people.landing.aboutTitle'))
    expect(nav).not.toHaveTextContent(t('he', 'people.landing.whereTitle'))
  })

  it('renders the footer band with the one-free-trial line and the link row', async () => {
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    const footer = await screen.findByTestId('landing-footer')
    expect(footer).toHaveTextContent(t('he', 'people.landing.footerOffer'))
    expect(footer).toHaveTextContent(LANDING.studio_name)
    expect(footer).toHaveTextContent(t('he', 'people.landing.aboutTitle'))
  })
})

describe('the data-driven sections', () => {
  it('falls back to the chrome offer when the club wrote no headline', async () => {
    render(
      <PublicLanding
        slug="judo-tel-aviv"
        locale="he"
        client={clientReturning({ ...LANDING, headline: null })}
      />,
    )
    expect(await screen.findByTestId('landing-headline')).toHaveTextContent(
      t('he', 'people.landing.title'),
    )
  })

  it("renders the club's own trial steps under the chrome heading", async () => {
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    const steps = await screen.findByTestId('landing-steps')
    expect(steps).toHaveTextContent(t('he', 'people.landing.stepsTitle'))
    expect(steps.querySelectorAll('li')).toHaveLength(3)
  })

  it('hides the steps region for a club that wrote none — no shared sentence is right for every club', async () => {
    render(
      <PublicLanding
        slug="judo-tel-aviv"
        locale="he"
        client={clientReturning({ ...LANDING, trial_steps: [] })}
      />,
    )
    await screen.findByTestId('landing-hero')
    expect(screen.queryByTestId('landing-steps')).toBeNull()
  })

  it('renders the location card with navigate and WhatsApp', async () => {
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    const location = await screen.findByTestId('landing-location')
    expect(location).toHaveTextContent('הרצל 12, תל אביב')
    expect(screen.getByTestId('landing-navigate')).toHaveAttribute(
      'href',
      expect.stringContaining('maps.google.com'),
    )
    expect(screen.getByTestId('landing-whatsapp')).toHaveAttribute(
      'href',
      'https://wa.me/972521234567',
    )
  })

  it('offers no WhatsApp button when the club has no phone', async () => {
    render(
      <PublicLanding
        slug="judo-tel-aviv"
        locale="he"
        client={clientReturning({ ...LANDING, phone: null })}
      />,
    )
    await screen.findByTestId('landing-location')
    expect(screen.queryByTestId('landing-whatsapp')).toBeNull()
    expect(screen.queryByTestId('landing-phone')).toBeNull()
  })

  it('renders the photos the API already sends, and nothing when it sends none', async () => {
    render(
      <PublicLanding
        slug="judo-tel-aviv"
        locale="he"
        client={clientReturning({ ...LANDING, photo_urls: ['/p/1.jpg', '/p/2.jpg'] })}
      />,
    )
    const strip = await screen.findByTestId('landing-photos')
    expect(strip.querySelectorAll('img')).toHaveLength(2)
  })

  it('renders no photo strip when the API sends an empty list', async () => {
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    await screen.findByTestId('landing-hero')
    expect(screen.queryByTestId('landing-photos')).toBeNull()
  })

  it('embeds a real map for the address, not a grey box', async () => {
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    const map = await screen.findByTitle(t('he', 'people.landing.mapTitle'))
    expect(map.tagName).toBe('IFRAME')
    expect(map).toHaveAttribute('src', expect.stringContaining(encodeURIComponent('הרצל 12')))
  })
})

describe('booking — every call to action reaches the flow', () => {
  const TWO_GROUPS: Landing = {
    ...LANDING,
    groups: [
      LANDING.groups![0]!,
      {
        id: 'g2',
        name: 'נוער',
        description: null,
        age_min: 9,
        age_max: 12,
        training_weekdays: [1, 3],
        training_times: ['17:30'],
      },
    ],
  }

  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('the hero CTA opens the flow as a dialog, sign-in first, with the first group carried in', async () => {
    const user = userEvent.setup()
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(TWO_GROUPS)} />)
    await user.click(await screen.findByTestId('landing-hero-cta'))
    const dialog = screen.getByTestId('booking-dialog')
    expect(dialog).toHaveAttribute('role', 'dialog')
    expect(screen.getByTestId('booking-sign-in')).toBeInTheDocument()
    expect(screen.getByTestId('booking-sign-in-link')).toHaveAttribute(
      'href',
      expect.stringContaining(encodeURIComponent('book=g1')),
    )
  })

  it('each derived week-grid slot books THAT group', async () => {
    const user = userEvent.setup()
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(TWO_GROUPS)} />)
    await user.click(await screen.findByTestId('landing-slot-1-g2'))
    expect(screen.getByTestId('booking-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('booking-sign-in-link')).toHaveAttribute(
      'href',
      expect.stringContaining(encodeURIComponent('book=g2')),
    )
  })

  it('the change button closes the flow back to the page', async () => {
    const user = userEvent.setup()
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(TWO_GROUPS)} />)
    await user.click(await screen.findByTestId('landing-hero-cta'))
    await user.click(screen.getByTestId('booking-dialog-change'))
    expect(screen.queryByTestId('booking-dialog')).toBeNull()
    expect(screen.getByTestId('landing-hero')).toBeInTheDocument()
  })

  it('the sticky bar opens the flow and disappears while it is open', async () => {
    const user = userEvent.setup()
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(TWO_GROUPS)} />)
    const bar = await screen.findByTestId('landing-sticky-cta')
    expect(bar).toHaveTextContent(t('he', 'people.landing.freeTrial'))
    await user.click(bar)
    expect(screen.getByTestId('booking-dialog')).toBeInTheDocument()
    expect(screen.queryByTestId('landing-sticky-cta')).toBeNull()
  })

  it('?book= reopens the flow after the sign-in round trip, group intact', async () => {
    // The return_path carries the choice; landing on it signed-in must resume the booking,
    // not drop the parent back on the shop window to start again.
    window.history.replaceState(null, '', '/t/judo-tel-aviv?book=g2')
    render(
      <PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(TWO_GROUPS)} signedIn />,
    )
    expect(await screen.findByTestId('booking-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('booking-group-0')).toHaveValue('g2')
  })
})

describe('the designed Gladiator page (Stitch, hardcoded content)', () => {
  const GLADIATOR: Landing = { ...LANDING, slug: 'gladiator', studio_name: 'מועדון גלדיאטור' }

  it('renders the hero as designed: the season badge and the crimson accent', async () => {
    render(<PublicLanding slug="gladiator" locale="he" client={clientReturning(GLADIATOR)} />)
    const hero = await screen.findByTestId('landing-hero')
    expect(hero).toHaveTextContent('עונת 2026-2027 החלה')
    expect(screen.getByTestId('landing-headline')).toHaveTextContent('כבוד ומשמעת')
  })

  it('renders the coach with his credentials', async () => {
    render(<PublicLanding slug="gladiator" locale="he" client={clientReturning(GLADIATOR)} />)
    const coach = await screen.findByTestId('landing-coach')
    expect(coach).toHaveTextContent('סנסאי לביא תמיר')
    expect(coach).toHaveTextContent('20 שנות ניסיון')
    expect(coach).toHaveTextContent('בוגר וינגייט')
  })

  it('renders the designed timetable cell-for-cell, times low-first, with the legend', async () => {
    render(<PublicLanding slug="gladiator" locale="he" client={clientReturning(GLADIATOR)} />)
    const week = await screen.findByTestId('landing-schedule')
    // All seven days are designed columns.
    for (const day of [0, 1, 2, 3, 4, 5, 6]) {
      expect(week).toHaveTextContent(t('he', `people.weekdays.${day}`))
    }
    expect(week).toHaveTextContent("אימון ג'ודו קבוצה 1")
    expect(week).toHaveTextContent("נבחרת ג'ודו בנות")
    // RangeText's LTR island: 16:00–17:00, never 17:00–16:00.
    const range = week.querySelector('bdi[dir="ltr"]')
    expect(range).toHaveTextContent('16:00–17:00')
    // The legend names the five categories.
    expect(week).toHaveTextContent("קרוספיט לג'ודו")
    expect(week).toHaveTextContent('אימון אישי')
  })

  it('renders the three plans with shekel prices, and their buttons open the flow', async () => {
    const user = userEvent.setup()
    render(<PublicLanding slug="gladiator" locale="he" client={clientReturning(GLADIATOR)} />)
    const plans = await screen.findByTestId('landing-plans')
    expect(plans).toHaveTextContent('מסלול יסוד')
    expect(plans).toHaveTextContent('מסלול לוחם')
    expect(plans).toHaveTextContent('מסלול גלדיאטור')
    expect(plans).toHaveTextContent('מסלול מתקדם')
    // Agorot through MoneyDisplay — 30000 renders as ₪300, never a float.
    expect(plans).toHaveTextContent('300')
    expect(plans).toHaveTextContent('550')
    await user.click(screen.getByRole('button', { name: 'הצטרף עכשיו' }))
    expect(screen.getByTestId('booking-dialog')).toBeInTheDocument()
  })

  it('renders the voices from the dojo', async () => {
    render(<PublicLanding slug="gladiator" locale="he" client={clientReturning(GLADIATOR)} />)
    const voices = await screen.findByTestId('landing-voices')
    expect(voices).toHaveTextContent('אמא של יונתן')
    expect(voices).toHaveTextContent('נבחרת גלדיאטור')
  })

  it('falls back to the bundled club mark when nothing is uploaded', async () => {
    // Staging carries no uploaded logo, and a landing page with no mark on it is not
    // something to hand a manager.
    render(
      <PublicLanding
        slug="gladiator"
        locale="he"
        client={clientReturning({ ...GLADIATOR, logo_url: null })}
      />,
    )
    expect(await screen.findByTestId('landing-logo')).toHaveAttribute(
      'src',
      '/clubs/gladiator-logo.png',
    )
  })

  it('lets an uploaded logo beat the bundled one', async () => {
    render(
      <PublicLanding
        slug="gladiator"
        locale="he"
        client={clientReturning({ ...GLADIATOR, logo_url: '/api/v1/public/studios/gladiator/logo' })}
      />,
    )
    expect(await screen.findByTestId('landing-logo')).toHaveAttribute(
      'src',
      '/api/v1/public/studios/gladiator/logo',
    )
  })

  it('falls back to the bundled mark when the uploaded logo 404s', async () => {
    // Staging's object store is the api container's own filesystem, so a redeploy drops
    // the bytes while the key survives. A torn-page icon on the shop window is worse than
    // the bundled mark.
    render(
      <PublicLanding
        slug="gladiator"
        locale="he"
        client={clientReturning({ ...GLADIATOR, logo_url: '/api/v1/public/studios/gladiator/logo' })}
      />,
    )
    const logo = await screen.findByTestId('landing-logo')
    fireEvent.error(logo)
    expect(await screen.findByTestId('landing-logo')).toHaveAttribute(
      'src',
      '/clubs/gladiator-logo.png',
    )
  })

  it('signs the footer with the club’s line', async () => {
    render(<PublicLanding slug="gladiator" locale="he" client={clientReturning(GLADIATOR)} />)
    const footer = await screen.findByTestId('landing-footer')
    expect(footer).toHaveTextContent('© 2026')
  })
})
