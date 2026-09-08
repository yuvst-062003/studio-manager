// The staff app's sign-in — docs/design "Gladiator Manager Sign In".
//
// `SignIn`'s tests in `first-run.test.tsx` still guard the OTHER two apps' screen. These
// assert the same flow rules on this one, because they are the rules a redesign is most
// likely to drop: the paint changed completely and the OAuth contract did not.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { ManagerSignIn, PRIVACY_HASH, TERMS_HASH } from './ManagerSignIn'

const GOOGLE = { name: 'google', start_url: '/api/v1/auth/google/start' }

const answerWith = (items: unknown[]) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ items }), { status: 200 })),
  )

afterEach(() => vi.unstubAllGlobals())

describe('ManagerSignIn', () => {
  beforeEach(() => answerWith([GOOGLE]))

  it('renders a top-level link, never a fetch or an iframe', async () => {
    // §5.2 — 'OAuth must never run inside a webview. Google returns disallowed_useragent.
    // The flow is a standard top-level redirect.' An in-page request is the first step
    // toward being one, and this screen's button is the most redesigned element on it.
    const { container } = render(<ManagerSignIn locale="he" onChooseLocale={vi.fn()} />)
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: t('he', 'common.auth.manager.signInWithGoogle') }),
      ).toBeInTheDocument(),
    )
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('form')).toBeNull()
    expect(container.querySelector('button[type="submit"]')).toBeNull()
  })

  it('tells the server this app began the flow', async () => {
    // The callback returns to that app's own origin; §6.5 gives each PWA one. Hard-coded
    // to 'staff' in this component, so a wrong value here would be silent forever.
    render(<ManagerSignIn locale="he" onChooseLocale={vi.fn()} />)
    await waitFor(() => {
      const href = screen.getByRole('link', {
        name: t('he', 'common.auth.manager.signInWithGoogle'),
      }).getAttribute('href')
      expect(href).toContain('app=staff')
      expect(href).toContain('/api/v1/auth/google/start')
    })
  })

  it('offers only the providers the server configured', async () => {
    // A button for an unconfigured provider fails one step AFTER the user picked their
    // account. The mock draws one button; the screen must not hard-code one.
    answerWith([])
    render(<ManagerSignIn locale="he" onChooseLocale={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByText(t('he', 'common.auth.noProviders'))).toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('link', { name: t('he', 'common.auth.manager.signInWithGoogle') }),
    ).toBeNull()
  })

  it('renders no sign-in link at all when the provider list cannot be fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline')
      }),
    )
    render(<ManagerSignIn locale="he" onChooseLocale={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/Google/)).toBeInTheDocument())
    expect(
      screen.queryByRole('link', { name: t('he', 'common.auth.manager.signInWithGoogle') }),
    ).toBeNull()
    // …and the blurb, not the misconfiguration notice: unknown is not the same as empty.
    expect(screen.queryByText(t('he', 'common.auth.noProviders'))).toBeNull()
  })

  it('puts language before login, in the footer', async () => {
    // §6.1 step 1 — 'language before login, because a Russian-speaking parent cannot read
    // a Hebrew consent screen.' The mock moved the picker into the footer; it did not
    // remove it, and this screen is the only place a coach can reach it before signing in.
    const onChooseLocale = vi.fn()
    render(<ManagerSignIn locale="he" onChooseLocale={onChooseLocale} />)
    expect(screen.getByRole('button', { name: 'עברית' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Русский' }))
    expect(onChooseLocale).toHaveBeenCalledWith('ru')
  })

  it('links both legal documents at hashes this app routes', () => {
    // The footer's two links are the reason `LegalScreen` exists. If these drift from the
    // constants the staff shell routes on, the links become a screen that renders nothing
    // — which is exactly how they would fail silently.
    render(<ManagerSignIn locale="he" onChooseLocale={vi.fn()} />)
    expect(
      screen.getByRole('link', { name: t('he', 'common.auth.manager.terms') }),
    ).toHaveAttribute('href', TERMS_HASH)
    expect(
      screen.getByRole('link', { name: t('he', 'common.auth.manager.privacy') }),
    ).toHaveAttribute('href', PRIVACY_HASH)
  })

  it('gives the club mark an accessible name and hides every decorative layer', () => {
    // The ground, the grid, the hatch, the vignette and the kanji are texture. A screen
    // reader announcing 柔道 between the badge and the logo would be noise, and the crest
    // is the one image here that carries meaning.
    const { container } = render(<ManagerSignIn locale="he" onChooseLocale={vi.fn()} />)
    expect(screen.getByRole('img', { name: t('he', 'common.appName.staff') })).toBeInTheDocument()
    // `queryByText` walks the DOM, not the accessibility tree, so it finds hidden nodes —
    // the property worth asserting is the one that keeps the kanji out of that tree.
    expect(screen.getByText('柔道').closest('[aria-hidden="true"]')).not.toBeNull()
    for (const svg of container.querySelectorAll('svg')) {
      expect(svg.getAttribute('aria-hidden')).toBe('true')
    }
    // The crest is the only image with a role; the five texture layers carry no content.
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })

  it('renders the eyebrow and the blurb from i18n in every locale', () => {
    // No inline strings (.claude/rules/ui-rtl-a11y.md). The badge deliberately reads the
    // same in all three — see he/common.ts — but the blurb must not.
    for (const locale of ['he', 'en', 'ru'] as const) {
      const { unmount } = render(<ManagerSignIn locale={locale} onChooseLocale={vi.fn()} />)
      expect(screen.getByText(t(locale, 'common.auth.manager.badge'))).toBeInTheDocument()
      expect(screen.getByText(t(locale, 'common.auth.manager.blurb'))).toBeInTheDocument()
      unmount()
    }
  })
})
