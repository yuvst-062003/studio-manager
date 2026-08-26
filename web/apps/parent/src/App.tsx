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
import {
  AccountDrawerFooter,
  AppShell,
  InstallWalkthrough,
  LanguagePicker,
  SignIn,
  ThemeProvider,
  useDocumentLocale,
} from '@studio/ui'
import { DevBar } from '@studio/ui/dev-bar'
import type { InstallPromptEvent } from '@studio/ui'
import type { Locale } from '@studio/i18n'
import { Resolve } from './features/identity/Resolve'
import { ScheduleSection, isCalendarRoute } from './features/schedule/ScheduleSection'
import { makeParentScheduleClient } from './features/schedule/client'
import { useToday } from './features/schedule/useToday'
import { PublicLanding, makeLandingClient, matchLandingPath } from './features/landing'
import {
  EventInviteScreen,
  ParentEventsScreen,
  makeParentEventsClient,
} from './features/events'
import { BeltProgressScreen, makeParentBeltsClient } from './features/belts'
import { InboxScreen, makeParentCommsClient } from './features/comms'
import { AddSibling, makePeopleClient } from './features/people'
// §5.10's payments tab. Mounted here because nothing imported it: `PaymentsScreen` is
// artboard `12f`, the subject of E2E-3 and E2E-4, and it was unreachable in a running app.
import { PaymentsSection } from './features/billing/PaymentsSection'

const NAV = [
  { key: 'myChildren', labelKey: 'common.nav.myChildren', href: '/' },
  { key: 'calendar', labelKey: 'schedule.calendar.title', href: '#/calendar' },
  // A hash, not a path. `/payments` matched nothing: `matchLandingPath` accepts only
  // `/t/<slug>` (features/landing/route.ts, and route.test.ts:21 asserts
  // `matchLandingPath('/payments')` is null), so the link fell through `navigateFallback`
  // to index.html and put the parent back on home. The same correction both W2 lanes made
  // for their own entries.
  { key: 'payments', labelKey: 'common.nav.payments', href: '#/payments' },
  // A hash, and mounted below. `/announcements` matched nothing — `matchLandingPath`
  // accepts only `/t/<slug>` — so the link fell through `navigateFallback` to index.html
  // and put the parent back on home. `InboxScreen` (§5.11's one-way inbox, artboard `2b`)
  // existed and was tested but was never imported by anything, so the whole screen was
  // unreachable in a running app. Same defect and same correction as `/payments`.
  { key: 'announcements', labelKey: 'common.nav.announcements', href: '#/announcements' },
  { key: 'addChild', labelKey: 'people.sibling.title', href: '#/add-child' },
  // NO settings entry. `/settings` matched no route in either app, so the link fell
  // through the service worker's navigateFallback to index.html and put the user back
  // on home in silence. Artboard 2e draws these controls in the DRAWER, not on a
  // page, and that is where they now are — see `AccountDrawerFooter`, passed as
  // `drawerFooter` below, under the studio switcher `AppShell` already renders.
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
  // `<html lang>` and `<html dir>` follow the choice. index.html ships `lang="he" dir="rtl"`
  // as a literal, so without this a parent who picks English or Russian reads LTR copy inside
  // an RTL document and hears it announced with a Hebrew voice.
  useDocumentLocale(locale)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  // Both memoised for the same reason: each screen reads through its client in an effect
  // keyed on the client, so a fresh object every render would re-fetch forever — the
  // month for 12b, the club for 13a.
  const scheduleClient = useMemo(() => makeParentScheduleClient(apiFetch), [])
  const landingClient = useMemo(() => makeLandingClient(apiFetch), [])
  const peopleClient = useMemo(() => makePeopleClient(apiFetch), [])
  const eventsClient = useMemo(() => makeParentEventsClient(apiFetch), [])
  const beltsClient = useMemo(() => makeParentBeltsClient(apiFetch), [])
  const commsClient = useMemo(() => makeParentCommsClient(apiFetch), [])
  const hash = useHash()
  const today = useToday()
  // §5.4(c)'s add-a-sibling is one hash away from home. Hash and not a path: it is an
  // in-app screen, unlike the landing page, which has to be shareable.
  //
  // Read off `useHash()` rather than `globalThis.location.hash` directly: both W2 lanes
  // put a screen behind a hash in this shell, and a plain read is not reactive — the
  // screen would change only when something else happened to re-render App. One
  // subscription serves both lanes' routes.
  const addingChild = hash === '#/add-child'
  // §5.10's payments tab, and `12f`'s history one hash below it.
  const onPayments = hash === '#/payments'
  // 12h's list, and 7d's invite behind `#/events/<eventId>/<studentId>`. Both ids are in
  // the hash because 12h is per CHILD per event: a family with two children on one
  // competition has two answers to give, and an event id alone cannot say which.
  const onEvents = hash === '#/events'
  // §5.11's one-way inbox — artboard `2b`, and D9.1's reason it has no second half.
  const onAnnouncements = hash === '#/announcements'
  const invite = hash.startsWith('#/events/') ? hash.slice('#/events/'.length).split('/') : []
  // 12d, per child per class: a ladder belongs to a class (§5.9), so a child who trains
  // in two disciplines has two progressions to look at.
  const belts = hash.startsWith('#/belts/') ? hash.slice('#/belts/'.length).split('/') : []

  useEffect(() => {
    const onPrompt = (event: Event): void => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    globalThis.addEventListener('beforeinstallprompt', onPrompt)
    return () => globalThis.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  // §5.4a ① — the shop window is a marketing asset on the open internet, so it renders
  // AHEAD of every gate. A stranger tapping an Instagram link must see the club, not an
  // install walkthrough for an app they have no reason to want yet; §6.5's install prompt
  // belongs on `13b`, after they have booked, which is the moment they are most willing.
  //
  // A real path and not a hash: the URL goes in a bio and on a printed QR, and Vite's PWA
  // config already sets `navigateFallback: 'index.html'` so the deep link resolves.
  const landingRoute = matchLandingPath(globalThis.location?.pathname ?? '/')
  if (landingRoute) {
    return (
      <ThemeProvider>
        {/* Language before login (§6.1): a Russian-speaking parent cannot read a Hebrew
            offer any more than a Hebrew consent screen. */}
        <LanguagePicker locale={locale} onChoose={setLocale} />
        <PublicLanding
          slug={landingRoute.slug}
          locale={locale}
          client={landingClient}
          signedIn={session.status === 'signed-in'}
        />
      </ThemeProvider>
    )
  }

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
          drawerFooter={<AccountDrawerFooter locale={locale} onChooseLocale={setLocale} />}
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
          {/* §6.1's first-run routing still owns the DEFAULT screen — `Resolve` decides
              between the studio picker, the blocking consents and home. Both W2 lanes
              hang one screen off a hash in front of it, and neither claims the fallback:
              an unknown hash still falls through to `Resolve`.

              `access.parent` guards lane SCHEDULE's branch because a hash is typed by
              whoever is holding the phone, so the check cannot live in the link. Lane
              PEOPLE's branch needs no such guard — `AddSibling` is behind §6.1's refusal
              already, since a person with no guardian row never reaches this shell. */}
          {session.access.parent && isCalendarRoute(hash) ? (
            <ScheduleSection
              locale={locale}
              client={scheduleClient}
              hash={hash}
              today={today}
            />
          ) : onPayments ? (
            // No `access.parent` guard needed and none added: the routes behind this
            // screen resolve the payer from the session, so a person with no charges sees
            // an empty state rather than somebody else's money.
            <PaymentsSection locale={locale} />
          ) : addingChild ? (
            <AddSibling locale={locale} client={peopleClient} />
          ) : belts.length === 2 ? (
            <BeltProgressScreen
              classId={belts[1]!}
              client={beltsClient}
              locale={locale}
              studentId={belts[0]!}
            />
          ) : invite.length === 2 ? (
            <EventInviteScreen
              client={eventsClient}
              eventId={invite[0]!}
              locale={locale}
              now={today}
              studentId={invite[1]!}
            />
          ) : onAnnouncements ? (
            <InboxScreen client={commsClient} locale={locale} />
          ) : onEvents ? (
            <ParentEventsScreen
              client={eventsClient}
              locale={locale}
              now={today}
              onOpen={(eventId, studentId) => {
                globalThis.location.hash = `#/events/${eventId}/${studentId}`
              }}
            />
          ) : (
            <Resolve session={session} locale={locale} />
          )}
        </AppShell>
      ) : null}
    </ThemeProvider>
  )
}
