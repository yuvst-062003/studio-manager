// §6.1's first run and §6.5's install walkthrough.
//
// The leak tests earn their place: §6.1 says "Neither screen leaks whether the account
// exists in the other app", and a refusal reading "you have 2 children, use the parent
// app" would be an account-enumeration oracle for anyone holding a stolen phone.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { InstallBanner } from './InstallBanner'
import { InstallWalkthrough, isIosSafari } from './InstallWalkthrough'
import { LanguagePicker } from './LanguagePicker'
import { RefusalScreen } from './RefusalScreen'
import { SignIn } from './SignIn'

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'

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
    render(<SignIn locale="he" app="parent" />)
    await waitFor(() => {
      const link = screen.getByRole('link')
      expect(link.getAttribute('href')).toContain('app=parent')
    })
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
