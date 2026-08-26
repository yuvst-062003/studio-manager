// §6.1's staff first launch, in its stated order:
//
//   1 שפה (BEFORE login) → 2 welcome → 3 resolve → 4 tour → 5 התראות → 6 offline prime
//
// The install gate sits in front of all of it. §6.5: "the install is treated as part of
// onboarding, not an afterthought" — and for the staff app §10.6 makes it load-bearing
// rather than nice, because `pending_ops` must never be reclaimed and only a home-screen
// web app is exempt from Safari's 7-day script-storage cap.
import { useEffect, useMemo, useState } from 'react'
import { apiFetch, useDisplayMode, useSession } from '@studio/core'
import {
  AppShell,
  InstallWalkthrough,
  LanguagePicker,
  SetupWizard,
  SignIn,
  ThemeProvider,
  makeSetupClient,
  registerM1WizardSteps,
} from '@studio/ui'
import { DevBar } from '@studio/ui/dev-bar'
import type { InstallPromptEvent } from '@studio/ui'
import type { Locale } from '@studio/i18n'
import { Resolve } from './features/identity/Resolve'
import { ScheduleSection } from './features/schedule/ScheduleSection'
import { makeStaffScheduleClient } from './features/schedule/client'
import { useToday } from './features/schedule/useToday'
import { StudentsSearch, makeStaffPeopleClient } from './features/people'
import {
  OfflinePrimingGate,
  RosterScreen,
  makeStaffAttendanceClient,
  registerAttendanceSections,
  useOfflinePriming,
} from './features/attendance'
import './features/attendance/attendance.css'

// §5.1 — 'the staff app and dashboard route them into a resumable wizard'. Both mount the
// SAME wizard from @studio/ui; no step lives in one app's feature directory. Registered
// at module load so the slot is populated before anything renders, and `apiFetch` is
// passed in because @studio/ui must not depend on @studio/core.
registerM1WizardSteps(apiFetch)

// §19.4's `📴 offline` and `🐌 slow` toggles, plus the `student-card` attendance strip and
// the `alert-centre` conflict cards. Registered at module load for the same reason the
// wizard steps are: the slots must be populated before anything renders. The containers
// themselves are never reopened — that is what seam 4 buys.
registerAttendanceSections()

const NAV = [
  { key: 'today', labelKey: 'common.nav.today', href: '/' },
  // Both W2 lanes moved their entry from a path to a hash, independently and for the
  // same reason: there is no server route behind the path form, so `/schedule` and
  // `/students` were links to a 404.
  { key: 'schedule', labelKey: 'common.nav.schedule', href: '#/schedule' },
  { key: 'students', labelKey: 'common.nav.students', href: '#/students' },
  // A hash, not a path: there is no server route behind `/attendance`, so the path form was
  // a link to a 404 — the same correction both W2 lanes made independently.
  { key: 'attendance', labelKey: 'common.nav.attendance', href: '#/attendance' },
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
  //
  // The `MODE` disjunct opens the gate on the VITE DEV SERVER only, so this app can be
  // worked on in an ordinary tab — the dev server serves no service worker
  // (`devOptions: { enabled: false }`), so there is nothing to install from and the gate
  // would otherwise be unreachable rather than merely inconvenient.
  //
  // It is not a weakening of §6.5. `import.meta.env.MODE` is replaced by a string literal
  // at build time, so in a real build this folds to `'production' === 'development'` and
  // the branch is eliminated from the bundle: there is no flag to flip and nothing to
  // forget. Under vitest MODE is 'test', which is why this app's own
  // install-walkthrough tests still exercise the real gate.
  //
  // `useDisplayMode()` is deliberately left alone: M8 reports install rates from it, and
  // a measurement that lies to make a dev tab convenient is worse than the gate.
  const installed = displayMode !== 'browser' || import.meta.env.MODE === 'development'
  const [locale, setLocale] = useState<Locale>('he')
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  // Memoised: SetupWizard reads through this in an effect keyed on the client, so a fresh
  // object every render would re-fetch progress forever.
  const setupClient = useMemo(() => makeSetupClient(apiFetch), [])
  const scheduleClient = useMemo(() => makeStaffScheduleClient(apiFetch), [])
  const peopleClient = useMemo(() => makeStaffPeopleClient(apiFetch), [])
  const attendanceClient = useMemo(() => makeStaffAttendanceClient(apiFetch), [])
  // §6.1 step 6 — "offline prime: today's and tomorrow's sessions + rosters are fetched and
  // written to IndexedDB BEFORE the coach reaches Today", and "the first launch BLOCKS on
  // this fetch". The gate below renders instead of the app while it runs.
  const priming = useOfflinePriming(attendanceClient)
  const hash = useHash()
  const today = useToday()
  // 9a's filter defaults from who is looking: a coach opening the app wants their own day,
  // a manager wants the club's. Both facts come off the ACTIVE membership — the same place
  // features/identity/Resolve.tsx reads `owner` from — because `Session` itself is
  // studio-agnostic and a person can hold different roles in different studios.
  const membership = session.studios.find((s) => s.studio_id === session.activeStudioId)
  const viewerIsCoach =
    membership?.roles.some((role) => role === 'lead_coach' || role === 'assistant_coach') ?? false
  // Staff `9h` is one hash away from Today. The card (`9c`) and the mid-lesson trial
  // (`11b`) open from a roster row, which is M5's screen — they are exported from
  // features/people for that lane to mount without reopening this file.
  //
  // Read off `useHash()` rather than `globalThis.location.hash` directly: both W2 lanes
  // put a screen behind a hash in this shell, and a plain read is not reactive — the
  // screen would change only when something else happened to re-render App. One
  // subscription serves both lanes' routes.
  const onStudents = hash === '#/students'
  // §5.7's register, opened from a session. The id is in the hash so the back button works
  // and a link survives a reload — the same shape both W2 lanes settled on, and the reason
  // NAV's `/attendance` entry became a hash below.
  const rosterSessionId = hash.startsWith('#/attendance/') ? hash.slice('#/attendance/'.length) : null

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
          {/* §6.1's first-run routing still owns the DEFAULT screen: `Resolve` decides
              between the setup wizard, the tour and the refusal. Both W2 lanes hang a
              screen off a hash in front of it, and neither claims the fallback — an
              unknown hash still falls through to `Resolve`.

              `access.staff` guards lane SCHEDULE's branch because a hash is typed by
              whoever is holding the phone, so the check cannot live in the link. Lane
              PEOPLE's branch inherits the same protection from being below it: a person
              without staff access takes the `Resolve` arm and gets §6.1's refusal. */}
          {session.access.staff && rosterSessionId ? (
            // §6.1 step 6 — "today's and tomorrow's sessions + rosters are fetched and
            // written to IndexedDB BEFORE the coach reaches Today", and "the first launch
            // blocks on this fetch".
            //
            // The FETCH starts at launch: `useOfflinePriming` runs on mount above, so the
            // cache is filling while the coach walks through the tour and Today. What is
            // gated here is the roster itself — the one screen a missing cache actually
            // costs something on, and the one this lane owns.
            //
            // §6.1's own order puts the prime after the tour, and the tour lives in
            // `features/identity/Resolve.tsx`, which belongs to no lane in this wave.
            // `OfflinePrimingGate` and `useOfflinePriming` are exported from this lane's
            // barrel so whoever owns that sequence can put the gate in front of Today
            // without reopening anything here.
            priming.state !== 'ready' ? (
              <OfflinePrimingGate locale={locale} onRetry={priming.retry} state={priming.state} />
            ) : (
              <RosterScreen
                client={attendanceClient}
                locale={locale}
                personId={membership?.person_id ?? null}
                sessionId={rosterSessionId}
              />
            )
          ) : session.access.staff && hash.startsWith('#/schedule') ? (
            <ScheduleSection
              locale={locale}
              client={scheduleClient}
              hash={hash}
              today={today}
              viewerPersonId={membership?.person_id}
              viewerIsCoach={viewerIsCoach}
            />
          ) : session.access.staff && onStudents ? (
            <StudentsSearch locale={locale} client={peopleClient} />
          ) : (
            <Resolve
              session={session}
              locale={locale}
              wizard={<SetupWizard client={setupClient} locale={locale} />}
            />
          )}
        </AppShell>
      ) : null}
    </ThemeProvider>
  )
}
