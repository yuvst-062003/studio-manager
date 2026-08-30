// §6.3's trial state — the reduced home.
//
// "A guardian whose children are all `trial` sees a reduced home: the booked session with a
// countdown, an add-to-calendar button, directions to the studio, and what to bring. **No
// payments screen** (they have no charges), **no attendance history, no belt strip.** After
// the lesson the home shows 'איך היה?' and, once a manager converts them, the full app
// appears with no further action from the parent."
//
// The three absences are the design. A trial family has no charges — §5.4a: the billing run
// only walks active enrollments — so a payments tab would open on an empty screen and invite
// the question "what do I owe?" at exactly the wrong moment.
import type { CSSProperties } from 'react'
import { Card } from '@studio/ui'
import { formatDateInStudioZone, formatTimeInStudioZone, studioDayKey } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { StudentSummary } from './peopleClient'

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '30rem',
  marginInline: 'auto',
  inlineSize: '100%',
}

/**
 * Whole **calendar days** from `now` to the lesson, in the studio's timezone. Negative once
 * it has happened.
 *
 * Calendar days, not 24-hour blocks. A lesson 29 hours away is "tomorrow" to a parent and
 * "2 days" to arithmetic, and the parent is the one reading it. G3 makes Asia/Jerusalem the
 * rendering zone regardless of locale, so the comparison happens there — a countdown that
 * flipped at midnight UTC would say "tomorrow" for two hours of the wrong evening.
 */
export function daysUntil(startsAt: string, now: Date): number {
  const day = 24 * 60 * 60 * 1000
  const asUtcMidnight = (iso: string | Date) => Date.parse(`${studioDayKey(iso)}T00:00:00Z`)
  return Math.round((asUtcMidnight(startsAt) - asUtcMidnight(now)) / day)
}

export function TrialHome({
  students,
  locale,
  sessionStartsAt = null,
  attended = false,
  now = new Date(),
}: {
  students: StudentSummary[]
  locale: Locale
  sessionStartsAt?: string | null
  /** §5.4a ④ — after the lesson the home asks "איך היה?". */
  attended?: boolean
  now?: Date
}) {
  const days = sessionStartsAt ? daysUntil(sessionStartsAt, now) : null

  return (
    <section style={pageStyle} aria-labelledby="trial-home-title" data-testid="trial-home">
      <h1 id="trial-home-title">{t(locale, 'people.trialHome.title')}</h1>

      <Card>
        <ul>
          {students.map((student) => (
            <li key={student.id}>
              <bdi>{`${student.first_name} ${student.last_name}`}</bdi>
            </li>
          ))}
        </ul>
        {sessionStartsAt ? (
          <>
            {/* G3 — stored UTC, rendered Asia/Jerusalem regardless of locale. */}
            <p data-testid="trial-home-when">
              {formatDateInStudioZone(sessionStartsAt, locale)}{' '}
              {formatTimeInStudioZone(sessionStartsAt, locale)}
            </p>
            <p data-testid="trial-home-countdown">
              {/* Four branches, and the first one is the correction. `days < 0` is a lesson
                  that has already happened, and a countdown cannot count down to it —
                  "היום" was what it said, for a lesson three days ago. That is the branch
                  `waitingForClub` was written for and never reached: *after the lesson* is
                  true exactly here. `days === 0` is still today, and a parent opening the
                  app on the morning of the lesson is this screen's likeliest reader. */}
              {days !== null && days < 0
                ? t(locale, 'people.trialHome.waitingForClub')
                : days !== null && days <= 0
                  ? t(locale, 'people.trialHome.today')
                  : days === 1
                    ? t(locale, 'people.trialHome.tomorrow')
                    : t(locale, 'people.trialHome.countdown').replace('{n}', String(days))}
            </p>
          </>
        ) : (
          // No lesson booked at all — §5.4a's logged phone enquiry, and every family
          // reaching this screen before `Resolve` had a booking to hand it. This said
          // "המועדון יחזור אליכם אחרי השיעור" — *after the lesson* — to a family whose
          // lesson does not exist, describing an event that had not been arranged.
          <p data-testid="trial-home-waiting">{t(locale, 'people.trialHome.noLessonBooked')}</p>
        )}
      </Card>

      <a href="#/calendar" data-testid="trial-home-calendar">
        {t(locale, 'people.trialHome.addToCalendar')}
      </a>
      <a href="#/directions" data-testid="trial-home-directions">
        {t(locale, 'people.trialHome.directions')}
      </a>

      <section aria-labelledby="trial-home-bring">
        <h2 id="trial-home-bring">{t(locale, 'people.trialHome.whatToBring')}</h2>
        <p data-testid="trial-home-bring-hint">{t(locale, 'people.trialHome.whatToBringHint')}</p>
      </section>

      {attended ? (
        // §5.4a ④ — 'After the lesson the home shows "איך היה?"', and it now leads somewhere.
        //
        // **The question was a dead end for as long as it has existed.** The conversion
        // decision used to be the manager's alone: this screen asked a family whether they
        // enjoyed themselves and offered them nothing to press, the follow-up worker asked
        // the same thing on days 1, 3 and 7 with no link, and day 21 marked the student
        // `lost`. Both entrances exist now, and this is the parent's.
        //
        // **Only after the lesson, and only for somebody who came.** `attended` is
        // three-state and this branch is `=== true`: the no-show is shown neither the
        // question nor the button, which is the same rule the worker follows for the same
        // reason — offering a family who did not turn up a join button is "איך היה?" with
        // money attached.
        <>
          <p data-testid="trial-home-how-was-it">{t(locale, 'people.trialHome.howWasIt')}</p>
          {/* A link and not a button: it is navigation, the hash survives the back button,
              and every other in-app route in this shell is reached the same way. */}
          <a href="#/join" data-testid="trial-home-join">
            {t(locale, 'people.joinClub.cta')}
          </a>
        </>
      ) : null}
    </section>
  )
}
