// Parent artboard 12j — הרשמה ראשונה: "קישור מהמועדון או המשך משיעור ניסיון".
//
// Two ways in, one screen, because what happens next is the same either way: the club
// already holds the child, and the parent is completing details — not enrolling.
//
//   invitation   §5.4(a) — a manager created the student and sent an invitation. §5.3: the
//                token binds the accepting identity to the pre-created Person, so accepting
//                attaches a login to a profile that already exists.
//   from a trial §5.4a — the parent booked a trial, so the Person and the Student exist and
//                they are already signed in. Nothing to accept; the club decides next.
//
// **Neither path offers a group picker or a price.** L6 — enrolment is always a manager
// decision. A screen here that let a parent choose a group would be the one place in the
// product where somebody enrols themselves, and §5.4 is explicit that no such place exists.
import type { CSSProperties } from 'react'
import { Card } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { StudentSummary } from './peopleClient'

export type FirstRegistrationSource = 'invitation' | 'trial'

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '30rem',
  marginInline: 'auto',
  inlineSize: '100%',
}

export function FirstRegistration({
  source,
  students,
  locale,
}: {
  source: FirstRegistrationSource
  /** Already on file — the club created them. This screen never creates a student. */
  students: StudentSummary[]
  locale: Locale
}) {
  return (
    <section style={pageStyle} aria-labelledby="first-reg-title" data-testid="first-registration">
      <h1 id="first-reg-title">{t(locale, 'people.submitted.whatNext')}</h1>

      <p data-testid="first-reg-source">
        {source === 'trial'
          ? t(locale, 'people.trialHome.waitingForClub')
          : t(locale, 'people.sibling.pendingHint')}
      </p>

      <Card>
        <h2>{t(locale, 'people.student.plural')}</h2>
        {students.length > 0 ? (
          <ul>
            {students.map((student) => (
              <li key={student.id} data-testid="first-reg-student">
                <bdi>{`${student.first_name} ${student.last_name}`}</bdi>
                {/* The club's own status, rendered as text — never a control the parent
                    can change. §5.4a surfaces `student.status` everywhere a student is
                    rendered, and this is one of those places. */}
                <span data-testid="first-reg-status">
                  {t(locale, `people.status.${student.status}`)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p data-testid="first-reg-empty">{t(locale, 'people.student.empty')}</p>
        )}
      </Card>

      {/* §6.1 steps 5-6 are the blocking gates, and they are M4's. What 12j owes them is a
          container with an obvious place to land, not a pre-built seam this lane invented. */}
      <p data-testid="first-reg-next">{t(locale, 'people.card.sectionsComeLater')}</p>
    </section>
  )
}
