// §6.1's staff first launch, in its stated order:
//
//   1 שפה (BEFORE login) → 2 welcome → 3 resolve → 4 tour → 5 התראות → 6 offline prime
//
// The install gate sits in front of all of it. §6.5: "the install is treated as part of
// onboarding, not an afterthought" — and for the staff app §10.6 makes it load-bearing
// rather than nice, because `pending_ops` must never be reclaimed and only a home-screen
// web app is exempt from Safari's 7-day script-storage cap.
import { useEffect, useState } from 'react'
import { useDisplayMode, useSession } from '@studio/core'
import { AppShell, InstallWalkthrough, LanguagePicker, SignIn, ThemeProvider } from '@studio/ui'
import { DevBar } from '@studio/ui/dev-bar'
import type { InstallPromptEvent } from '@studio/ui'
import type { Locale } from '@studio/i18n'
import { Resolve } from './features/identity/Resolve'

const NAV = [
  { key: 'today', labelKey: 'common.nav.today', href: '/' },
  { key: 'schedule', labelKey: 'common.nav.schedule', href: '/schedule' },
  { key: 'students', labelKey: 'common.nav.students', href: '/students' },
  { key: 'attendance', labelKey: 'common.nav.attendance', href: '/attendance' },
  { key: 'announcements', labelKey: 'common.nav.announcements', href: '/announcements' },
  { key: 'settings', labelKey: 'common.nav.settings', href: '/settings' },
]

export default function App() {
  const session = useSession()
  const displayMode = useDisplayMode()
  // M0 already drew this line: core's isInstalled() is display-mode !== 'browser', so a
  // fullscreen or minimal-ui home-screen launch counts too. Its own docstring names
  // M1's onboarding gate as the caller.
  const installed = displayMode !== 'browser'
  const [locale, setLocale] = useState<Locale>('he')
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)

  useEffect(() => {
    // Chromium fires this when it considers the app installable; iOS never does, which
    // is why §6.5's iOS path is taught rather than prompted.
    const onPrompt = (event: Event): void => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    globalThis.addEventListener('beforeinstallprompt', onPrompt)
    return () => globalThis.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  // §6.5 — 'first run does not proceed until the app is running in standalone display
  // mode.' Rendered INSTEAD of the app, not beside it.
  if (!installed) {
    return (
      <ThemeProvider>
        <InstallWalkthrough locale={locale} installed={false} deferredPrompt={installPrompt} />
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      {session.status === 'anonymous' ? (
        // §6.1's ordering rationale: 'language before login, because a Russian-speaking
        // parent cannot read a Hebrew consent screen.'
        <>
          <LanguagePicker locale={locale} onChoose={setLocale} />
          <SignIn locale={locale} app="staff" />
        </>
      ) : null}

      {session.status === 'signed-in' ? (
        <AppShell
          title={session.activeStudioName ?? ''}
          items={NAV}
          locale={locale}
          studios={session.studios.map((s) => ({
            studioId: s.studio_id,
            studioName: s.studio_name,
            studioIsDemo: s.studio_is_demo,
          }))}
          activeStudioId={session.activeStudioId}
          devBar={
            // §19.4 — the identity is real now. `devTools` comes from /auth/me, which
            // reads the verified is_developer claim; before M1 every app passed null.
            <DevBar
              identity={
                session.devTools
                  ? {
                      isDeveloper: true,
                      studioName: session.activeStudioName ?? '',
                      actingAs: session.actingAsLabel ?? undefined,
                    }
                  : null
              }
              locale={locale}
            />
          }
        >
          <Resolve session={session} locale={locale} wizard={null} />
        </AppShell>
      ) : null}
    </ThemeProvider>
  )
}
