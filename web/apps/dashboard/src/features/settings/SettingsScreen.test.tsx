// Dashboard artboard 3f — הגדרות. לכל מתג תווית מצב.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { SettingsScreen } from './SettingsScreen'

const STUDIO = {
  name: 'מכבי ג׳ודו רעננה',
  sport: 'judo',
  address: 'אחוזה 120',
  phone: '09-771-2233',
  default_locale: 'he',
  parent_locales: ['he'],
  logo_url: null,
}

function stub(onPatch?: (body: unknown) => void) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body))
        onPatch?.(body)
        return new Response(JSON.stringify({ ...STUDIO, ...body }), { status: 200 })
      }
      return new Response(JSON.stringify(STUDIO), { status: 200 })
    }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('SettingsScreen', () => {
  it('renders every section 3f lists, including the ones M1 does not own', async () => {
    // A manager who cannot find מחירים concludes it is missing, not that it is next.
    stub()
    render(<SettingsScreen locale="he" />)
    for (const key of ['studio', 'prices', 'payments', 'documents', 'attendance', 'notifications', 'users', 'belts']) {
      expect(await screen.findByTestId(`settings-section-${key}`)).toBeInTheDocument()
    }
  })

  it('opens the payments section, which owns the standing-order links', async () => {
    // Payment-routes §5 -- the canonical editor for `price_plan.standing_order_link_url`.
    // It goes HERE rather than on 5a because the question this screen answers is 'how may
    // a family pay this club', and the link is the answer for one of the routes.
    stub()
    render(<SettingsScreen locale="he" />)
    const tab = await screen.findByTestId('settings-section-payments')
    expect(tab).toBeEnabled()
    await userEvent.click(tab)
    expect(await screen.findByTestId('settings-panel-payments')).toBeInTheDocument()
    expect(screen.getByTestId('standing-order-links')).toBeInTheDocument()
  })

  it('disables the sections that are not built yet and labels them', async () => {
    stub()
    render(<SettingsScreen locale="he" />)
    expect(await screen.findByTestId('settings-section-prices')).toBeDisabled()
    expect(screen.getByTestId('settings-section-prices')).toHaveTextContent(
      t('he', 'common.settings.notYetAvailable'),
    )
    expect(screen.getByTestId('settings-section-studio')).toBeEnabled()
  })

  it('gives every toggle a state label in words', async () => {
    // 3f's whole caption: לכל מתג תווית מצב. It is also SC 1.4.1 — colour and knob
    // position alone do not tell a manager in bright sun whether a switch is on.
    stub()
    render(<SettingsScreen locale="he" />)
    await screen.findByTestId('settings-panel-studio')
    const switches = screen.getAllByRole('switch')
    expect(switches.length).toBe(3)
    // The state reaches a screen reader through aria-checked...
    for (const control of switches) {
      expect(control).toHaveAttribute('aria-checked')
    }
    // ...and everyone else through a word beside it. he is on, en and ru are off.
    expect(screen.getAllByText(t('he', 'common.settings.parentLocale.off'))).toHaveLength(2)
    expect(screen.getAllByText(t('he', 'common.settings.parentLocale.on'))).toHaveLength(1)
  })

  it('locks the default language on, and explains the lock', async () => {
    // §9's fallback chain resolves through default_locale, so switching it off would
    // leave the fallback pointing at a language the studio says it does not offer.
    stub()
    render(<SettingsScreen locale="he" />)
    const hebrew = await screen.findByRole('switch', {
      name: t('he', 'common.setup.studio.locale.he'),
    })
    expect(hebrew).toBeDisabled()
    expect(
      screen.getByText(t('he', 'common.settings.defaultLocaleLocked')),
    ).toBeInTheDocument()
  })

  it('autosaves a field on blur, as its own subtitle promises', async () => {
    const seen: unknown[] = []
    stub((body) => seen.push(body))
    render(<SettingsScreen locale="he" />)

    const phone = await screen.findByLabelText(t('he', 'common.setup.studio.phone'))
    await userEvent.clear(phone)
    await userEvent.type(phone, '09-000-0000')
    await userEvent.tab()
    await waitFor(() => expect(seen).toContainEqual({ phone: '09-000-0000' }))
    expect(await screen.findByText(t('he', 'common.settings.saved'))).toBeInTheDocument()
  })

  it('turns a parent language on through the toggle', async () => {
    const seen: unknown[] = []
    stub((body) => seen.push(body))
    render(<SettingsScreen locale="he" />)

    const russian = await screen.findByRole('switch', {
      name: t('he', 'common.setup.studio.locale.ru'),
    })
    await userEvent.click(russian)
    await waitFor(() => expect(seen).toContainEqual({ parent_locales: ['he', 'ru'] }))
  })

  it('does NOT ship a health-declaration attendance block', async () => {
    // SPEC §5.5: 'There is therefore no block_attendance_without_health setting — nothing
    // to configure.' Artboard 3f draws one anyway; the spec wins, and this test is what
    // stops it being added back by someone reading only the canvas.
    stub()
    render(<SettingsScreen locale="he" />)
    await screen.findByTestId('settings-panel-studio')
    expect(screen.queryByText(/חסימת השתתפות/)).toBeNull()
  })
})


describe('the landing-content panel (2026-08-28)', () => {
  it('shows the current copy and autosaves a field through PATCH /studio', async () => {
    // The shop window's writer: the public landing reads settings.landing.* and until
    // this panel nothing could write it.
    const patches: unknown[] = []
    stub((body) => patches.push(body))
    render(<SettingsScreen locale="he" />)
    const headline = await screen.findByTestId('settings-landing-headline')

    await userEvent.type(headline, 'ג׳ודו מגיל 4')
    await userEvent.tab()
    await waitFor(() => expect(patches.length).toBeGreaterThan(0))
    expect(patches.at(-1)).toEqual({ landing: { headline: 'ג׳ודו מגיל 4' } })
  })

  it('sends the trial steps one per line', async () => {
    const patches: { landing?: { trial_steps?: string[] } }[] = []
    stub((body) => patches.push(body as never))
    render(<SettingsScreen locale="he" />)
    const steps = await screen.findByTestId('settings-landing-steps')
    await userEvent.type(steps, 'מגיעים עשר דקות לפני\nמתאמנים')
    await userEvent.tab()
    await waitFor(() =>
      expect(patches.at(-1)?.landing?.trial_steps).toEqual(['מגיעים עשר דקות לפני', 'מתאמנים']),
    )
  })
})

describe('a settings row says what it is (2026-08-29)', () => {
  it('shows each language name, not three rows reading "shown to parents"', async () => {
    // `Switch` keeps its own label screen-reader-only — right for a switch whose row
    // already names it, and `SettingToggle` never rendered that name. So the three
    // parent-language toggles were visually identical: "מוצג להורים" three times, with no
    // way to tell which row was Hebrew and which was Russian.
    stub()
    const { container } = render(<SettingsScreen locale="he" />)
    await screen.findByTestId('settings-panel-studio')
    const visible = [...container.querySelectorAll('.settings-row__label')].map(
      (node) => node.textContent,
    )
    for (const code of ['he', 'en', 'ru'] as const) {
      expect(visible).toContain(t('he', `common.setup.studio.locale.${code}`))
    }
    // The switch keeps the same string as its accessible name, so a screen reader still
    // hears which language each row is — and hears it once, because the visible copy is
    // aria-hidden.
    expect(
      screen.getByRole('switch', { name: t('he', 'common.setup.studio.locale.ru') }),
    ).toBeInTheDocument()
  })
})
