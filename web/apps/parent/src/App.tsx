// §6.1's parent first launch, in its stated order:
//
//   1 שפה (BEFORE login) → 2 welcome → 3 resolve → 4 studio picker
//   → 5 אישורים + 6 הצהרת בריאות (BLOCKING, M4's) → 7-9 prompted once → home
//
// The install gate sits in front of all of it. §6.5: on iOS, Web Push exists only for a
// home-screen web app, "so an iPhone parent who never installs receives no push at all —
// and §5.11 permits no email or SMS fallback, so that parent is reachable only by
// telephone."
import { useEffect, useMemo, useState } from 'react'
import { apiFetch, useDisplayMode, useSession } from '@studio/core'
import { AppShell, InstallWalkthrough, LanguagePicker, SignIn, ThemeProvider } from '@studio/ui'
import { DevBar } from '@studio/ui/dev-bar'
import type { InstallPromptEvent } from '@studio/ui'
import type { Locale } from '@studio/i18n'
import { Resolve } from './features/identity/Resolve'
import { ScheduleSection, isCalendarRoute } from './features/schedule/ScheduleSection'
import { makeParentScheduleClient } from './features/schedule/client'
import { useToday } from './features/schedule/useToday'

const NAV = [
  { key: 'myChildren', labelKey: 'common.nav.myChildren', href: '/' },
  { key: 'calendar', labelKey: 'schedule.calendar.title', href: '#/calendar' },
  { key: 'payments', labelKey: 'common.nav.payments', href: '/payments' },
  { key: 'announcements', labelKey: 'common.nav.announcements', href: '/announcements' },
  { key: 'settings', labelKey: 'common.nav.settings', href: '/settings' },
]

/**
 * Lane SCHEDULE's screens route on `location.hash`, matching the dashboard: real `<a href>`
 * links that survive the back button and open-in-new-tab, with no router dependency
 * (`.claude/rules/ui-rtl-a11y.md` forbids adding one without asking).
 */
function useHash(): string {
  const [hash, setHash] = useState<string>(() => globalThis.location?.hash ?? '')
  useEffect(() => {
    const onChange = () => setHash(globalThis.location?.hash ?? '')
    globalThis.addEventListener('hashchange', onChange)
    return () => globalThis.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

export default function App() {
  const session = useSession()
  const displayMode = useDisplayMode()
  // M0 already drew this line: core's isInstalled() is display-mode !== 'browser', so a
  // fullscreen or minimal-ui home-screen launch counts too. Its own docstring names
  // M1's onboarding gate as the caller.
  const installed = displayMode !== 'browser'
  const [locale, setLocale] = useState<Locale>('he')
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  // Memoised: ChildCalendar reads through this in an effect keyed on the client, so a
  // fresh object every render would re-fetch the month forever.
  const scheduleClient = useMemo(() => makeParentScheduleClient(apiFetch), [])
  const hash = useHash()
  const today = useToday()

  useEffect(() => {
    const onPrompt = (event: Event): void => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    globalThis.addEventListener('beforeinstallprompt', onPrompt)
    return () => globalThis.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

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
        <>
          <LanguagePicker locale={locale} onChoose={setLocale} />
          <SignIn locale={locale} app="parent" />
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
          {/* §6.1's first-run routing still owns the default screen — `Resolve` decides
              between the studio picker, the blocking consents and home. A guardian who has
              navigated to #/calendar is past that, and `access.parent` is re-checked here
              so the hash cannot route around §6.1's refusal arm. */}
          {session.access.parent && isCalendarRoute(hash) ? (
            <ScheduleSection
              locale={locale}
              client={scheduleClient}
              hash={hash}
              today={today}
            />
          ) : (
            <Resolve session={session} locale={locale} />
          )}
        </AppShell>
      ) : null}
    </ThemeProvider>
  )
}
