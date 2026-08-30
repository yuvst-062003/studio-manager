// `#/join` — the route behind §5.4a ④'s "איך היה?", and what it needs before it can draw.
//
// Two reads, because the two facts live in two places and both are load-bearing:
//
//   * `/me/students` says WHICH child is on a trial. Entrance A converts the student who
//     already exists, so the join is per child and this screen has to name them.
//   * `/me/trial-bookings` says which GROUP they trialled in and whether they turned up.
//     `StudentSummaryOut` carries neither and should not — it is the coach-reachable roster
//     row every student in the product shares.
//
// **A no-show is not offered the join.** `attended` is three-state, and this route refuses
// on anything but `true` — the same rule `TrialHome` follows for the button and the
// follow-up worker follows for the message. A family who did not come being sent to a
// "pick your groups" screen is "איך היה?" with money attached, reached by typing a hash.
import { useEffect, useState } from 'react'
import { EmptyState } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { JoinTheClub } from './JoinTheClub'
import { nextTrialLesson } from './peopleClient'
import type { PeopleClient, StudentSummary, TrialLesson } from './peopleClient'

type Loaded = {
  students: readonly StudentSummary[]
  lesson: TrialLesson | null
}

export function JoinClubSection({
  locale,
  client,
  onJoined,
  now = new Date(),
}: {
  locale: Locale
  client: PeopleClient
  /** Bumped so the shell re-reads the family: the child is `active` now, still holding the
   *  short health form, so §5.5's gate must fire on the very next render. */
  onJoined?: () => void
  now?: Date
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    let live = true
    void Promise.all([
      client.myStudents().catch(() => ({ items: [] as StudentSummary[] })),
      client.myTrialBookings().catch(() => ({ items: [] })),
    ]).then(([mine, bookings]) => {
      if (!live) return
      setLoaded({ students: mine.items, lesson: nextTrialLesson(bookings.items, now) })
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` is a render-time default
  }, [client])

  if (loaded === null) return null

  const lesson = loaded.lesson
  const student = lesson
    ? loaded.students.find((row) => row.id === lesson.studentId)
    : undefined

  // Nothing to join: no booking, a lesson that has not happened, a no-show, or a child who
  // is already active. Said rather than a silent redirect home — a typed hash that quietly
  // bounces is indistinguishable from a broken screen.
  if (!lesson || lesson.attended !== true || !student || student.status !== 'trial') {
    return (
      <section aria-labelledby="join-club-unavailable" data-testid="join-club-unavailable">
        <h1 id="join-club-unavailable">{t(locale, 'people.joinClub.title')}</h1>
        <EmptyState title={t(locale, 'people.trialHome.waitingForClub')} />
        <a href="#/">{t(locale, 'people.joinClub.back')}</a>
      </section>
    )
  }

  return (
    <JoinTheClub
      client={client}
      locale={locale}
      student={student}
      trialledGroupId={lesson.groupId}
      onJoined={() => {
        onJoined?.()
        globalThis.location.hash = '#/'
      }}
    />
  )
}
