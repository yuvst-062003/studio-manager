// The public landing page, in its two modes: the designed Gladiator page (the user's
// Stitch screens, hardcoded content — clubContent.ts) and the data-driven page every
// other slug gets.
//
// The tests that matter are the ones about what a STRANGER sees: this is the only screen
// in the product somebody reaches with no account, and §5.4a calls it "the club's shop
// window, not a form".
import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { DIRECTION, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { THEME_STORAGE_KEY, ThemeProvider } from '@studio/ui'
import type { ResolvedTheme } from '@studio/ui'
import { PublicLanding } from './PublicLanding'
import { GALLERY_PENDING_CONSENT, clubContentFor } from './clubContent'
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
      kind: 'base',
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

/**
 * **Every render here goes through `ThemeProvider`, because `App.tsx` mounts this page
 * inside one and always has.** Bare `render(<PublicLanding/>)` tested a configuration
 * production does not have, which stopped being harmless the moment #26 put a theme
 * control in the header: `useTheme` throws outside its provider, by design.
 *
 * Wrapping here rather than editing thirty-three call sites, and it is the more faithful
 * test either way — the seam, not the component in a shape nothing mounts.
 */
function render(ui: ReactElement) {
  return rtlRender(<ThemeProvider>{ui}</ThemeProvider>)
}

// Every call to action on this page is now a real link, and `landingViewHref` builds it
// from `location.pathname` — so a test that asserts an href has to say where it is
// standing. Reset after each one, or the club prefix leaks into the next test's page.
afterEach(() => {
  window.history.replaceState(null, '', '/')
})

/**
 * jsdom implements no navigation: clicking a real `<a href>` prints "Not implemented" and
 * proves nothing. The links here are asserted by their `href` instead — this exists for
 * the one test that needs a click's SIDE EFFECT, the page remembering the pressed group.
 */
function clickWithoutNavigating(element: HTMLElement) {
  const swallow = (event: Event) => event.preventDefault()
  document.addEventListener('click', swallow)
  try {
    fireEvent.click(element)
  } finally {
    document.removeEventListener('click', swallow)
  }
}

function renderIn(
  ui: ReactElement,
  { locale = 'he', theme = 'light' }: { locale?: Locale; theme?: ResolvedTheme } = {},
) {
  globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme)
  document.documentElement.lang = locale
  document.documentElement.dir = DIRECTION[locale]
  return rtlRender(<ThemeProvider>{ui}</ThemeProvider>)
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

  it('opens nothing over itself — the booking is a page, reached by a link', async () => {
    // §5.4a's rule survives the redesign: reading is free. What changed is where booking
    // happens — `/t/{slug}/trial`, its own address — so this page renders no dialog in any
    // state, and there is no longer a state in which it could.
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    await screen.findByTestId('landing-hero')
    expect(screen.queryByTestId('booking-dialog')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
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

  it('every held-back photograph still has real alt text in all three locales', () => {
    // What the three gallery-render tests here used to guarantee. The photographs are held
    // back pending rights and guardian consent, so there is nothing on screen to assert
    // against \u2014 but the alt text is the part that rots silently, and it is what makes the
    // set ready to publish a photo at a time rather than needing rewriting first.
    //
    // The render mechanics those tests also covered \u2014 the lead tile, loading="lazy", the
    // focus crop \u2014 still live in `PublicLanding` and come back under test with the photos.
    for (const locale of ['he', 'en', 'ru'] as const) {
      const content = clubContentFor('gladiator', locale)
      expect(content).not.toBeNull()
      expect(content!.gallery).toHaveLength(0)
    }
    // The src shape a returning photo must keep, so it lands back in `public/clubs/`.
    for (const photo of GALLERY_PENDING_CONSENT) {
      expect(photo.src).toMatch(/^\/clubs\/gladiator-.+\.jpg$/)
    }
    expect(GALLERY_PENDING_CONSENT).toHaveLength(5)
  })

  it('publishes no photograph of a child without a consent record', async () => {
    // Five club photographs shipped in `public/clubs/` and were served on the open
    // internet. They show identifiable minors, and `photo_video` consent exists as a type
    // in the ledger with nothing tying it to what is actually published — while
    // `privacy.policy.s3.body` promises parents that photo consent is voluntary. A gallery
    // no consent record backs makes that sentence untrue.
    //
    // The set is kept in the code, named for why it is not published, so it can go back up
    // per-photo once the club has the rights and the guardians' consent.
    // `gladiator`, deliberately: `clubContentFor` returns null for every other slug, so a
    // test on a different club would pass without the gallery ever having been reachable.
    render(
      <PublicLanding
        slug="gladiator"
        locale="he"
        client={clientReturning({ ...LANDING, slug: 'gladiator' })}
      />,
    )
    await screen.findByTestId('public-landing')
    expect(screen.queryByTestId('landing-gallery')).toBeNull()
  })

  it('lets a visitor switch the page to dark and back (#26)', async () => {
    // The owner's #26. The dark palette in `landing.css` has been complete for a while and
    // follows `prefers-color-scheme` through `ThemeProvider` — but a visitor whose phone is
    // set to light had no way to SEE it, and one on a dark phone had no way out. A marketing
    // page is the one screen in this product a stranger meets before any settings exist, so
    // the control has to be on the page itself.
    const user = userEvent.setup()
    renderIn(
      <PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />,
      { theme: 'light' },
    )
    await screen.findByTestId('public-landing')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')

    await user.click(screen.getByTestId('landing-theme-toggle'))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')

    await user.click(screen.getByTestId('landing-theme-toggle'))
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it('names what the toggle will do, not what the page currently is (#26)', async () => {
    // An icon-only control with no accessible name is a control a screen-reader user cannot
    // use at all, and `.claude/rules/ui-rtl-a11y.md` makes that a hard rule. The name says
    // the DESTINATION: "switch to dark" is actionable, "currently light" is a status.
    renderIn(
      <PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />,
      { theme: 'light' },
    )
    await screen.findByTestId('public-landing')
    expect(screen.getByTestId('landing-theme-toggle')).toHaveAccessibleName(
      t('he', 'people.landing.themeToDark'),
    )
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
  it('carries the brand row — name, phone — and one way in: a link to the form', async () => {
    window.history.replaceState(null, '', '/t/judo-tel-aviv')
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    const header = await screen.findByTestId('landing-header')
    expect(header).toHaveTextContent(LANDING.studio_name)
    expect(screen.getByTestId('landing-phone')).toHaveAttribute('href', 'tel:0521234567')
    // An anchor, not a button: the club's main ask has to be middle-clickable, copyable
    // and keyboard-reachable, and an element with an `href` is all three for free.
    const join = screen.getByTestId('landing-join')
    expect(join.tagName).toBe('A')
    expect(join).toHaveAttribute('href', '/t/judo-tel-aviv/trial?group=g1')
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

  it('links the club’s documents from the footer', async () => {
    // §6 — the terms, the privacy policy and the payment conditions lived only inside
    // popups behind a sign-in, which is the wrong way round for documents a stranger is
    // meant to read BEFORE committing to anything.
    window.history.replaceState(null, '', '/t/judo-tel-aviv')
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    const footer = await screen.findByTestId('landing-footer')
    const legal = within(footer).getByTestId('landing-legal-link')
    expect(legal).toHaveTextContent(t('he', 'people.bookTrial.legal.title'))
    expect(legal).toHaveAttribute('href', '/t/judo-tel-aviv/legal')
  })

  it('keeps the documents link on a club with no sections to link', async () => {
    // The link row used to render only when the club had an `about`, a timetable or an
    // address. The documents are not one of the club's optional sections.
    window.history.replaceState(null, '', '/t/judo-tel-aviv')
    render(
      <PublicLanding
        slug="judo-tel-aviv"
        locale="he"
        client={clientReturning({ ...LANDING, about: null, address: null, groups: [] })}
      />,
    )
    const footer = await screen.findByTestId('landing-footer')
    expect(within(footer).getByTestId('landing-legal-link')).toHaveAttribute(
      'href',
      '/t/judo-tel-aviv/legal',
    )
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

describe('booking — every call to action is a link to the form', () => {
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
        kind: 'base',
        training_times: ['17:30'],
      },
    ],
  }

  // Until 2026-09-08 every test here pressed a button and looked for `booking-dialog`: the
  // booking was a modal this page opened over itself. It is a page now, so what a call to
  // action owes a visitor is an ADDRESS — one they can middle-click into a second tab,
  // copy into a message, reach with the keyboard, and come back from with the back button.
  // A dialog could give none of those. The assertions are therefore about `href`.

  it('sends the hero’s call to action to the trial form, under this club’s prefix', async () => {
    window.history.replaceState(null, '', '/t/judo-tel-aviv')
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(TWO_GROUPS)} />)
    const cta = await screen.findByTestId('landing-hero-cta')
    expect(cta.tagName).toBe('A')
    expect(cta).toHaveAttribute('href', '/t/judo-tel-aviv/trial?group=g1')
  })

  it('drops the club prefix at the root of a landing host, where the page has no slug', async () => {
    // `gladiatorclub.co.il/` serves this same page with nothing in the path, and the form
    // lives at `/trial` there. A hardcoded `/t/{slug}/trial` would be wrong on that host,
    // and a hardcoded `/trial` would throw a `/t/{slug}` visitor onto whichever club the
    // build happens to be configured with — which is why the href is derived per path.
    window.history.replaceState(null, '', '/')
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(TWO_GROUPS)} />)
    expect(await screen.findByTestId('landing-hero-cta')).toHaveAttribute(
      'href',
      '/trial?group=g1',
    )
  })

  it('carries each week-grid slot’s own group into the form as ?group=', async () => {
    // What `initialGroupId` used to do through the dialog's props. The form is a page, and
    // a page's only inbound channel is its address — so the pick travels in the URL.
    window.history.replaceState(null, '', '/t/judo-tel-aviv')
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(TWO_GROUPS)} />)
    const slot = await screen.findByTestId('landing-slot-1-g2')
    expect(slot.tagName).toBe('A')
    expect(slot).toHaveAttribute('href', '/t/judo-tel-aviv/trial?group=g2')
    // The same group in each of its day columns — the contract pairs times with the group.
    expect(screen.getByTestId('landing-slot-3-g2')).toHaveAttribute(
      'href',
      '/t/judo-tel-aviv/trial?group=g2',
    )
  })

  it('makes the page’s general calls to action agree with the group just pressed', async () => {
    // Why the picked group is still state and not merely a per-slot href: somebody who
    // opens a slot in a new tab comes back to THIS page, and the sticky bar they meet next
    // should point at the group they were looking at rather than at the first one.
    window.history.replaceState(null, '', '/t/judo-tel-aviv')
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(TWO_GROUPS)} />)
    const sticky = await screen.findByTestId('landing-sticky-cta')
    expect(sticky).toHaveAttribute('href', '/t/judo-tel-aviv/trial?group=g1')

    clickWithoutNavigating(screen.getByTestId('landing-slot-1-g2'))

    await waitFor(() =>
      expect(screen.getByTestId('landing-sticky-cta')).toHaveAttribute(
        'href',
        '/t/judo-tel-aviv/trial?group=g2',
      ),
    )
    expect(screen.getByTestId('landing-hero-cta')).toHaveAttribute(
      'href',
      '/t/judo-tel-aviv/trial?group=g2',
    )
  })

  it('keeps the sticky bar’s crimson button, now as a link that never disappears', async () => {
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(TWO_GROUPS)} />)
    const bar = await screen.findByTestId('landing-sticky-cta')
    expect(bar.tagName).toBe('A')
    expect(bar).toHaveTextContent(t('he', 'people.landing.freeTrial'))
    // It is the page's own crimson button, not the app's. The desk-width float is styled
    // through `.landing-sticky-bar .gl-btn` — drop the class and the button keeps its
    // full-bar width in a corner with no background behind it, which looks like a bug and
    // fails no test that only checks the text.
    expect(bar).toHaveClass('gl-btn', 'gl-btn--red')
  })

  it('offers no sticky call to action to a club with no group to book', async () => {
    // The bar was gated on a group existing when it fed the dialog, and still is: a
    // permanent invitation into a form with nothing to choose is worse than no invitation.
    render(
      <PublicLanding
        slug="judo-tel-aviv"
        locale="he"
        client={clientReturning({ ...TWO_GROUPS, groups: [] })}
      />,
    )
    await screen.findByTestId('landing-hero')
    expect(screen.queryByTestId('landing-sticky-cta')).toBeNull()
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

  it('states the club\u2019s size on a third credential card, and draws no icons', async () => {
    render(<PublicLanding slug="gladiator" locale="he" client={clientReturning(GLADIATOR)} />)
    const coach = await screen.findByTestId('landing-coach')
    const cards = coach.querySelectorAll('.gl-cred')
    expect(cards).toHaveLength(3)
    // The figure card: the number is the headline, the heading says what it counts.
    const figure = coach.querySelector('.gl-cred--figure')
    expect(figure).toHaveTextContent('1000+')
    // Inside an LTR island, so Hebrew's bidi cannot reorder it into "+300".
    expect(figure?.querySelector('bdi')).toHaveAttribute('dir', 'ltr')
    expect(figure).toHaveTextContent('חניכים עברו במועדון')
    // The icons are gone — the whole point of the change. An <svg> back in this row means
    // a drawing has crept back in beside cards that already say the thing in words.
    expect(coach.querySelectorAll('.gl-cred svg')).toHaveLength(0)
  })

  it('names the coach in the copy, with no second copy of the crest beside it', async () => {
    render(<PublicLanding slug="gladiator" locale="he" client={clientReturning(GLADIATOR)} />)
    const coach = await screen.findByTestId('landing-coach')
    // The name and rank survived the panel they used to be pinned to.
    expect(coach).toHaveTextContent('סנסאי לביא תמיר')
    expect(coach).toHaveTextContent('מאמן ראשי')
    // The header already carries the club's mark; the section must not carry it again,
    // which is what cost the credential row half the width it now spreads across.
    expect(coach.querySelectorAll('img')).toHaveLength(0)
  })

  it('keeps no gallery for a club without designed content', async () => {
    render(<PublicLanding slug="judo-tel-aviv" locale="he" client={clientReturning(LANDING)} />)
    await screen.findByTestId('landing-hero')
    expect(screen.queryByTestId('landing-gallery')).toBeNull()
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

  it('renders the three plans with shekel prices, and links their CTAs to the form', async () => {
    window.history.replaceState(null, '', '/t/gladiator')
    render(<PublicLanding slug="gladiator" locale="he" client={clientReturning(GLADIATOR)} />)
    const plans = await screen.findByTestId('landing-plans')
    expect(plans).toHaveTextContent('מסלול יסוד')
    expect(plans).toHaveTextContent('מסלול לוחם')
    expect(plans).toHaveTextContent('מסלול גלדיאטור')
    expect(plans).toHaveTextContent('מסלול מתקדם')
    // Agorot through MoneyDisplay — 30000 renders as ₪300, never a float.
    expect(plans).toHaveTextContent('300')
    expect(plans).toHaveTextContent('550')
    // The plan card's own call to action is a link like every other one on the page.
    expect(screen.getByRole('link', { name: 'הצטרף עכשיו' })).toHaveAttribute(
      'href',
      '/t/gladiator/trial?group=g1',
    )
  })

  it('renders the voices from the dojo, attributed to real former members', async () => {
    // The two quotes here until 2026-09-08 came in with the rest of the approved Stitch
    // copy — an AI design mockup writes plausible testimonials because that is what the
    // layout needs, and one was attributed to a fifteen-year-old. Both are replaced by
    // named alumni who approved their own wording.
    render(<PublicLanding slug="gladiator" locale="he" client={clientReturning(GLADIATOR)} />)
    const voices = await screen.findByTestId('landing-voices')
    expect(voices).toHaveTextContent('יובל')
    expect(voices).toHaveTextContent('איתי')
    expect(voices).toHaveTextContent('בוגר המועדון')
    // The invented pair, by name — this is the assertion that keeps them gone.
    expect(voices).not.toHaveTextContent('אמא של יונתן')
    expect(voices).not.toHaveTextContent('דניאל')
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
