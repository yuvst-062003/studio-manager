// §6.1's parent-app first launch, steps 3 and 4:
//
//   3  resolve        invitation token → attach identity to the pre-created Person
//                     verified email/phone hit → attach to the matched Person
//                     no match → "לא מצאנו אותך"
//                                [ יש לי קוד הזמנה ] [ הרשמה לסטודיו ]
//   4  studio picker  only shown if she belongs to more than one studio
//
// Steps 5 and 6 — the BLOCKING consent and health gates — are M4's, and this file
// deliberately does NOT pre-build a seam for them. §1.3's seam-4 table names five
// composites and this is not one of them, so inventing a sixth SlotId here would be
// speculative design in a file (`slots.ts`) the plan says is authored once. M4 decides
// its own shape; what M1 owes it is a container with an obvious place to land.
import { useEffect, useMemo, useState } from 'react'
import { RefusalScreen, StudioSwitcher } from '@studio/ui'
import type { Session } from '@studio/core'
import { apiFetch } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { ParentHome } from '../home/ParentHome'
import type { HomeLesson } from '../home/ParentHome'
import { everyChildIsOnATrial, makePeopleClient, useMyStudents } from '../people'
import { TrialHome } from '../people'
import { makeParentScheduleClient } from '../schedule/client'

/** Where the staff app lives, so §6.1's second refusal is a link rather than a dead end. */
const STAFF_APP_URL = '/staff'

export function Resolve({ session, locale }: { session: Session; locale: Locale }) {
  const [code, setCode] = useState('')
  // Memoised: `useMyStudents` reads through this in an effect keyed on the client, so a
  // fresh object every render would re-fetch forever.
  const peopleClient = useMemo(() => makePeopleClient(apiFetch), [])
  const mine = useMyStudents(peopleClient)
  const scheduleClient = useMemo(() => makeParentScheduleClient(apiFetch), [])
  // 2a's "upcoming" strip data, at 1a's depth: the next few lessons across the family's
  // groups, this week. `null` while loading so the home stays quiet rather than flashing
  // an empty state; a failed read renders the empty state, because a home that dies on a
  // schedule hiccup is worse than one missing a list.
  const [upcoming, setUpcoming] = useState<readonly HomeLesson[] | null>(null)
  // 1a's debt alert — the same `/me/balance` read `12f` renders in full. Zero on failure:
  // a home that cannot ask about money shows no alert rather than a broken one.
  const [debtAgorot, setDebtAgorot] = useState(0)
  const [attendance, setAttendance] = useState<
    readonly { session_id: string; student_id: string; status: string }[]
  >([])
  useEffect(() => {
    if (!session.access.parent) return
    let live = true
    void apiFetch('/api/v1/me/balance')
      .then((response) => (response.ok ? (response.json() as Promise<{ balance_agorot: number }>) : { balance_agorot: 0 }))
      .then((body) => {
        if (live) setDebtAgorot(Math.max(0, body.balance_agorot))
      })
      .catch(() => {})
    const now = new Date()
    // 2a's strip reads back as well as forward: a week each way, one fetch.
    const weekBack = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const day = (d: Date) => d.toISOString().slice(0, 10)
    scheduleClient
      .listSessions({ from: day(weekBack), to: day(weekOut) })
      .then((rows) => {
        if (!live) return
        setUpcoming(
          rows
            .filter((row) => row.status === 'scheduled')
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
            .map((row) => ({ id: row.id, startsAt: row.starts_at, groupName: row.group_name })),
        )
      })
      .catch(() => live && setUpcoming([]))
    // 2a's other half — what actually happened, for the strip's past days.
    void apiFetch(`/api/v1/me/attendance?from=${day(weekBack)}&to=${day(now)}`)
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ items: { session_id: string; student_id: string; status: string }[] }>)
          : { items: [] },
      )
      .then((body) => {
        if (live) setAttendance(body.items)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [scheduleClient, session.access.parent])

  // §3.1 — the parent app asks 'do you have any guardian rows?', which is what
  // `access.parent` reports. A role check here would let a manager with no children in.
  if (!session.access.parent) {
    return (
      <>
        <RefusalScreen
          which="parent"
          otherAppUrl={STAFF_APP_URL}
          onSignOut={() => void session.signOut()}
          locale={locale}
        />
        {/* §6.1 step 3's 'no match' branch. Without it, a correctly-invited parent whose
            email differs from the invitation by one character has no way forward at all
            — and that person cannot tell their situation from a genuine refusal. */}
        <section data-testid="parent-no-match">
          <p>{t(locale, 'common.auth.notFound')}</p>
          <label htmlFor="invite-code">{t(locale, 'common.auth.inviteCodeLabel')}</label>
          <input
            id="invite-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              void apiFetch('/api/v1/auth/accept-invitation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: code }),
              }).then(() => session.reload())
            }}
          >
            {t(locale, 'common.auth.haveInviteCode')}
          </button>
        </section>
      </>
    )
  }

  // §6.3's trial state — 'A guardian whose children are ALL trial sees a reduced home.'
  //
  // Every child, not any: a family mid-conversion must keep the app they are already using.
  // Once a manager converts them "the full app appears with no further action from the
  // parent", which is this condition simply ceasing to hold.
  if (mine.status === 'ready' && everyChildIsOnATrial(mine.students)) {
    return <TrialHome students={mine.students} locale={locale} />
  }

  // §6.1 step 4 — 'only shown if she belongs to more than one studio'. StudioSwitcher
  // renders nothing below two, so the picker disappears on its own for the common case.
  if (session.studios.length > 1 && session.activeStudioId === null) {
    return (
      <section data-testid="studio-picker" aria-label={t(locale, 'common.studioPicker.title')}>
        <h2>{t(locale, 'common.studioPicker.title')}</h2>
        <StudioSwitcher
          studios={session.studios.map((s) => ({
            studioId: s.studio_id,
            studioName: s.studio_name,
            studioIsDemo: s.studio_is_demo,
          }))}
          activeStudioId={session.activeStudioId}
          onSwitch={(studioId) => {
            void apiFetch('/api/v1/auth/switch-studio', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ studio_id: studioId }),
            }).then(() => session.reload())
          }}
          locale={locale}
        />
      </section>
    )
  }

  return (
    // §6.1's home — artboard 1a. The health gate (step 6) wraps this whole shell in
    // App.tsx since the ship audit mounted it. The W1 `hasChildren` boolean is retired
    // with it: `mine` has named the children since M3, so the home renders them.
    <ParentHome
      locale={locale}
      students={
        mine.status === 'ready'
          ? mine.students.map((student) => ({
              id: student.id,
              displayName: `${student.first_name} ${student.last_name}`,
              groupNames: student.group_names ?? [],
            }))
          : mine.status === 'error'
            ? []
            : null
      }
      upcoming={upcoming}
      attendance={attendance}
      debtAgorot={debtAgorot}
    />
  )
}
