// Dashboard artboard 3f — הגדרות. לכל מתג תווית מצב.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { ThemeProvider } from '@studio/ui'
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
  it('renders the five sections the rail now carries', async () => {
    // Was "renders every section 3f lists, including the ones M1 does not own", asserting
    // eight. Its reasoning — "a manager who cannot find מחירים concludes it is missing,
    // not that it is next" — was answered by giving each of those screens a door in the
    // sidebar; carrying them here as well is what made settings a second menu. Where each
    // one went is listed in the test below.
    stub()
    render(<SettingsScreen locale="he" />)
    for (const key of ['studio', 'structure', 'payments', 'appearance', 'users']) {
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

  // Rewritten 2026-09-10. The previous version asserted that six rail entries were LINKS
  // to the screens that own them — prices, documents, attendance, notifications, users and
  // belts. That was the right fix in August, when it replaced six disabled stubs reading
  // "not yet available". It is the wrong shape now: every one of those six also has a door
  // in the sidebar, so the rail was a second menu to the same places, and the owner asked
  // why settings held all of it. §3.19's answer is five tabs, four of which render in
  // place. This test now guards the smaller rail rather than the bigger one.
  it('is five tabs, and only staff still navigates away (§3.19)', async () => {
    stub()
    render(<SettingsScreen locale="he" />)
    await screen.findByTestId('settings-panel-studio')

    // In place: no href, and clicking one swaps the panel rather than leaving the screen.
    for (const key of ['studio', 'structure', 'payments', 'appearance']) {
      expect(screen.getByTestId(`settings-section-${key}`)).not.toHaveAttribute('href')
    }

    // The one deliberate exception. §3.19: "`#/staff` is the real thing and the settings
    // tab should link to it" — rather than grow the prototype's hardcoded three-person
    // list and its toast-only "add staff member" button.
    expect(screen.getByTestId('settings-section-users')).toHaveAttribute('href', '#/staff')

    // The four that left. Each is a sidebar door of its own; a rail entry for it was the
    // duplication being removed, not a route being deleted.
    for (const key of ['prices', 'documents', 'attendance', 'notifications', 'belts']) {
      expect(screen.queryByTestId(`settings-section-${key}`)).not.toBeInTheDocument()
    }
  })

  // Retiring `overflowDoors()` took the sidebar entries for the setup wizard and the
  // training-year rollover with it, so this pair of links is now the only way to reach
  // either from the chrome. `unreachable-screens.test.ts` guards components, not routes —
  // it would not have caught their loss.
  it('keeps the two once-a-year flows reachable from the appearance tab', async () => {
    stub()
    // `ThemeProvider` and not a bare render: the appearance tab mounts `ThemeControl`,
    // which reads the theme context and throws without it. `App.tsx` wraps the whole app
    // in one (App.tsx:665), so this is the harness catching up with the component rather
    // than a wrapper invented for the test.
    render(
      <ThemeProvider>
        <SettingsScreen locale="he" />
      </ThemeProvider>,
    )
    await userEvent.click(await screen.findByTestId('settings-section-appearance'))
    const panel = await screen.findByTestId('settings-panel-appearance')
    expect(panel).toBeInTheDocument()
    expect(screen.getByTestId('settings-link-setup')).toHaveAttribute('href', '#/setup')
    expect(screen.getByTestId('settings-link-rollover')).toHaveAttribute('href', '#/rollover')
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

describe('the landing photo strip (2026-08-29)', () => {
  const PHOTOS = [
    { id: 'p1', url: '/api/v1/public/studios/x/photos/p1' },
    { id: 'p2', url: '/api/v1/public/studios/x/photos/p2' },
  ]

  function stubWithPhotos({
    uploadResponse = new Response(
      JSON.stringify({
        photos: [...PHOTOS, { id: 'p3', url: '/api/v1/public/studios/x/photos/p3' }],
      }),
      { status: 200 },
    ),
    onDelete,
  }: {
    uploadResponse?: Response
    onDelete?: (url: string) => void
  } = {}) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (init?.method === 'POST' && url.includes('/studio/landing-photos')) {
          return uploadResponse
        }
        if (init?.method === 'DELETE' && url.includes('/studio/landing-photos/')) {
          onDelete?.(url)
          return new Response(null, { status: 204 })
        }
        return new Response(JSON.stringify({ ...STUDIO, landing_photos: PHOTOS }), {
          status: 200,
        })
      }),
    )
  }

  it('renders the strip with a delete button per photo', async () => {
    stubWithPhotos()
    render(<SettingsScreen locale="he" />)
    expect(await screen.findByTestId('settings-landing-photos')).toBeInTheDocument()
    expect(screen.getByTestId('settings-landing-photo-delete-p1')).toBeInTheDocument()
    expect(screen.getByTestId('settings-landing-photo-delete-p2')).toBeInTheDocument()
  })

  it('uploads a picked file and repaints the strip from the response', async () => {
    stubWithPhotos()
    const user = userEvent.setup()
    render(<SettingsScreen locale="he" />)
    const input = await screen.findByLabelText(t('he', 'common.settings.landing.addPhoto'))
    await user.upload(input, new File([new Uint8Array(8)], 'mat.png', { type: 'image/png' }))
    expect(await screen.findByTestId('settings-landing-photo-delete-p3')).toBeInTheDocument()
  })

  it('deletes a photo and drops it from the strip', async () => {
    const deleted: string[] = []
    stubWithPhotos({ onDelete: (url) => deleted.push(url) })
    const user = userEvent.setup()
    render(<SettingsScreen locale="he" />)
    await user.click(await screen.findByTestId('settings-landing-photo-delete-p1'))
    await waitFor(() => expect(deleted.some((url) => url.endsWith('/p1'))).toBe(true))
    await waitFor(() =>
      expect(screen.queryByTestId('settings-landing-photo-delete-p1')).toBeNull(),
    )
  })

  it('says the strip is full when the server refuses a seventh', async () => {
    stubWithPhotos({
      uploadResponse: new Response(
        JSON.stringify({ detail: { code: 'too_many_photos', message: '' } }),
        { status: 409 },
      ),
    })
    const user = userEvent.setup()
    render(<SettingsScreen locale="he" />)
    const input = await screen.findByLabelText(t('he', 'common.settings.landing.addPhoto'))
    await user.upload(input, new File([new Uint8Array(8)], 'mat.png', { type: 'image/png' }))
    expect(
      await screen.findByText(t('he', 'common.settings.landing.photoTooMany')),
    ).toBeInTheDocument()
  })
})

// -- the club's logo (owner report, 2026-08-30) --------------------------------
//
// "in admin settings i still cant see the logo, nor upload new logo in the settings."
//
// One cause for both. `POST /studio/logo` had existed since studio settings shipped and
// NOTHING in this app called it; the panel only rendered a logo, with `logoDrop` beside it
// as a bare paragraph that reads like a drop zone and accepted nothing. So no club could
// set a logo, and the reason none was visible is that there had never been a way to put
// one there.
describe('the studio logo', () => {
  function uploadStub(status = 200) {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        calls.push({ url, init })
        if (url.includes('/studio/logo')) {
          return status === 200
            ? new Response(JSON.stringify({ logo_url: '/api/v1/studio/logo?v=2' }), { status })
            : new Response(JSON.stringify({ detail: { code: 'unsupported_image' } }), { status })
        }
        return new Response(JSON.stringify(STUDIO), { status: 200 })
      }),
    )
    return calls
  }

  const png = () => new File(['bytes'], 'logo.png', { type: 'image/png' })

  it('offers a control at all, and posts the file to the endpoint', async () => {
    const calls = uploadStub()
    render(<SettingsScreen locale="he" />)
    const input = await screen.findByTestId('settings-logo-input')
    await userEvent.upload(input, png())

    await waitFor(() =>
      expect(calls.some((call) => call.url.includes('/studio/logo'))).toBe(true),
    )
    const posted = calls.find((call) => call.url.includes('/studio/logo'))!
    expect(posted.init?.method).toBe('POST')
    // Multipart, and the server names the part `file`.
    expect(posted.init?.body).toBeInstanceOf(FormData)
    expect((posted.init?.body as FormData).get('file')).toBeInstanceOf(File)
  })

  it('never sends an SVG, because the server refuses one', async () => {
    // The endpoint's own message: "a logo must be a PNG, a JPEG or a WebP. SVG is never
    // accepted." Filtering at the picker saves a round trip to a refusal.
    uploadStub()
    render(<SettingsScreen locale="he" />)
    const input = await screen.findByTestId('settings-logo-input')
    expect(input).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp')
  })

  it('says WHICH formats when the server refuses the file', async () => {
    // 415 and 413 are both the owner's to fix, so neither may arrive as "save failed" —
    // that sends them back to the same file.
    uploadStub(415)
    render(<SettingsScreen locale="he" />)
    await userEvent.upload(await screen.findByTestId('settings-logo-input'), png())
    // `ImagePicker` derives its error node's id from the input's, so this moved from
    // `settings-logo-error` when the bare file input became the picker (2026-09-10). The
    // assertion it makes is unchanged: a 415 says WHICH formats, never "save failed".
    expect(await screen.findByTestId('settings-logo-input-error')).toHaveTextContent(
      t('he', 'common.setup.studio.logoRejected'),
    )
  })

  // Was "shows the placeholder while no logo is set", which asserted a `<p>` reading
  // "גררו לוגו 512×512" — a paragraph that looked like a drop zone and accepted nothing,
  // sitting beside the browser's own grey English "Choose File" button. The owner asked
  // for a pressable empty square with a picture icon instead. The state being guarded is
  // the same one: with no logo set, the control must invite an upload rather than show a
  // broken image.
  it('offers a pressable empty square while no logo is set', async () => {
    uploadStub()
    render(<SettingsScreen locale="he" />)
    const frame = await screen.findByTestId('settings-logo-input-frame')
    // A <label> wrapping the input is what makes the whole square a hit target without an
    // onClick, and is what keeps the control keyboard-reachable.
    expect(frame.tagName).toBe('LABEL')
    expect(frame).toContainElement(screen.getByTestId('settings-logo-input'))
    // The 512×512 the generic empty label cannot carry.
    expect(frame).toHaveTextContent(t('he', 'common.setup.studio.logoDrop'))
    // No preview image while nothing is set.
    expect(frame.querySelector('img')).toBeNull()
  })
})

// Checkpoint 15 — §3.19's named defect: "`GET /api/v1/studio` failure is swallowed — the
// panel never leaves its loading state."
describe('a failed studio read says so', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the failure and a retry, not טוען… for ever', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1
        if (calls === 1) return new Response('{}', { status: 500 })
        return new Response(JSON.stringify(STUDIO), { status: 200 })
      }),
    )
    render(<SettingsScreen locale="he" />)

    expect(await screen.findByText(t('he', 'common.loadFailed.body'))).toBeInTheDocument()
    // NOT the loading line: "we could not load this" and "this is still coming" are
    // different sentences, and the old code showed only the second, for ever.
    expect(screen.queryByTestId('settings-loading')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: t('he', 'common.loadFailed.retry') }))
    expect(await screen.findByTestId('settings-panel-studio')).toBeInTheDocument()
  })

  it('treats a non-2xx as a failure, not as a studio with no name', async () => {
    // The old code read `response.json()` whatever the status, so a 500 whose body happened
    // to parse became a studio object with every field undefined — and the form rendered
    // it as blanks a manager could then SAVE over their real details.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
    render(<SettingsScreen locale="he" />)
    expect(await screen.findByText(t('he', 'common.loadFailed.body'))).toBeInTheDocument()
    expect(screen.queryByTestId('settings-panel-studio')).not.toBeInTheDocument()
  })
})
