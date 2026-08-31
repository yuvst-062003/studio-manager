// The public landing page, in its two modes: the designed Gladiator page (the user's
// Stitch screens, hardcoded content — clubContent.ts) and the data-driven page every
// other slug gets.
//
// The tests that matter are the ones about what a STRANGER sees: this is the only screen
// in the product somebody reaches with no account, and §5.4a calls it "the club's shop
// window, not a form".
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

  it('the hero CTA opens the flow as a dialog, asking who is booking, with the first group carried in', async () => {
    const user = userEvent.setup()
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(TWO_GROUPS)} />)
    await user.click(await screen.findByTestId('landing-hero-cta'))
    const dialog = screen.getByTestId('booking-dialog')
    expect(dialog).toHaveAttribute('role', 'dialog')
    // Step 1 is a form, not a sign-in wall (2026-08-31). The sign-in link is still there
    // as a shortcut for a family that already has an account, which is what the href
    // assertion below is about.
    expect(screen.getByTestId('booking-you')).toBeInTheDocument()
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

  // Reported from production 2026-08-31: "user presses the free trial and can't pick the
  // team he wants out of the teams." The dialog opens on `groups[0]` — a decision made FOR
  // the reader — and "שינוי" used to mean "close, and choose again on the page". That was
  // true while the page carried an inline picker; the Stitch redesign replaced it with a
  // timetable that is decorative on the designed page (`ContentSchedule` renders <li>, not
  // buttons), so closing returned the reader to a page with nothing to pick from and the
  // first group still chosen. The choice has to be reachable from INSIDE the dialog.
  it('lets the reader change the group from inside the dialog', async () => {
    const user = userEvent.setup()
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(TWO_GROUPS)} />)
    await user.click(await screen.findByTestId('landing-hero-cta'))
    const dialog = screen.getByTestId('booking-dialog')
    const picker = within(dialog).getByTestId('booking-dialog-group')

    // Every group the club offers, not just the one the page guessed.
    expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'מתחילים',
      'נוער',
    ])

    await user.selectOptions(picker, 'g2')
    // The dialog now describes the group actually chosen — name AND its schedule line,
    // because the meta is what tells a parent whether the time suits them.
    expect(dialog).toHaveTextContent('נוער')
    expect(dialog).toHaveTextContent('17:30')
    // And it stays open: changing your mind is not a reason to lose the flow.
    expect(screen.getByTestId('booking-dialog')).toBeInTheDocument()
  })

  it('the close button still closes the flow back to the page', async () => {
    const user = userEvent.setup()
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(TWO_GROUPS)} />)
    await user.click(await screen.findByTestId('landing-hero-cta'))
    await user.click(screen.getByTestId('booking-dialog-close'))
    expect(screen.queryByTestId('booking-dialog')).toBeNull()
    expect(screen.getByTestId('landing-hero')).toBeInTheDocument()
  })

  // The designed page is where the dead end actually bit: it has no picker to fall back
  // to, so a dialog that could only close was the end of the road.
  it('offers the same in-dialog choice on the designed page', async () => {
    const user = userEvent.setup()
    render(
      <PublicLanding
        slug="gladiator"
        locale="he"
        client={clientReturning({ ...TWO_GROUPS, slug: 'gladiator' })}
      />,
    )
    await user.click(await screen.findByTestId('landing-hero-cta'))
    const picker = within(screen.getByTestId('booking-dialog')).getByTestId('booking-dialog-group')
    expect(within(picker).getAllByRole('option')).toHaveLength(2)
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

// The bug this file did not catch (2026-08-31): the designed content was Hebrew-only, so
// choosing English translated the chrome — the nav, the buttons — and left every word of
// the club's own content in Hebrew, laid out left-to-right. §6.1 puts the language choice
// before login exactly so a parent who does not read Hebrew can read the offer.
describe('the designed page speaks the chosen language', () => {
  const GLADIATOR: Landing = { ...LANDING, slug: 'gladiator', studio_name: 'מועדון גלדיאטור' }

  // A Hebrew letter anywhere in the club's own sections means untranslated content.
  const HEBREW = /[֐-׿]/

  it.each([
    {
      locale: 'en' as const,
      coach: 'Leadership',
      plans: 'Training plans',
      slot: 'Judo — group 1',
      name: 'Gladiator Judo Club',
    },
    {
      locale: 'ru' as const,
      coach: 'Лидерство',
      plans: 'Тарифы тренировок',
      slot: 'Дзюдо — группа 1',
      name: 'Клуб дзюдо «Гладиатор»',
    },
  ])('renders the club content in $locale, with no Hebrew left behind', async (row) => {
    render(<PublicLanding slug="gladiator" locale={row.locale} client={clientReturning(GLADIATOR)} />)
    const coach = await screen.findByTestId('landing-coach')
    expect(coach).toHaveTextContent(row.coach)
    expect(screen.getByTestId('landing-plans')).toHaveTextContent(row.plans)
    // The timetable is the easiest place for an untranslated string to hide: the same
    // lesson repeats across days, so one missed key shows up on half the grid.
    expect(screen.getByTestId('landing-schedule')).toHaveTextContent(row.slot)
    // `studio.name` has no locale, so the club names itself per language instead. The
    // FOOTER is the check: it is the one place the name sits with no Hebrew around it —
    // the header also holds the language pills, and "עברית" is Hebrew there on purpose.
    expect(screen.getByTestId('landing-footer')).toHaveTextContent(row.name)
    for (const section of [
      'landing-coach',
      'landing-schedule',
      'landing-plans',
      'landing-voices',
      'landing-footer',
    ]) {
      expect(screen.getByTestId(section).textContent ?? '').not.toMatch(HEBREW)
    }
  })

  it('leaves the club’s stored name alone for a club with no designed content', async () => {
    // The override is content, not a rule about names: every other club has exactly one
    // name in the database and must keep rendering it.
    render(<PublicLanding slug="judo-tel-aviv" locale="en" client={clientReturning(LANDING)} />)
    expect(await screen.findByTestId('landing-footer')).toHaveTextContent(LANDING.studio_name)
  })

  it('keeps the prices and the hours identical in every language', async () => {
    // The reason the timetable and the prices are declared ONCE and only the words are
    // per-locale: three parallel copies would let ₪400 become ₪450 in Russian, and no
    // test would be looking.
    const readFacts = async (locale: Locale) => {
      const view = render(
        <PublicLanding slug="gladiator" locale={locale} client={clientReturning(GLADIATOR)} />,
      )
      const week = await screen.findByTestId('landing-schedule')
      const times = [...week.querySelectorAll('.gl-slot-time')].map((n) => n.textContent)
      // The amount only — `.gl-price` also holds "/ month", which SHOULD differ by locale.
      const prices = [...screen.getByTestId('landing-plans').querySelectorAll('.gl-price')].map(
        (node) => {
          const per = node.querySelector('.gl-price-per')
          return (node.textContent ?? '').replace(per?.textContent ?? '', '').trim()
        },
      )
      view.unmount()
      return { times, prices }
    }
    const he = await readFacts('he')
    expect(he.times.length).toBeGreaterThan(0)
    expect(he.prices.length).toBeGreaterThan(0)
    for (const locale of ['en', 'ru'] as const) {
      const other = await readFacts(locale)
      expect(other.times).toEqual(he.times)
      expect(other.prices).toEqual(he.prices)
    }
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

  // §6.1 puts the language choice BEFORE login, so the landing page has to carry it: a
  // Russian-speaking parent cannot read a Hebrew offer. It was reaching the page as a
  // bare, unstyled sibling ABOVE the header — a stray "שפה" heading and three naked
  // buttons floating over the hero (2026-08-31). It belongs in the header's end slot,
  // beside the nav, which is also the only place the design has room for it.
  it('carries the language picker inside the header, not loose above the page', async () => {
    render(
      <PublicLanding
        slug="gladiator"
        locale="he"
        client={clientReturning(GLADIATOR)}
        // A stand-in node, not the real control: this asserts WHERE the slot puts what
        // it is given. App.test.tsx mounts the actual picker through the real route.
        languagePicker={<span data-testid="lang-stub" />}
      />,
    )
    const header = await screen.findByTestId('landing-header')
    const slot = within(header).getByTestId('landing-lang')
    expect(within(slot).getByTestId('lang-stub')).toBeInTheDocument()
  })
})
