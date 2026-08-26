// Parent artboard 12i — פרופיל · עזיבת המועדון.
//
// The artboard's own subtitle is the rule this screen exists to keep: **"החיוב החודשי נשאר
// באחריות ההורה"**. §5.4: "ending an enrollment mid-month does not void that month's charge
// and produces no refund." So the notice is rendered IN FRONT of the decision, and the
// confirm button stays disabled until it has been shown — a warning that appears after the
// tap is a warning nobody read.
//
// L8 — §5.3: "All guardians are equal... There is one guardian view in the app and no
// permission branching inside it." Every guardian row offers the same actions; `is_primary`
// is rendered with the hint that says exactly what it decides and nothing more.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, Card, StatusChip, useSlot } from '@studio/ui'
import { formatDateInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { GuardianOut, PeopleClient, StudentSummary } from './peopleClient'

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '30rem',
  marginInline: 'auto',
  inlineSize: '100%',
}

/**
 * What every `parent-profile` section receives.
 *
 * A **CONTAINER**, the same shape as dashboard `6c` (plan §1.3, seam 4). W5's contract
 * commit opened this slot for M9's data-export request row (§11.3): a guardian asks for
 * their own students' data from this screen, and lane REPORTS owns that row while lane
 * PEOPLE owns this file. The section reads `students` rather than asking the container to
 * fetch for it, so a later lane can add a row against a table this file has never heard of.
 */
export type ProfileSectionProps = {
  locale: Locale
  students: StudentSummary[]
}

/**
 * §5.4a's statuses on `StatusChip`'s six tones.
 *
 * `ChipStatus` has no `trial` member and `@studio/ui` is not this lane's to change, so the
 * tone is the nearest honest one and the **label** carries the meaning — which is also SC
 * 1.4.1's rule: never colour alone.
 */
export function chipToneFor(status: string): 'paid' | 'pending' | 'cancelled' | 'planned' {
  if (status === 'active') return 'paid'
  if (status === 'left' || status === 'lost') return 'cancelled'
  if (status === 'frozen') return 'planned'
  return 'pending'
}

export function GuardianRow({ guardian, locale }: { guardian: GuardianOut; locale: Locale }) {
  return (
    <li data-testid="guardian-row">
      <bdi>{guardian.display_name}</bdi>
      {guardian.is_primary ? (
        <>
          <span data-testid="guardian-primary">{t(locale, 'people.guardian.primary')}</span>
          {/* §5.3 — the hint says both consequences and stops. Nothing branches on it. */}
          <p data-testid="guardian-primary-hint">{t(locale, 'people.guardian.primaryHint')}</p>
        </>
      ) : null}
      {/* Identical affordances on every row — L8. */}
      <a href={`tel:${guardian.phone ?? ''}`} data-testid="guardian-call">
        {t(locale, 'people.guardian.call')}
      </a>
    </li>
  )
}

export function ProfileAndLeave({
  students,
  guardians,
  locale,
  client,
  onLeft,
}: {
  students: StudentSummary[]
  guardians: GuardianOut[]
  locale: Locale
  client: PeopleClient
  onLeft?: (studentId: string) => void
}) {
  const [leaving, setLeaving] = useState<string | null>(null)
  const [leftOn, setLeftOn] = useState('')
  const [sending, setSending] = useState(false)
  const profileSections = useSlot<ProfileSectionProps>('parent-profile')

  return (
    <section style={pageStyle} aria-labelledby="profile-title" data-testid="profile-and-leave">
      <h1 id="profile-title">{t(locale, 'people.student.plural')}</h1>

      {students.map((student) => (
        <Card key={student.id}>
          <h2>
            <bdi>{`${student.first_name} ${student.last_name}`}</bdi>
          </h2>
          <StatusChip
            status={chipToneFor(student.status)}
            label={t(locale, `people.status.${student.status}`)}
          />
          {student.status === 'frozen' ? (
            <p data-testid={`frozen-${student.id}`}>
              {t(locale, 'people.freeze.active')}
              {student.frozen_until
                ? ` — ${t(locale, 'people.freeze.to')} ${formatDateInStudioZone(
                    student.frozen_until,
                    locale,
                  )}`
                : ''}
            </p>
          ) : null}

          {leaving === student.id ? (
            <div data-testid={`leave-confirm-${student.id}`}>
              {/* 12i, verbatim in intent: the notice comes BEFORE the decision. */}
              <span data-testid="leave-debt-notice">
                <Alert tone="pending" iconLabel={t(locale, 'people.leave.title')}>
                  {t(locale, 'people.leave.debtNotice')}
                </Alert>
              </span>
              <label>
                {t(locale, 'people.leave.date')}
                <input
                  type="date"
                  value={leftOn}
                  onChange={(event) => setLeftOn(event.target.value)}
                  data-testid="leave-date"
                />
              </label>
              <Button
                variant="destructive"
                disabled={!leftOn || sending}
                data-testid="leave-submit"
                onClick={() => {
                  setSending(true)
                  client
                    .leave(student.id, { left_on: leftOn })
                    .then(() => onLeft?.(student.id))
                    .finally(() => {
                      setSending(false)
                      setLeaving(null)
                    })
                }}
              >
                {t(locale, 'people.leave.submit')}
              </Button>
              <Button variant="ghost" onClick={() => setLeaving(null)}>
                {t(locale, 'people.landing.back')}
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setLeaving(student.id)}
              data-testid={`leave-start-${student.id}`}
            >
              {t(locale, 'people.leave.title')}
            </Button>
          )}
        </Card>
      ))}

      <section aria-labelledby="profile-guardians">
        <h2 id="profile-guardians">{t(locale, 'people.guardian.plural')}</h2>
        <ul>
          {guardians.map((guardian) => (
            <GuardianRow key={guardian.person_id} guardian={guardian} locale={locale} />
          ))}
        </ul>
      </section>

      {/* Sections other lanes register. M9's data-export row is the first. Empty renders
          nothing at all -- no heading, no placeholder -- because a guardian should not be
          shown an empty box promising a feature that has not shipped. */}
      {profileSections.map(({ key, render: Section }) => (
        <Section key={key} locale={locale} students={students} />
      ))}
    </section>
  )
}
