// §6.4's manager dashboard. Desktop-first, but every screen here also renders narrow:
// §6.4 says "everything the staff app has, plus what needs a big screen", and a manager
// checking cover from a phone is a normal case rather than an error.
//
// §5.1 — 'the staff app AND dashboard route them into a resumable wizard'. Both mount the
// same SetupWizard from @studio/ui; no step lives in one app's feature directory.
//
// Routing is `location.hash` and not a router. The drawer's items are real <a href> links
// (@studio/ui owns that), so a hash route makes them work as links — back button, opening
// in a new tab, the lot — without adding a dependency, which
// .claude/rules/ui-rtl-a11y.md says not to do without asking.
import { useEffect, useMemo, useState } from 'react'
import { apiFetch, useSession } from '@studio/core'
import {
  AppShell,
  LanguagePicker,
  SetupWizard,
  SignIn,
  ThemeProvider,
  makeSetupClient,
  registerM1WizardSteps,
} from '@studio/ui'
import { DevBar } from '@studio/ui/dev-bar'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { StaffScreen } from './features/staff/StaffScreen'
import { SettingsScreen } from './features/settings/SettingsScreen'

registerM1WizardSteps(apiFetch)

const NAV = [
  { key: 'staff', labelKey: 'common.dash.nav.staff', href: '#/staff' },
  { key: 'settings', labelKey: 'common.dash.nav.settings', href: '#/settings' },
  { key: 'setup', labelKey: 'common.dash.nav.setup', href: '#/setup' },
]

export type DashboardRoute = 'home' | 'staff' | 'settings' | 'setup'

/** Unknown hashes resolve to home rather than to a blank page. */
export function routeFromHash(hash: string): DashboardRoute {
  const name = hash.replace(/^#\/?/, '')
  return name === 'staff' || name === 'settings' || name === 'setup' ? name : 'home'
}

function useHashRoute(): DashboardRoute {
  const [route, setRoute] = useState<DashboardRoute>(() =>
    routeFromHash(globalThis.location?.hash ?? ''),
  )
  useEffect(() => {
    const onChange = () => setRoute(routeFromHash(globalThis.location?.hash ?? ''))
    globalThis.addEventListener('hashchange', onChange)
    return () => globalThis.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export default function App() {
  const session = useSession()
  const route = useHashRoute()
  const [locale, setLocale] = useState<Locale>('he')
  // Memoised: SetupWizard reads through this in an effect keyed on the client, so a fresh
  // object every render would re-fetch progress forever.
  const setupClient = useMemo(() => makeSetupClient(apiFetch), [])

  // §6.5 deliberately does NOT gate the dashboard on standalone mode the way the two
  // phone apps are gated. It is the desktop surface: a manager opens it in a browser tab
  // beside their accounting software, and blocking that would be an install requirement
  // invented for a screen the install exists to serve.

  return (
    <ThemeProvider>
      {session.status === 'anonymous' ? (
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
          {route === 'staff' ? <StaffScreen locale={locale} /> : null}
          {route === 'settings' ? <SettingsScreen locale={locale} /> : null}
          {route === 'setup' ? <SetupWizard client={setupClient} locale={locale} /> : null}
          {route === 'home' ? (
            <section aria-labelledby="dash-home-title">
              <h2 id="dash-home-title">{t(locale, 'common.dash.home.title')}</h2>
              <p>{t(locale, 'common.dash.home.body')}</p>
            </section>
          ) : null}
        </AppShell>
      ) : null}
    </ThemeProvider>
  )
}
