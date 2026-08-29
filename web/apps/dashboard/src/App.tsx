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
import { apiFetch, useSession, switchStudio } from '@studio/core'
import {
  AppShell,
  EmptyState,
  Icon,
  LanguagePicker,
  RefusalScreen,
  SetupIncompleteBanner,
  SetupWizard,
  SideNav,
  SignIn,
  ThemeProvider,
  UpdateToast,
  makeSetupClient,
  registerM1WizardSteps,
  useDocumentLocale,
} from '@studio/ui'
import type { SideNavGroup } from '@studio/ui'
import { DevBar } from '@studio/ui/dev-bar'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { ScheduleSection } from './features/schedule/ScheduleSection'
import { makeScheduleClient } from './features/schedule/client'
import { ManagerHome, makeHomeClient } from './features/home'
import './features/home/home.css'
import './features/rollover/rollover.css'
import './features/settings/settings.css'
import './features/schedule/schedule.css'
import './features/belts/belts-wizard.css'
import './features/billing/prices-wizard.css'
import { useToday } from './features/schedule/useToday'
// §5.15's rollover — "the single highest-leverage screen in the product", and the one flow
// a manager runs once a year. Its own route rather than a panel inside `#/schedule`,
// because it is seven steps long and has to survive a closed tab.
import { RolloverWizard, makeRolloverClient } from './features/rollover'
import { StaffScreen } from './features/staff/StaffScreen'
import { SettingsScreen } from './features/settings/SettingsScreen'
import {
  AddStudentScreen,
  AlertCentre,
  SharingCards,
  StudentDetailScreen,
  StudentsScreen,
  makeDashboardPeopleClient,
  registerPeopleAlerts,
} from './features/people'
import {
  EventForm,
  EventPage,
  EventsScreen,
  ExamEligibilityScreen,
  ExamsScreen,
  makeDashboardEventsClient,
} from './features/events'
import {
  BeltSystemScreen,
  makeDashboardBeltsClient,
  registerBeltsWizardStep,
} from './features/belts'
// `3e` תשלומים וגבייה and §5.10's money alert. Nothing imported either: the collections
// screen, the reconciliation queue and `DebtAlert` were built, unit-tested and unreachable,
// which is what made W4's exit gate untestable through a browser.
import { BillingSection } from './features/billing/BillingSection'
// `4c` נוכחות — what was not marked. Nothing imported AttendanceReport, so §5.14's
// "unmarked is a real state and is not absence" had no screen in a running app.
import { AttendanceSection } from './features/attendance/AttendanceSection'
// The design pass (2026-08-27) mounted the four orphans the canvas draws and the app
// never routed: 4f announcements, 4e documents, 5a prices — each built and unit-tested
// in its wave and imported by nothing — plus 4g reports, which never had a screen at
// all, and 5b's missing index for a bare `#/belts`.
import { CommsSection } from './features/comms/CommsSection'
import { registerCommsAlerts } from './features/comms'
import { makeDashboardCommsClient } from './features/comms/dashboardCommsClient'
import { DocumentsSection } from './features/health/DocumentsSection'
import { PricesSection } from './features/billing/PricesSection'
import { ReportsSection } from './features/reports/ReportsSection'
import { BeltsIndex } from './features/belts/BeltsIndex'
import { GlobalSearch } from './GlobalSearch'

import { registerBillingAlertSection } from './features/billing/BillingAlertSection'
// §5.1's step 4. `WIZARD_STEP_ORDER` has reserved `prices` since M1 and nothing had ever
// registered into it — the one step of the six whose slot was empty, so an owner who
// finished `groups` landed on a panel saying השלב הזה עדיין לא זמין.
import { registerPricesWizardStep } from './features/billing/PricesWizardStep'
import { makeDashboardBillingClient, registerBillingDevTools } from './features/billing'

registerM1WizardSteps(apiFetch)
// Seam 4 — `6c` composes sections from four milestones. This lane registers the three it
// owns; M4's, M5's and M6's land the same way without reopening AlertCentre.tsx.
registerPeopleAlerts()
// Seam 4 again — M6's section, at the order `features/people/register.ts` left for it:
// "M6's debt alert belongs above a trial queue", and its own orders start at 20.
registerBillingAlertSection()
// Seam 4 again — §5.1's wizard. One registerSlot call from this lane's own file, at the
// order WIZARD_STEP_ORDER gives `belts`. SetupWizard.tsx is not reopened, and neither is
// packages/ui/src/setup-wizard/register.ts, which registers M1's own four steps.
registerBeltsWizardStep(makeDashboardBeltsClient(apiFetch))
// And M6's, at order 4. The הוראת קבע link sits beside the amount as each plan is created
// (payment-routes §5) and is optional there — a club may not have its uPay links on day
// one, and Settings → Payments is where a missing one is filled in later.
registerPricesWizardStep(makeDashboardBillingClient(apiFetch))
// M8's at-risk card and M6's billing dev tool — both exported since their waves and
// called by nothing, so the at-risk card had never once rendered on the dashboard.
// The S1 slot-wiring guard now fails the build on any register* export no app calls.
registerCommsAlerts(makeDashboardCommsClient(apiFetch))
registerBillingDevTools(makeDashboardBillingClient(apiFetch))

// F10 — the doors a coach's role cannot open stay out of their nav. The API was never
// the hole (/staff is ManagerOrOwner, fees are redacted); the hole was offering doors
// that answer 403.
const MANAGER_ONLY_KEYS = new Set([
  'rollover',
  'alerts',
  'billing',
  'prices',
  'documents',
  'reports',
  'staff',
  'settings',
  'setup',
  'closures',
])

const MANAGER_ONLY_ROUTES = new Set([
  'rollover',
  'alerts',
  'billing',
  'prices',
  'documents',
  'reports',
  'staff',
  'settings',
  'setup',
  'closures',
])

/** §6.1 — 'given a direct link, not a dead end.' A person with no dashboard role often
 *  does have a staff one, and the staff app will refuse them in turn if not. */
const STAFF_APP_URL = '/staff'

const NAV = [
  { key: 'home', labelKey: 'common.dash.home.title', href: '#/home' },
  { key: 'schedule', labelKey: 'schedule.week.title', href: '#/schedule' },
  { key: 'groups', labelKey: 'schedule.groups.title', href: '#/groups' },
  { key: 'closures', labelKey: 'schedule.closure.title', href: '#/closures' },
  { key: 'rollover', labelKey: 'schedule.rollover.nav', href: '#/rollover' },
  { key: 'students', labelKey: 'people.student.plural', href: '#/students' },
  { key: 'alerts', labelKey: 'people.alerts.title', href: '#/alerts' },
  { key: 'billing', labelKey: 'billing.debt.title', href: '#/billing' },
  { key: 'prices', labelKey: 'common.dash.nav.prices', href: '#/prices' },
  { key: 'attendance', labelKey: 'common.nav.attendance', href: '#/attendance' },
  { key: 'comms', labelKey: 'common.nav.announcements', href: '#/comms' },
  { key: 'documents', labelKey: 'common.dash.nav.documents', href: '#/documents' },
  { key: 'reports', labelKey: 'common.dash.nav.reports', href: '#/reports' },
  { key: 'events', labelKey: 'events.title', href: '#/events' },
  { key: 'belts', labelKey: 'events.belt.title', href: '#/belts' },
  { key: 'exams', labelKey: 'events.exam.plural', href: '#/exams' },
  { key: 'staff', labelKey: 'common.dash.nav.staff', href: '#/staff' },
  { key: 'settings', labelKey: 'common.dash.nav.settings', href: '#/settings' },
  { key: 'setup', labelKey: 'common.dash.nav.setup', href: '#/setup' },
]

export type DashboardRoute =
  | 'events'
  | 'belts'
  | 'exams'
  | 'staff'
  | 'settings'
  | 'setup'
  | 'schedule'
  | 'students'
  | 'alerts'
  | 'billing'
  | 'attendance'
  | 'rollover'
  | 'comms'
  | 'documents'
  | 'prices'
  | 'reports'
  | 'home'

/** Unknown hashes — and the empty one — resolve to the weekly board: 3a/1e make the
 *  board the manager's home, and "בחרו מסך מהתפריט" was a landing page that landed
 *  nowhere (design pass 2026-08-27). */
export function routeFromHash(hash: string): DashboardRoute {
  const name = hash.replace(/^#\/?/, '')
  // Each vertical collapses its own family of hashes to ONE route here and decides
  // between them in its own feature folder — lane SCHEDULE's three top-level hashes plus
  // `#/groups/<id>` in features/schedule/ScheduleSection.tsx, lane PEOPLE's `#/students`,
  // `#/students/<id>`, `#/students/new` and `#/alerts` in features/people. That is what
  // keeps this shared file to one NAV group and one branch per vertical rather than one
  // per screen, which is what let both W2 lanes edit it without colliding on every screen.
  // The manager home (docs/design/proposals/manager-home.md). Mounted at its OWN hash and
  // not at `#/`, deliberately: the 2026-08-27 pass made the board the landing screen
  // because the previous home "landed nowhere", and that reasoning is still sound until
  // this screen has been looked at on real data. Flipping the fallback is a one-line
  // change here and an open question in the proposal, not something to do silently.
  if (name === 'home') return 'home'
  if (name === 'schedule' || name === 'closures' || name.startsWith('groups')) return 'schedule'
  // §5.15's rollover. One hash and one screen: the wizard's own seven steps are its
  // internal state, not routes — a manager who bookmarked step 5 would land on a step the
  // server may since have answered, and `resume_at` is the only correct answer to "where
  // was I".
  if (name === 'rollover') return 'rollover'
  if (name.startsWith('students')) return 'students'
  if (name === 'alerts') return 'alerts'
  // M6's family: `#/billing` is `3e`'s collections board and
  // `#/billing/reconciliation` is §5.10's unmatched-payment queue.
  if (name.startsWith('billing')) return 'billing'
  // M5's `4c`. `#/attendance` is the chase list; the register itself is the staff
  // app's screen, on its own origin.
  if (name === 'attendance') return 'attendance'
  // Lane EVENTS' family: `#/events`, `#/events/<id>` and `#/events/new`, decided in
  // features/events/. Same shape as lane SCHEDULE's three hashes above.
  if (name.startsWith('events')) return 'events'
  // §5.9's ladder. `#/belts` today; `#/belts/<classId>` once a studio has two classes.
  if (name.startsWith('belts')) return 'belts'
  // §5.9's exams: `#/exams` is 6b's roundup, `#/exams/<id>` is 4d's eligibility table.
  if (name.startsWith('exams')) return 'exams'
  // The design pass's four mounts: 4f, 4e, 5a, 4g.
  if (name === 'comms') return 'comms'
  if (name === 'documents') return 'documents'
  if (name === 'prices') return 'prices'
  if (name === 'reports') return 'reports'
  if (name === 'staff' || name === 'settings' || name === 'setup') return name
  return 'schedule'
}

/** `#/events/<id>` → 7c; `#/events/new` → 7b; bare `#/events` → 7a's roundup. */
export function eventRouteFrom(hash: string): string {
  return hash.replace(/^#\/?events\/?/, '')
}

/** `#/students/<id>` → the card; `#/students/new` → 3c; bare `#/students` → the table. */
export function studentRouteFrom(hash: string): string {
  return hash.replace(/^#\/?students\/?/, '')
}

/** The two numbers DashNav badges: households in debt (red) and unsigned declarations
 *  (amber). Both are manager reads; a coach's sidebar carries neither group. */
function useSideNavBadges(enabled: boolean): { debtHouseholds: number; missingDocuments: number } {
  const [counts, setCounts] = useState({ debtHouseholds: 0, missingDocuments: 0 })
  useEffect(() => {
    if (!enabled) return
    let alive = true
    void (async () => {
      const [charges, documents] = await Promise.all([
        apiFetch('/api/v1/charges?status=open&limit=200')
          .then((r) => (r.ok ? (r.json() as Promise<{ items: { payer_person_id: string }[] }>) : { items: [] }))
          .catch(() => ({ items: [] as { payer_person_id: string }[] })),
        apiFetch('/api/v1/health-declarations/summary')
          .then((r) => (r.ok ? (r.json() as Promise<{ health_status: string }[]>) : []))
          .catch(() => [] as { health_status: string }[]),
      ])
      if (!alive) return
      setCounts({
        debtHouseholds: new Set(charges.items.map((c) => c.payer_person_id)).size,
        missingDocuments: documents.filter((row) => row.health_status !== 'signed').length,
      })
    })()
    return () => {
      alive = false
    }
  }, [enabled])
  return counts
}

/** DashNav's three groups, from the canvas's own order. `hash` breaks the one tie the
 *  route enum cannot: `#/groups` collapses into the schedule vertical. */
function sideNavGroups(
  route: DashboardRoute,
  hash: string,
  locale: Locale,
  canSeeMoney: boolean,
  badges: { debtHouseholds: number; missingDocuments: number },
): SideNavGroup[] {
  const onGroups = hash.startsWith('#/groups')
  const groups: SideNavGroup[] = [
    {
      key: 'daily',
      label: t(locale, 'common.dash.nav.daily'),
      items: [
        {
          // The rendered sidebar is built HERE, not from the NAV array above — which is
          // why adding the home screen to that array left it unreachable, exactly the
          // defect the canvas audit found twelve times and this screen was meant to avoid.
          key: 'home',
          label: t(locale, 'common.dash.home.title'),
          href: '#/home',
          icon: <Icon name="home" />,
          active: route === 'home',
        },
        {
          key: 'schedule',
          label: t(locale, 'common.dash.nav.weekly'),
          href: '#/schedule',
          icon: <Icon name="calendar" />,
          active: route === 'schedule' && !onGroups,
        },
        {
          key: 'attendance',
          label: t(locale, 'common.nav.attendance'),
          href: '#/attendance',
          icon: <Icon name="attendance" />,
          active: route === 'attendance',
        },
        {
          key: 'comms',
          label: t(locale, 'common.nav.announcements'),
          href: '#/comms',
          icon: <Icon name="messages" />,
          active: route === 'comms',
        },
      ],
    },
    {
      key: 'club',
      label: t(locale, 'common.dash.nav.club'),
      items: [
        {
          key: 'students',
          label: t(locale, 'people.student.plural'),
          href: '#/students',
          icon: <Icon name="students" />,
          active: route === 'students',
        },
        {
          key: 'groups',
          label: t(locale, 'common.dash.nav.groups'),
          href: '#/groups',
          icon: <Icon name="groups" />,
          active: onGroups,
        },
        {
          key: 'events',
          label: t(locale, 'events.title'),
          href: '#/events',
          icon: <Icon name="events" />,
          active: route === 'events',
        },
        {
          key: 'belts',
          label: t(locale, 'common.dash.nav.beltsExams'),
          href: '#/belts',
          icon: <Icon name="belts" />,
          active: route === 'belts' || route === 'exams',
        },
      ],
    },
  ]
  if (canSeeMoney) {
    groups[1]!.items.push(
      {
        key: 'staff',
        label: t(locale, 'common.dash.nav.staff'),
        href: '#/staff',
        icon: <Icon name="profile" />,
        active: route === 'staff',
      },
      {
        key: 'rollover',
        label: t(locale, 'common.dash.nav.rollover'),
        href: '#/rollover',
        icon: <Icon name="sync" />,
        active: route === 'rollover',
      },
    )
  }
  if (canSeeMoney) {
    groups.push({
      key: 'money',
      label: t(locale, 'common.dash.nav.money'),
      items: [
        {
          key: 'billing',
          label: t(locale, 'billing.debt.title'),
          href: '#/billing',
          icon: <Icon name="payments" />,
          active: route === 'billing',
          badge:
            badges.debtHouseholds > 0
              ? { text: String(badges.debtHouseholds), tone: 'red' }
              : undefined,
        },
        {
          key: 'prices',
          label: t(locale, 'common.dash.nav.prices'),
          href: '#/prices',
          icon: <Icon name="belts" />,
          active: route === 'prices',
        },
        {
          key: 'documents',
          label: t(locale, 'common.dash.nav.documents'),
          href: '#/documents',
          icon: <Icon name="documents" />,
          active: route === 'documents',
          badge:
            badges.missingDocuments > 0
              ? { text: String(badges.missingDocuments), tone: 'amber' }
              : undefined,
        },
        {
          key: 'reports',
          label: t(locale, 'common.dash.nav.reports'),
          href: '#/reports',
          icon: <Icon name="reports" />,
          active: route === 'reports',
        },
      ],
    })
  }
  return groups
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
  const examRoute = hash.replace(/^#\/?exams\/?/, '')
  const [locale, setLocale] = useState<Locale>('he')
  // index.html ships `lang="he" dir="rtl"` as literals; without this the manager who
  // picks English or Russian reads LTR copy laid out RTL (found on the sign-in screen's
  // design pass, 2026-08-27 — parent and staff already do this).
  useDocumentLocale(locale)
  // §3.2's hard rule, on the screen's side — and ONLY on the screen's side. The API has
  // already redacted `fee_agorot` to null for a coach, so this cannot leak a price even if
  // it were wrong. What it decides is narrower: whether an ABSENT fee may be rendered as
  // "free". A redacted price and a genuinely free event are indistinguishable on the wire,
  // and calling the first one free is worse than saying nothing.
  //
  // Read off the ACTIVE studio's membership: §19.4's persona switcher moves the active
  // studio without a reload, and a role taken from the first membership in the list would
  // then be somebody else's.
  const membership = session.studios.find(
    (row) => row.studio_id === session.activeStudioId,
  )
  const canSeeMoney =
    membership?.roles.some((role) => role === 'owner' || role === 'manager') ?? false
  /**
   * A person with a record in the club and NO role at all.
   *
   * Found on staging: `SignedIn` passed and `AnyStaff` did not, so `/sessions` answered
   * 200 while classes, groups, students, events, announcements, charges, reports and
   * health-declarations all answered 403 — and the dashboard rendered its whole shell over
   * the top, every panel showing a generic error. The staff and parent apps have refused
   * this case since §6.1; the dashboard had no equivalent.
   *
   * F10 closed the neighbouring hole — "the doors a coach's role cannot open stay out of
   * their nav ... the hole was offering doors that answer 403" — for a coach. This is the
   * same hole one step further along: someone with no role was still offered every door.
   *
   * Keyed on "no role at all", never on "not an owner": a lead coach has a genuine,
   * narrower dashboard and must keep it.
   */
  const hasNoRole = membership !== undefined && membership.roles.length === 0
  // Memoised: SetupWizard reads through this in an effect keyed on the client, so a fresh
  // object every render would re-fetch progress forever.
  const setupClient = useMemo(() => makeSetupClient(apiFetch), [])
  const scheduleClient = useMemo(() => makeScheduleClient(apiFetch), [])
  const homeClient = useMemo(() => makeHomeClient(apiFetch), [])
  const peopleClient = useMemo(() => makeDashboardPeopleClient(apiFetch), [])
  const eventsClient = useMemo(() => makeDashboardEventsClient(apiFetch), [])
  const beltsClient = useMemo(() => makeDashboardBeltsClient(apiFetch), [])
  // Memoised for the same reason `setupClient` is: RolloverWizard reads through this in an
  // effect keyed on the client, so a fresh object every render would re-fetch for ever.
  const rolloverClient = useMemo(() => makeRolloverClient(apiFetch), [])
  // Stable for as long as the studio's day is. `new Date().toISOString()` in this
  // render body was a new value every render, and downstream that is an effect
  // dependency worth `1 + 3N` requests.
  const today = useToday()
  const badges = useSideNavBadges(session.status === 'signed-in' && canSeeMoney)

  // §6.5 deliberately does NOT gate the dashboard on standalone mode the way the two
  // phone apps are gated. It is the desktop surface: a manager opens it in a browser tab
  // beside their accounting software, and blocking that would be an install requirement
  // invented for a screen the install exists to serve.

  return (
    <ThemeProvider>
      {/* New-build toast — floats over whatever is open, in every session state. */}
      <UpdateToast locale={locale} />
      {session.status === 'anonymous' ? (
        // app="dashboard", not "staff": the OAuth callback routes the browser back to
        // the app named here, and this screen's app is this one (design pass — the
        // wrong name sent a signed-in manager to the staff origin).
        <SignIn
          locale={locale}
          app="dashboard"
          languagePicker={<LanguagePicker locale={locale} onChoose={setLocale} />}
        />
      ) : null}

      {/* Refused BEFORE the shell, not inside it: the point is that none of the doors are
          offered, and a refusal rendered inside AppShell would still draw the nav. */}
      {session.status === 'signed-in' && hasNoRole ? (
        // No wrapper: `RefusalScreen` already carries `data-testid="dashboard-refusal"`,
        // and a second one made the query ambiguous.
        <RefusalScreen
          locale={locale}
          onSignOut={() => void session.signOut()}
          otherAppUrl={STAFF_APP_URL}
          which="dashboard"
        />
      ) : null}

      {session.status === 'signed-in' && !hasNoRole ? (
        <AppShell
          title={session.activeStudioName ?? ''}
          items={canSeeMoney ? NAV : NAV.filter((entry) => !MANAGER_ONLY_KEYS.has(entry.key))}
          locale={locale}
          // F9 — one search, every screen, keyboard-reachable ('/'). Manager-only, like the
          // route behind it. In the CHROME rather than in the page: as a child of the shell
          // it rendered inside <main> and moved with each screen's layout.
          headerEnd={canSeeMoney ? <GlobalSearch locale={locale} /> : null}
          sideNav={
            <SideNav
              label={t(locale, 'common.nav.menu')}
              studioName={session.activeStudioName ?? ''}
              studioNote={t(locale, 'common.appName.dashboard')}
              groups={sideNavGroups(route, hash, locale, canSeeMoney, badges)}
              settingsItem={
                canSeeMoney
                  ? {
                      key: 'settings',
                      label: t(locale, 'common.dash.nav.settings'),
                      href: '#/settings',
                      icon: <Icon name="settings" />,
                      active: route === 'settings',
                    }
                  : undefined
              }
              footer={
                // The canvas's user footer, real since /auth/me carries display_name
                // (feature pass 2026-08-27). No note line: the only candidate is the
                // acting-as header, which is a person UUID — the dev bar already names
                // the persona in words.
                session.displayName ? { name: session.displayName } : undefined
              }
            />
          }
          studios={session.studios.map((s) => ({
            studioId: s.studio_id,
            studioName: s.studio_name,
            studioIsDemo: s.studio_is_demo,
          }))}
          activeStudioId={session.activeStudioId}
          onSwitchStudio={(studioId) => void switchStudio(studioId)}
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
          {/* F10 — a typed hash for a forbidden route refuses gracefully instead of
              rendering a broken screen: the doors match the nav. */}
          {!canSeeMoney && MANAGER_ONLY_ROUTES.has(route) ? (
            <EmptyState title={t(locale, 'common.dash.forbidden')} />
          ) : null}
          {route === 'home' ? (
            <ManagerHome
              client={homeClient}
              locale={locale}
              studioId={session.activeStudioId ?? ''}
              studioName={session.activeStudioName ?? undefined}
              today={today}
            />
          ) : null}
          {route === 'schedule' ? (
            <ScheduleSection
              locale={locale}
              client={scheduleClient}
              hash={hash}
              today={today}
              // §3.2 — 'coaches never see money'. The plan badge on a roster row is read
              // from a manager-only route, so the permission travels with the request to
              // draw it rather than the roster deciding for itself.
              canSeeMoney={canSeeMoney}
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
            <>
              {/* §5.4b + §5.4a — the two links a club shares, where people are managed. */}
              {canSeeMoney ? <SharingCards locale={locale} /> : null}
              <StudentsScreen
                locale={locale}
                client={peopleClient}
                onOpen={(id) => {
                  globalThis.location.hash = `#/students/${id}`
                }}
              />
            </>
          ) : null}
          {route === 'alerts' ? (
            <AlertCentre locale={locale} client={peopleClient} />
          ) : null}
          {route === 'attendance' ? <AttendanceSection locale={locale} /> : null}
          {route === 'rollover' ? (
            <RolloverWizard locale={locale} client={rolloverClient} today={today} />
          ) : null}
          {route === 'billing' ? (
            <BillingSection
              locale={locale}
              view={hash.includes('reconciliation') ? 'reconciliation' : 'collections'}
            />
          ) : null}
          {route === 'exams' && !examRoute ? (
            <ExamsScreen
              client={eventsClient}
              locale={locale}
              now={today}
              onOpen={(id) => {
                globalThis.location.hash = `#/exams/${id}`
              }}
            />
          ) : null}
          {route === 'exams' && examRoute ? (
            <ExamEligibilityScreen client={eventsClient} eventId={examRoute} locale={locale} />
          ) : null}
          {route === 'belts' && beltsClassId ? (
            <BeltSystemScreen classId={beltsClassId} client={beltsClient} locale={locale} />
          ) : route === 'belts' ? (
            // 5b's missing first step: the ladder lives on a class, so the bare hash is
            // the class chooser rather than the blank page it used to be.
            <BeltsIndex locale={locale} />
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
          {/* The unfinished-setup nudge (2026-08-28): visible on every manager screen
              EXCEPT the wizard itself, keyed on the route so finishing a step and
              navigating away re-asks. */}
          {canSeeMoney && route !== 'setup' ? (
            <SetupIncompleteBanner
              key={route}
              client={setupClient}
              locale={locale}
              onOpen={() => {
                globalThis.location.hash = '#/setup'
              }}
            />
          ) : null}
          {route === 'setup' ? <SetupWizard client={setupClient} locale={locale} /> : null}
          {/* The design pass's four mounts — 4f, 4e, 5a, 4g. There is no `home` branch
              any more: the empty "בחרו מסך מהתפריט" page is gone, and the weekly board
              answers the bare hash the way 3a/1e always drew it. */}
          {route === 'comms' ? (
            <CommsSection locale={locale} canPublishStudioWide={canSeeMoney} />
          ) : null}
          {route === 'documents' ? <DocumentsSection locale={locale} /> : null}
          {route === 'prices' ? <PricesSection locale={locale} /> : null}
          {route === 'reports' && session.activeStudioId ? (
            <ReportsSection
              locale={locale}
              studioId={session.activeStudioId}
              selfPersonId={
                session.studios.find((s) => s.studio_id === session.activeStudioId)?.person_id ??
                null
              }
            />
          ) : null}
        </AppShell>
      ) : null}
    </ThemeProvider>
  )
}
