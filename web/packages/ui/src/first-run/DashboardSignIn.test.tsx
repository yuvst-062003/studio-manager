// The dashboard app's sign-in — the owner's Stitch export "Dojo Hazon".
//
// `SignIn`'s tests in `first-run.test.tsx` guard the parent app's screen and
// `ManagerSignIn.test.tsx` guards the staff app's. These assert the same flow rules on the
// third face, because they are the rules a redesign is most likely to drop: the paint
// changed completely and the OAuth contract did not.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { DashboardSignIn } from './DashboardSignIn'

const GOOGLE = { name: 'google', start_url: '/api/v1/auth/google/start' }

const answerWith = (items: unknown[]) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ items }), { status: 200 })),
  )

afterEach(() => vi.unstubAllGlobals())

describe('DashboardSignIn', () => {
  beforeEach(() => answerWith([GOOGLE]))

  it('renders a top-level link, never a fetch or an iframe', async () => {
    // §5.2 — 'OAuth must never run inside a webview. Google returns disallowed_useragent.
    // The flow is a standard top-level redirect.' An in-page request is the first step
    // toward being one, and this screen's button is the most redesigned element on it.
    const { container } = render(<DashboardSignIn locale="he" onChooseLocale={vi.fn()} />)
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: t('he', 'common.auth.signInWithGoogle') }),
      ).toBeInTheDocument(),
    )
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('form')).toBeNull()
    expect(container.querySelector('button[type="submit"]')).toBeNull()
  })

  it('tells the server this app began the flow', async () => {
    // The callback returns to that app's own origin; §6.5 gives each PWA one. The value
    // used to be a prop the dashboard passed to `SignIn`, and passing "staff" there once
    // sent a signed-in manager to the wrong origin. It is hard-coded in the component
    // now, which makes a wrong value silent forever unless this pins it.
    render(<DashboardSignIn locale="he" onChooseLocale={vi.fn()} />)
    await waitFor(() => {
      const href = screen
        .getByRole('link', { name: t('he', 'common.auth.signInWithGoogle') })
        .getAttribute('href')
      expect(href).toContain('app=dashboard')
      expect(href).toContain('/api/v1/auth/google/start')
    })
  })

  it('carries the return path into the start URL', async () => {
    render(<DashboardSignIn locale="he" onChooseLocale={vi.fn()} returnPath="/#/billing" />)
    await waitFor(() =>
      expect(
        screen
          .getByRole('link', { name: t('he', 'common.auth.signInWithGoogle') })
          .getAttribute('href'),
      ).toContain(`return_path=${encodeURIComponent('/#/billing')}`),
    )
  })

  it('offers only the providers the server configured', async () => {
    // A button for an unconfigured provider fails one step AFTER the user picked their
    // account. The export draws one button; the screen must not hard-code one.
    answerWith([])
    render(<DashboardSignIn locale="he" onChooseLocale={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByText(t('he', 'common.auth.noProviders'))).toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('link', { name: t('he', 'common.auth.signInWithGoogle') }),
    ).toBeNull()
  })

  it('renders no sign-in link at all when the provider list cannot be fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline')
      }),
    )
    render(<DashboardSignIn locale="he" onChooseLocale={vi.fn()} />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: t('he', 'common.auth.dashboard.title') }),
      ).toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('link', { name: t('he', 'common.auth.signInWithGoogle') }),
    ).toBeNull()
    // …and no misconfiguration notice: unknown is not the same as empty, and telling a
    // manager the environment is broken when the answer simply has not arrived would
    // send them to look for a problem that is not there.
    expect(screen.queryByText(t('he', 'common.auth.noProviders'))).toBeNull()
  })

  it('puts language before login, in the top bar', async () => {
    // §6.1 step 1 — 'language before login, because a Russian-speaking parent cannot read
    // a Hebrew consent screen.' The export moved the picker into the header; it did not
    // remove it, and this screen is the only place a manager can reach it before signing
    // in. The dashboard used to mount a separate `LanguagePicker` here.
    const onChooseLocale = vi.fn()
    render(<DashboardSignIn locale="he" onChooseLocale={onChooseLocale} />)
    expect(screen.getByRole('button', { name: 'עברית' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Русский' }))
    expect(onChooseLocale).toHaveBeenCalledWith('ru')
  })

  it('gives the club mark an accessible name and hides every decorative layer', () => {
    // The ground, the grid, the kanji and Google's own mark are texture. A screen reader
    // announcing 柔道 above the title would be noise, and the crest is the one image here
    // that carries meaning — 'Gladiator Manager', which is what distinguishes this screen
    // from the other two apps' and which the wordmark on the crest cannot say.
    const { container } = render(<DashboardSignIn locale="he" onChooseLocale={vi.fn()} />)
    expect(
      screen.getByRole('img', { name: t('he', 'common.appName.dashboard') }),
    ).toBeInTheDocument()
    // `queryByText` walks the DOM, not the accessibility tree, so it finds hidden nodes —
    // the property worth asserting is the one that keeps the kanji out of that tree.
    expect(screen.getByText('柔道').closest('[aria-hidden="true"]')).not.toBeNull()
    for (const svg of container.querySelectorAll('svg')) {
      expect(svg.getAttribute('aria-hidden')).toBe('true')
    }
    // The crest is the only image with a role; the three texture layers carry no content.
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })

  it('makes the sign-in the page heading, not the wordmark', () => {
    // The export sets the club name at 48px across the top and the card's title at 32px,
    // so the bigger text is the one that is NOT the heading. Ranking them the other way
    // would announce a brand name where a screen reader expects what this page is for.
    render(<DashboardSignIn locale="he" onChooseLocale={vi.fn()} />)
    const headings = screen.getAllByRole('heading')
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent(t('he', 'common.auth.dashboard.title'))
  })

  it('renders the title, the blurb and the copyright from i18n in every locale', () => {
    // No inline strings (.claude/rules/ui-rtl-a11y.md). The wordmark deliberately reads
    // the same in all three — see he/common.ts — but the rest must not.
    for (const locale of ['he', 'en', 'ru'] as const) {
      const { unmount } = render(<DashboardSignIn locale={locale} onChooseLocale={vi.fn()} />)
      expect(screen.getByText(t(locale, 'common.auth.dashboard.wordmark'))).toBeInTheDocument()
      expect(screen.getByText(t(locale, 'common.auth.dashboard.blurb'))).toBeInTheDocument()
      expect(screen.getByText(t(locale, 'common.auth.dashboard.copyright'))).toBeInTheDocument()
      unmount()
    }
  })
})
