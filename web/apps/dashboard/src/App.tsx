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
import { ScheduleSection } from './features/schedule/ScheduleSection'
import { makeScheduleClient } from './features/schedule/client'
import { useToday } from './features/schedule/useToday'
import { StaffScreen } from './features/staff/StaffScreen'
import { SettingsScreen } from './features/settings/SettingsScreen'
import {
  AddStudentScreen,
  AlertCentre,
  StudentDetailScreen,
  StudentsScreen,
  makeDashboardPeopleClient,
  registerPeopleAlerts,
} from './features/people'
import {
  EventForm,
  EventPage,
  EventsScreen,
  makeDashboardEventsClient,
} from './features/events'
import {
  BeltSystemScreen,
  makeDashboardBeltsClient,
  registerBeltsWizardStep,
} from './features/belts'

registerM1WizardSteps(apiFetch)
// Seam 4 — `6c` composes sections from four milestones. This lane registers the three it
// owns; M4's, M5's and M6's land the same way without reopening AlertCentre.tsx.
registerPeopleAlerts()
// Seam 4 again — §5.1's wizard. One registerSlot call from this lane's own file, at the
// order WIZARD_STEP_ORDER gives `belts`. SetupWizard.tsx is not reopened, and neither is
// packages/ui/src/setup-wizard/register.ts, which registers M1's own four steps.
registerBeltsWizardStep(makeDashboardBeltsClient(apiFetch))

const NAV = [
  { key: 'schedule', labelKey: 'schedule.week.title', href: '#/schedule' },
  { key: 'groups', labelKey: 'schedule.groups.title', href: '#/groups' },
  { key: 'closures', labelKey: 'schedule.closure.title', href: '#/closures' },
  { key: 'students', labelKey: 'people.student.plural', href: '#/students' },
  { key: 'alerts', labelKey: 'people.alerts.title', href: '#/alerts' },
  { key: 'events', labelKey: 'events.title', href: '#/events' },
  { key: 'belts', labelKey: 'events.belt.title', href: '#/belts' },
  { key: 'staff', labelKey: 'common.dash.nav.staff', href: '#/staff' },
  { key: 'settings', labelKey: 'common.dash.nav.settings', href: '#/settings' },
  { key: 'setup', labelKey: 'common.dash.nav.setup', href: '#/setup' },
]

export type DashboardRoute =
  | 'home'
  | 'events'
  | 'belts'
  | 'staff'
  | 'settings'
  | 'setup'
  | 'schedule'
  | 'students'
  | 'alerts'

/** Unknown hashes resolve to home rather than to a blank page. */
export function routeFromHash(hash: string): DashboardRoute {
  const name = hash.replace(/^#\/?/, '')
  // Each vertical collapses its own family of hashes to ONE route here and decides
  // between them in its own feature folder — lane SCHEDULE's three top-level hashes plus
  // `#/groups/<id>` in features/schedule/ScheduleSection.tsx, lane PEOPLE's `#/students`,
  // `#/students/<id>`, `#/students/new` and `#/alerts` in features/people. That is what
  // keeps this shared file to one NAV group and one branch per vertical rather than one
  // per screen, which is what let both W2 lanes edit it without colliding on every screen.
  if (name === 'schedule' || name === 'closures' || name.startsWith('groups')) return 'schedule'
  if (name.startsWith('students')) return 'students'
  if (name === 'alerts') return 'alerts'
  // Lane EVENTS' family: `#/events`, `#/events/<id>` and `#/events/new`, decided in
  // features/events/. Same shape as lane SCHEDULE's three hashes above.
  if (name.startsWith('events')) return 'events'
  // §5.9's ladder. `#/belts` today; `#/belts/<classId>` once a studio has two classes.
  if (name.startsWith('belts')) return 'belts'
  return name === 'staff' || name === 'settings' || name === 'setup' ? name : 'home'
}

/** `#/events/<id>` → 7c; `#/events/new` → 7b; bare `#/events` → 7a's roundup. */
export function eventRouteFrom(hash: string): string {
  return hash.replace(/^#\/?events\/?/, '')
}

/** `#/students/<id>` → the card; `#/students/new` → 3c; bare `#/students` → the table. */
export function studentRouteFrom(hash: string): string {
  return hash.replace(/^#\/?students\/?/, '')
}

function useHashRoute(): { route: DashboardRoute; hash: string } {
  const [hash, setHash] = useState<string>(() => globalThis.location?.hash ?? '')
  useEffect(() => {
    const onChange = () => setHash(globalThis.location?.hash ?? '')
    globalThis.addEventListener('hashchange', onChange)
    return () => globalThis.removeEventListener('hashchange', onChange)
  }, [])
  // The raw hash travels with the route, because both verticals need something the route
  // enum deliberately does not carry: `#/groups/<id>` for the schedule section, and
  // `#/students/<id>` for the student card.
  return { route: routeFromHash(hash), hash }
}

export default function App() {
  const session = useSession()
  const { route, hash } = useHashRoute()
  const studentRoute = studentRouteFrom(hash)
  const eventRoute = eventRouteFrom(hash)
  const beltsClassId = hash.replace(/^#\/?belts\/?/, '')
  const [locale, setLocale] = useState<Locale>('he')
  // §3.2's hard rule, on the screen's side — and ONLY on the screen's side. The API has
  // already redacted `fee_agorot` to null for a coach, so this cannot leak a price even if
  // it were wrong. What it decides is narrower: whether an ABSENT fee may be rendered as
  // "free". A redacted price and a genuinely free event are indistinguishable on the wire,
  // and calling the first one free is worse than saying nothing.
  //
  // Read off the ACTIVE studio's membership: §19.4's persona switcher moves the active
  // studio without a reload, and a role taken from the first membership in the list would
  // then be somebody else's.
  const canSeeMoney =
    session.studios
      .find((membership) => membership.studio_id === session.activeStudioId)
      ?.roles.some((role) => role === 'owner' || role === 'manager') ?? false
  // Memoised: SetupWizard reads through this in an effect keyed on the client, so a fresh
  // object every render would re-fetch progress forever.
  const setupClient = useMemo(() => makeSetupClient(apiFetch), [])
  const scheduleClient = useMemo(() => makeScheduleClient(apiFetch), [])
  const peopleClient = useMemo(() => makeDashboardPeopleClient(apiFetch), [])
  const eventsClient = useMemo(() => makeDashboardEventsClient(apiFetch), [])
  const beltsClient = useMemo(() => makeDashboardBeltsClient(apiFetch), [])
  // Stable for as long as the studio's day is. `new Date().toISOString()` in this
  // render body was a new value every render, and downstream that is an effect
  // dependency worth `1 + 3N` requests.
  const today = useToday()

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
          {route === 'schedule' ? (
            <ScheduleSection
              locale={locale}
              client={scheduleClient}
              hash={hash}
              today={today}
            />
          ) : null}
          {route === 'students' && studentRoute === 'new' ? (
            <AddStudentScreen locale={locale} client={peopleClient} />
          ) : null}
          {route === 'students' && studentRoute && studentRoute !== 'new' ? (
            <StudentDetailScreen
              studentId={studentRoute}
              locale={locale}
              client={peopleClient}
            />
          ) : null}
          {route === 'students' && !studentRoute ? (
            <StudentsScreen
              locale={locale}
              client={peopleClient}
              onOpen={(id) => {
                globalThis.location.hash = `#/students/${id}`
              }}
            />
          ) : null}
          {route === 'alerts' ? (
            <AlertCentre locale={locale} client={peopleClient} />
          ) : null}
          {route === 'belts' && beltsClassId ? (
            <BeltSystemScreen classId={beltsClassId} client={beltsClient} locale={locale} />
          ) : null}
          {route === 'events' && eventRoute && eventRoute !== 'new' ? (
            <EventPage
              client={eventsClient}
              eventId={eventRoute}
              locale={locale}
              seesMoney={canSeeMoney}
            />
          ) : null}
          {route === 'events' && eventRoute === 'new' ? (
            <EventForm
              client={eventsClient}
              locale={locale}
              onSaved={(id) => {
                globalThis.location.hash = `#/events/${id}`
              }}
              targets={[]}
            />
          ) : null}
          {route === 'events' && !eventRoute ? (
            <EventsScreen
              client={eventsClient}
              locale={locale}
              now={today}
              onCreate={() => {
                globalThis.location.hash = '#/events/new'
              }}
              onOpen={(id) => {
                globalThis.location.hash = `#/events/${id}`
              }}
              seesMoney={canSeeMoney}
            />
          ) : null}
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
