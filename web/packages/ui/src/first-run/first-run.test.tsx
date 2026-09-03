// §6.1's first run and §6.5's install walkthrough.
//
// The leak tests earn their place: §6.1 says "Neither screen leaks whether the account
// exists in the other app", and a refusal reading "you have 2 children, use the parent
// app" would be an account-enumeration oracle for anyone holding a stolen phone.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { chromeIntentUrl, detectInAppBrowser, InAppBrowserBanner } from './InAppBrowserBanner'
import { InstallBanner } from './InstallBanner'
import { InstallWalkthrough, isIosSafari } from './InstallWalkthrough'
import { LanguagePicker } from './LanguagePicker'
import { RefusalScreen } from './RefusalScreen'
import { SignIn } from './SignIn'

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'
const INSTAGRAM_IOS = `${IOS} Instagram 314.0.0.28.111`
const INSTAGRAM_ANDROID = `${ANDROID} Instagram 314.0.0.28.111`
const FACEBOOK_IOS = `${IOS} [FBAN/FBIOS;FBAV/450.0.0.38.108;]`
const TIKTOK_IOS = `${IOS} musical_ly_2023801020`
const LINKEDIN_IOS = `${IOS} LinkedInApp/9.28.1`

afterEach(() => vi.unstubAllGlobals())

describe('LanguagePicker', () => {
  it('offers all three locales', () => {
    render(<LanguagePicker locale="he" onChoose={vi.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('names each language in that language', () => {
    // Someone who cannot read the current locale still has to recognise their own —
    // which is §6.1's entire reason for putting this before login.
    render(<LanguagePicker locale="he" onChoose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Русский' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument()
  })

  it('marks the current locale as pressed', () => {
    render(<LanguagePicker locale="ru" onChoose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Русский' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('reports the chosen locale', async () => {
    const onChoose = vi.fn()
    render(<LanguagePicker locale="he" onChoose={onChoose} />)
    await userEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(onChoose).toHaveBeenCalledWith('en')
  })
})

describe('SignIn', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ items: [{ name: 'google', start_url: '/api/v1/auth/google/start' }] }), {
          status: 200,
        }),
      ),
    )
  })

  it('renders a top-level link, never a fetch or an iframe', async () => {
    // §5.2 — 'OAuth must never run inside a webview. Google returns disallowed_useragent.
    // The flow is a standard top-level redirect.' An in-page request is the first step
    // toward being one.
    const { container } = render(<SignIn locale="he" app="staff" />)
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: t('he', 'common.auth.continueWithGoogle') }),
      ).toBeInTheDocument(),
    )
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('form')).toBeNull()
  })

  it('tells the server which app began the flow', async () => {
    // The callback returns to that app's own origin; §6.5 gives each PWA one.
    //
    // Selected by its href rather than as "the only link on the screen": the parent
    // face carries policy links in its footer, so `getByRole('link')` stopped being a
    // way to name the PROVIDER link the moment that design landed.
    render(<SignIn locale="he" app="parent" />)
    await waitFor(() => {
      const start = screen
        .getAllByRole('link')
        .find((link) => link.getAttribute('href')?.includes('/auth/'))
      expect(start?.getAttribute('href')).toContain('app=parent')
    })
  })

  it('gives the parent app its own face and leaves the other two alone', async () => {
    // The owner's Stitch design (2026-09-01) was scoped to PARENTS. This file serves
    // three apps from one component, so the scoping is the whole risk: restyling it
    // for everyone would have moved the dashboard sign-in the owner is happy with.
    const parent = render(<SignIn locale="he" app="parent" />)
    await waitFor(() =>
      expect(parent.container.querySelector('.gsignin--parent')).not.toBeNull(),
    )
    parent.unmount()

    for (const app of ['staff', 'dashboard'] as const) {
      const other = render(<SignIn locale="he" app={app} />)
      await waitFor(() => expect(other.container.querySelector('.gsignin')).not.toBeNull())
      expect(other.container.querySelector('.gsignin--parent')).toBeNull()
      other.unmount()
    }
  })

  it('reads the year rather than shipping one', async () => {
    // The design hardcoded "© 2024", already two years stale when it arrived. A wrong
    // date nobody looks at until a parent does.
    render(<SignIn locale="he" app="parent" />)
    await waitFor(() =>
      expect(screen.getByText(new RegExp(String(new Date().getFullYear())))).toBeInTheDocument(),
    )
  })

  it('offers only the providers the server configured', async () => {
    // A button for an unconfigured provider fails one step AFTER the user picked their
    // account. This is what keeps Apple invisible until HB-apple-developer closes.
    render(<SignIn locale="he" app="staff" />)
    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(1))
    expect(
      screen.queryByRole('link', { name: t('he', 'common.auth.continueWithApple') }),
    ).toBeNull()
  })

  it('renders no button at all when the provider list cannot be fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline')
      }),
    )
    const { container } = render(<SignIn locale="he" app="staff" />)
    await waitFor(() => expect(container.querySelectorAll('a')).toHaveLength(0))
  })

  it('warns before the Google button when opened inside an in-app browser', async () => {
    // SPEC §5.2 / the constraints table: "OAuth in embedded webviews — blocked by Google
    // (disallowed_useragent); must use system browser." The button is still there (a
    // false positive must not remove the only way in), but the warning comes first.
    render(<SignIn locale="he" app="parent" userAgent={INSTAGRAM_IOS} />)
    await waitFor(() => expect(screen.getByTestId('in-app-browser-banner')).toBeInTheDocument())
    expect(
      screen.getByRole('link', { name: t('he', 'common.auth.signInWithGoogle') }),
    ).toBeInTheDocument()
  })

  it('says nothing extra in an ordinary browser', async () => {
    render(<SignIn locale="he" app="parent" userAgent={ANDROID} />)
    await waitFor(() =>
      expect(screen.getByRole('link', { name: t('he', 'common.auth.signInWithGoogle') })).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('in-app-browser-banner')).toBeNull()
  })
})

describe('detectInAppBrowser', () => {
  it('recognises Instagram, Facebook, TikTok and LinkedIn regardless of platform', () => {
    expect(detectInAppBrowser(INSTAGRAM_IOS)).toBe('instagram')
    expect(detectInAppBrowser(INSTAGRAM_ANDROID)).toBe('instagram')
    expect(detectInAppBrowser(FACEBOOK_IOS)).toBe('facebook')
    expect(detectInAppBrowser(TIKTOK_IOS)).toBe('tiktok')
    expect(detectInAppBrowser(LINKEDIN_IOS)).toBe('linkedin')
  })

  it('reports nothing for an ordinary browser', () => {
    expect(detectInAppBrowser(IOS)).toBeNull()
    expect(detectInAppBrowser(ANDROID)).toBeNull()
  })
})

describe('chromeIntentUrl', () => {
  it('builds an Android intent link that falls back to the original URL if Chrome is absent', () => {
    // Android honours `intent://` even from inside another app's WebView, which is the one
    // platform where an automatic escape genuinely works — see InAppBrowserBanner below for
    // why iOS gets no equivalent. `S.browser_fallback_url` is what keeps a device with no
    // Chrome installed from landing on an error instead of the same page.
    const url = chromeIntentUrl('https://app.example.test/join/abc?x=1')
    expect(url).toBe(
      'intent://app.example.test/join/abc?x=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fapp.example.test%2Fjoin%2Fabc%3Fx%3D1;end',
    )
  })
})

describe('InAppBrowserBanner', () => {
  it('says nothing in an ordinary browser', () => {
    render(<InAppBrowserBanner locale="he" userAgent={IOS} />)
    expect(screen.queryByTestId('in-app-browser-banner')).toBeNull()
  })

  it('tells the parent how to reach the real browser when Instagram is detected', () => {
    render(<InAppBrowserBanner locale="he" userAgent={INSTAGRAM_IOS} />)
    const banner = screen.getByTestId('in-app-browser-banner')
    expect(banner).toBeInTheDocument()
    expect(banner.textContent).toContain(t('he', 'common.auth.inAppBrowser.instruction'))
    // Names WHICH app, not a generic "here" — a guardian juggling three apps that day
    // needs to know this warning is about the one she is actually in.
    expect(banner.textContent).toContain(t('he', 'common.auth.inAppBrowser.app.instagram'))
  })

  it('sends Android to Chrome via an intent link, automatically', () => {
    // The one platform where §5.2's "must use system browser" can actually be enforced
    // rather than only requested.
    const navigate = vi.fn()
    render(
      <InAppBrowserBanner
        locale="he"
        userAgent={INSTAGRAM_ANDROID}
        currentUrl="https://app.example.test/join/abc"
        navigate={navigate}
      />,
    )
    expect(navigate).toHaveBeenCalledWith(chromeIntentUrl('https://app.example.test/join/abc'))
  })

  it('never attempts a redirect on iOS — Apple allows no equivalent', () => {
    const navigate = vi.fn()
    render(
      <InAppBrowserBanner
        locale="he"
        userAgent={INSTAGRAM_IOS}
        currentUrl="https://app.example.test/join/abc"
        navigate={navigate}
      />,
    )
    expect(navigate).not.toHaveBeenCalled()
  })

  it('does not redirect in an ordinary Android browser', () => {
    const navigate = vi.fn()
    render(
      <InAppBrowserBanner
        locale="he"
        userAgent={ANDROID}
        currentUrl="https://app.example.test/join/abc"
        navigate={navigate}
      />,
    )
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('InstallBanner', () => {
  beforeEach(() => localStorage.clear())

  it('renders nothing once the app runs from a home screen', () => {
    const { container } = render(
      <InstallBanner locale="he" installed onOpenWalkthrough={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('pitches the install and opens the walkthrough on demand', async () => {
    const onOpen = vi.fn()
    render(<InstallBanner locale="he" installed={false} onOpenWalkthrough={onOpen} />)
    expect(screen.getByText(t('he', 'common.install.banner.text'))).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: t('he', 'common.install.banner.cta') }),
    )
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('remembers a dismissal across visits', async () => {
    // A nudge that reappears on every visit is a wall with extra steps — the choice
    // "I use this in the browser" is stored per device.
    const first = render(
      <InstallBanner locale="he" installed={false} onOpenWalkthrough={vi.fn()} />,
    )
    await userEvent.click(screen.getByTestId('install-banner-dismiss'))
    expect(screen.queryByTestId('install-banner')).toBeNull()
    first.unmount()

    const second = render(
      <InstallBanner locale="he" installed={false} onOpenWalkthrough={vi.fn()} />,
    )
    expect(second.container.firstChild).toBeNull()
  })
})

describe('RefusalScreen', () => {
  it.each([
    ['staff', 'common.refusal.staff.title'],
    ['parent', 'common.refusal.parent.title'],
  ] as const)('renders §6.1 wording for the %s app', (which, key) => {
    render(
      <RefusalScreen which={which} otherAppUrl="https://other.invalid" onSignOut={vi.fn()} locale="he" />,
    )
    expect(screen.getByText(t('he', key))).toBeInTheDocument()
  })

  it('offers a link to the other app rather than a dead end', () => {
    render(
      <RefusalScreen which="staff" otherAppUrl="https://parent.invalid" onSignOut={vi.fn()} locale="he" />,
    )
    expect(
      screen.getByRole('link', { name: t('he', 'common.refusal.staff.otherApp') }),
    ).toHaveAttribute('href', 'https://parent.invalid')
  })

  it('offers sign-out', async () => {
    // §6.1 — 'Both screens offer sign-out.' Without it the only way out is clearing site
    // data, which a parent on a phone will not find.
    const onSignOut = vi.fn()
    render(
      <RefusalScreen which="parent" otherAppUrl="https://staff.invalid" onSignOut={onSignOut} locale="he" />,
    )
    await userEvent.click(screen.getByRole('button', { name: t('he', 'common.nav.signOut') }))
    expect(onSignOut).toHaveBeenCalled()
  })

  it.each(['staff', 'parent'] as const)('leaks no count from the other app (%s)', (which) => {
    const { container } = render(
      <RefusalScreen which={which} otherAppUrl="https://x.invalid" onSignOut={vi.fn()} locale="he" />,
    )
    expect(container.textContent).not.toMatch(/\d/)
  })

  // 2026-09-03 — the account-chooser line, so a visitor signed into the wrong Google
  // account can tell that is the problem at a glance rather than guessing before hitting
  // sign out. Self-identification (the caller's OWN address), not the enumeration the
  // leak tests above guard against.
  it('tells a refused visitor which account they are signed in as', () => {
    render(
      <RefusalScreen
        which="parent"
        otherAppUrl="https://staff.invalid"
        onSignOut={vi.fn()}
        locale="he"
        email="wrong.account@example.invalid"
      />,
    )
    expect(screen.getByTestId('refusal-account')).toHaveTextContent(
      'wrong.account@example.invalid',
    )
  })

  it('renders nothing extra when the email has not resolved yet', () => {
    // A caller mid-refresh (or one that never learns the address) must not render
    // "signed in as null" — the whole point is a trustworthy account chooser, not a bug.
    render(
      <RefusalScreen which="parent" otherAppUrl="https://staff.invalid" onSignOut={vi.fn()} locale="he" />,
    )
    expect(screen.queryByTestId('refusal-account')).toBeNull()
  })
})

describe('InstallWalkthrough', () => {
  it('teaches the iOS steps, because there is no API to prompt with', () => {
    // §6.5 / G17 — 'beforeinstallprompt is Chromium-only, so on iPhone the install can
    // only be taught, never prompted.'
    render(<InstallWalkthrough locale="he" installed={false} userAgent={IOS} />)
    expect(screen.getByTestId('ios-add-to-home-screen')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('names the share icon in words as well as showing it', () => {
    // §6.5's walkthrough is read by someone who has never seen the icon. 'Tap the icon'
    // beside a silent picture is not instructions.
    render(<InstallWalkthrough locale="he" installed={false} userAgent={IOS} />)
    expect(
      screen.getByRole('img', { name: t('he', 'common.install.ios.shareIcon') }),
    ).toBeInTheDocument()
  })

  it('gives the screenshot alt text, not a bare image', () => {
    render(<InstallWalkthrough locale="he" installed={false} userAgent={IOS} />)
    expect(
      screen.getByRole('img', { name: t('he', 'common.install.ios.screenshotAlt') }),
    ).toBeInTheDocument()
  })

  it('offers a real install button on Chromium', async () => {
    const prompt = vi.fn(async () => undefined)
    render(
      <InstallWalkthrough
        locale="he"
        installed={false}
        userAgent={ANDROID}
        deferredPrompt={{ prompt } as never}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: t('he', 'common.install.button') }))
    expect(prompt).toHaveBeenCalled()
  })

  it('shows no install button on Chromium until the browser offers one', () => {
    // `beforeinstallprompt` only fires when the browser considers the app installable.
    // A button that calls nothing would be a button that appears to fail.
    render(<InstallWalkthrough locale="he" installed={false} userAgent={ANDROID} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders nothing once the app is running standalone', () => {
    // §6.5's gate: first run does not proceed until display-mode is standalone — and
    // once it is, this screen has nothing left to say.
    const { container } = render(
      <InstallWalkthrough locale="he" installed userAgent={IOS} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('treats every iOS browser as unable to prompt', () => {
    // Chromium on iOS is also WebKit and also cannot prompt, so it belongs on the taught
    // path — the check deliberately does not try to exclude it.
    expect(isIosSafari(IOS)).toBe(true)
    expect(isIosSafari(IOS.replace('Safari', 'CriOS'))).toBe(true)
    expect(isIosSafari(ANDROID)).toBe(false)
  })
})
