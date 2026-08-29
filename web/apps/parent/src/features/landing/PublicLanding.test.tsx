// Parent artboards 13a (mobile) and 13c (desktop). One component, two widths.
//
// The tests that matter are the ones about what a STRANGER sees: this is the only screen in
// the product somebody reaches with no account, and §5.4a calls it "the club's shop window,
// not a form".
import { render, screen, waitFor } from '@testing-library/react'
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

  it('keeps the flow closed on load: the picker is the centre of gravity (redesign 2026-08-29)', async () => {
    // The 2026-08-29 redesign supersedes the open-on-load decision: the page leads with a
    // compact single-select group picker and ONE call to action; the flow (whose first step
    // is still §5.4a's sign-in wall) opens when the CTA is pressed.
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    expect(await screen.findByTestId('landing-group-picker')).toBeInTheDocument()
    expect(screen.queryByTestId('booking-sign-in')).toBeNull()
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


describe('L4 — the seven regions', () => {
  it('renders the hero band: brand row with the phone, the headline, the ladder and its caption', async () => {
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    const hero = await screen.findByTestId('landing-hero')
    expect(screen.getByTestId('landing-phone')).toHaveAttribute('href', 'tel:0521234567')
    expect(screen.getByTestId('landing-headline')).toHaveTextContent('ג׳ודו לילדים מגיל 5')
    // The ladder comes from DATA — belt_rank colours — never from the canvas palette.
    expect(hero.querySelectorAll('.studio-belt-ladder [role="img"]')).toHaveLength(2)
    expect(screen.getByText(t('he', 'people.landing.beltCaption'))).toBeInTheDocument()
  })

  it('falls back to the chrome offer when the club wrote no headline', async () => {
    render(
      <PublicLanding
        slug="x"
        locale="he"
        client={clientReturning({ ...LANDING, headline: null })}
      />,
    )
    expect(await screen.findByTestId('landing-headline')).toHaveTextContent(
      t('he', 'people.landing.title'),
    )
  })

  it("renders the club's own trial steps under the chrome heading", async () => {
    render(<PublicLanding slug="x" locale="he" client={clientReturning(LANDING)} />)
    const steps = await screen.findByTestId('landing-steps')
    expect(steps).toHaveTextContent(t('he', 'people.landing.stepsTitle'))
    expect(steps.querySelectorAll('li')).toHaveLength(3)
  })

  it('hides the steps region for a club that wrote none — no shared sentence is right for every club', async () => {
    render(
      <PublicLanding
        slug="x"
        locale="he"
        client={clientReturning({ ...LANDING, trial_steps: [] })}
      />,
    )
    await screen.findByTestId('landing-hero')
    expect(screen.queryByTestId('landing-steps')).toBeNull()
  })

  it('renders region 4 as ONE card of rows, each with days AND time', async () => {
    render(<PublicLanding slug="x" locale="he" client={clientReturning(LANDING)} />)
    const card = await screen.findByTestId('landing-group-card')
    expect(card).toHaveTextContent('16:00')
    expect(screen.getByTestId('landing-group-days')).toHaveTextContent(
      `${t('he', 'people.weekdays.0')} · ${t('he', 'people.weekdays.3')} · 16:00`,
    )
  })

  it('renders the location card with navigate and WhatsApp', async () => {
    render(<PublicLanding slug="x" locale="he" client={clientReturning(LANDING)} />)
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
      <PublicLanding slug="x" locale="he" client={clientReturning({ ...LANDING, phone: null })} />,
    )
    await screen.findByTestId('landing-location')
    expect(screen.queryByTestId('landing-whatsapp')).toBeNull()
    expect(screen.queryByTestId('landing-phone')).toBeNull()
  })

  it('renders the footer band with the one-free-trial line', async () => {
    render(<PublicLanding slug="x" locale="he" client={clientReturning(LANDING)} />)
    const footer = await screen.findByTestId('landing-footer')
    expect(footer).toHaveTextContent(t('he', 'people.landing.footerOffer'))
    expect(footer).toHaveTextContent(LANDING.studio_name)
  })

  it('renders the photos the API already sends, and nothing when it sends none', async () => {
    render(
      <PublicLanding
        slug="x"
        locale="he"
        client={clientReturning({ ...LANDING, photo_urls: ['/p/1.jpg', '/p/2.jpg'] })}
      />,
    )
    const strip = await screen.findByTestId('landing-photos')
    expect(strip.querySelectorAll('img')).toHaveLength(2)
  })

  it('renders no photo strip when the API sends an empty list', async () => {
    render(<PublicLanding slug="x" locale="he" client={clientReturning(LANDING)} />)
    await screen.findByTestId('landing-hero')
    expect(screen.queryByTestId('landing-photos')).toBeNull()
  })
})

describe('redesign 2026-08-29 — the group picker and the one CTA', () => {
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

  it('renders one radio per group with the first pre-selected', async () => {
    render(<PublicLanding slug="x" locale="he" client={clientReturning(TWO_GROUPS)} />)
    const picker = await screen.findByTestId('landing-group-picker')
    const radios = picker.querySelectorAll('input[type="radio"]')
    expect(radios).toHaveLength(2)
    expect(screen.getByRole('radio', { name: /מתחילים/ })).toBeChecked()
  })

  it('the CTA names the chosen group, and follows the selection', async () => {
    const user = userEvent.setup()
    render(<PublicLanding slug="x" locale="he" client={clientReturning(TWO_GROUPS)} />)
    const cta = await screen.findByTestId('landing-cta')
    expect(cta).toHaveTextContent('מתחילים')
    await user.click(screen.getByRole('radio', { name: /נוער/ }))
    expect(cta).toHaveTextContent('נוער')
  })

  it('the CTA opens the flow as a dialog, sign-in first, with the group carried in', async () => {
    const user = userEvent.setup()
    render(<PublicLanding slug="x" locale="he" client={clientReturning(TWO_GROUPS)} />)
    await user.click(await screen.findByTestId('landing-cta'))
    const dialog = screen.getByTestId('booking-dialog')
    expect(dialog).toHaveAttribute('role', 'dialog')
    expect(screen.getByTestId('booking-sign-in')).toBeInTheDocument()
    expect(screen.getByTestId('booking-sign-in-link')).toHaveAttribute(
      'href',
      expect.stringContaining(encodeURIComponent('book=g1')),
    )
  })

  it('the change button drops back to the picker', async () => {
    const user = userEvent.setup()
    render(<PublicLanding slug="x" locale="he" client={clientReturning(TWO_GROUPS)} />)
    await user.click(await screen.findByTestId('landing-cta'))
    await user.click(screen.getByTestId('booking-dialog-change'))
    expect(screen.queryByTestId('booking-dialog')).toBeNull()
    expect(screen.getByTestId('landing-group-picker')).toBeInTheDocument()
  })

  it('the sticky bar mirrors the CTA and disappears while the flow is open', async () => {
    const user = userEvent.setup()
    render(<PublicLanding slug="x" locale="he" client={clientReturning(TWO_GROUPS)} />)
    const bar = await screen.findByTestId('landing-sticky-cta')
    expect(bar).toHaveTextContent('מתחילים')
    await user.click(bar)
    expect(screen.getByTestId('booking-dialog')).toBeInTheDocument()
    expect(screen.queryByTestId('landing-sticky-cta')).toBeNull()
  })

  it('?book= reopens the flow after the sign-in round trip, group intact', async () => {
    // The return_path carries the choice; landing on it signed-in must resume the booking,
    // not drop the parent back on the shop window to start again.
    window.history.replaceState(null, '', '/t/x?book=g2')
    render(<PublicLanding slug="x" locale="he" client={clientReturning(TWO_GROUPS)} signedIn />)
    expect(await screen.findByTestId('booking-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('booking-group-0')).toHaveValue('g2')
  })

  it('each desktop group card books THAT group', async () => {
    const user = userEvent.setup()
    render(<PublicLanding slug="x" locale="he" client={clientReturning(TWO_GROUPS)} />)
    await user.click(await screen.findByTestId('landing-group-book-g2'))
    expect(screen.getByTestId('booking-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('booking-sign-in-link')).toHaveAttribute(
      'href',
      expect.stringContaining(encodeURIComponent('book=g2')),
    )
  })
})

describe('the location map (2026-08-30)', () => {
  it('embeds a real map for the address, not a grey box', async () => {
    // Region 6 shipped with `mapPlaceholderStyle` — a grey rectangle where 13a draws a
    // map. The keyless Google embed finishes it: same address the ניווט button uses.
    render(<PublicLanding slug="x" locale="he" client={clientReturning(LANDING)} />)
    const map = await screen.findByTitle(t('he', 'people.landing.mapTitle'))
    expect(map.tagName).toBe('IFRAME')
    expect(map).toHaveAttribute('src', expect.stringContaining(encodeURIComponent('הרצל 12')))
  })
})
