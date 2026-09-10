// מאמני החוג — the roster a group assignment is drawn FROM.
//
// Owner, 2026-09-09: "per class there is its own class main coach and assistance coaches.
// They are not shareable between classes. If a coach is in both, the studio manager needs to
// add his details in both classes. And only class coaches can be assigned to the class."
//
// It sits above the group's own coach picker because that is the order the work happens in:
// a person joins the CLASS, and only then can they be put on one of its groups. The picker
// below reads this list, so the two are one screen rather than two places to keep in step.
//
// **Removal can be refused (409), and the message says why.** A coach still holding one of
// this class's groups cannot leave the class — letting them would create the exact state
// the assignment rule forbids, made by the act meant to tidy up.
import { useEffect, useState } from 'react'
import { apiFetch } from '@studio/core'
import { Button, SelectField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

type ClassCoach = { person_id: string; display_name: string; role: string; from_date: string }
type StaffMember = {
  person_id: string | null
  first_name: string | null
  last_name: string | null
}

export function ClassCoachPanel({
  classId,
  className,
  locale,
  onChanged,
}: {
  classId: string
  className: string
  locale: Locale
  /** The group picker below reads the same roster, so it reloads when this one changes. */
  onChanged?: () => void
}) {
  const [coaches, setCoaches] = useState<ClassCoach[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [personId, setPersonId] = useState('')
  const [role, setRole] = useState<'lead_coach' | 'assistant_coach'>('assistant_coach')
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let alive = true
    void apiFetch(`/api/v1/classes/${classId}/staff`)
      .then(async (r) => (r.ok ? ((await r.json()) as { items: ClassCoach[] }).items : []))
      .then((rows) => alive && setCoaches(rows))
      .catch(() => undefined)
    void apiFetch('/api/v1/staff')
      .then(async (r) => (r.ok ? ((await r.json()) as { items: StaffMember[] }).items : []))
      .then((rows) => alive && setStaff(rows.filter((row) => row.person_id !== null)))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [classId, version])

  const reload = () => {
    setVersion((n) => n + 1)
    onChanged?.()
  }

  const add = async () => {
    if (!personId) return
    setError(null)
    const response = await apiFetch(`/api/v1/classes/${classId}/staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_id: personId, role }),
    })
    if (!response.ok) {
      setError(t(locale, 'schedule.class.coaches.addFailed'))
      return
    }
    setPersonId('')
    reload()
  }

  const remove = async (coachPersonId: string) => {
    setError(null)
    const response = await apiFetch(`/api/v1/classes/${classId}/staff/${coachPersonId}`, {
      method: 'DELETE',
    })
    if (response.status === 409) {
      // The one refusal a manager can act on, so it gets its own sentence rather than a
      // generic failure: they have to take the coach off this class's groups first.
      setError(t(locale, 'schedule.class.coaches.removeBlocked'))
      return
    }
    if (!response.ok) {
      setError(t(locale, 'schedule.class.coaches.removeFailed'))
      return
    }
    reload()
  }

  // Somebody already on the roster is not offered again -- adding them a second time only
  // changes their role, which is what the row's own control is for.
  const onRoster = new Set(coaches.map((coach) => coach.person_id))
  const offerable = staff.filter((member) => !onRoster.has(member.person_id ?? ''))

  return (
    <section aria-labelledby="class-coaches-title" data-testid="class-coaches">
      <h3 id="class-coaches-title">
        {t(locale, 'schedule.class.coaches.title')} — <bdi>{className}</bdi>
      </h3>
      <p>{t(locale, 'schedule.class.coaches.hint')}</p>

      {coaches.length === 0 ? (
        <p data-testid="class-coaches-empty">{t(locale, 'schedule.class.coaches.empty')}</p>
      ) : (
        <ul>
          {coaches.map((coach) => (
            <li data-testid={`class-coach-${coach.person_id}`} key={coach.person_id}>
              <bdi>{coach.display_name}</bdi> ·{' '}
              {t(locale, `common.setup.staff.role.${coach.role}`)}{' '}
              <Button
                aria-label={`${t(locale, 'schedule.class.coaches.remove')} ${coach.display_name}`}
                onClick={() => void remove(coach.person_id)}
                variant="ghost"
              >
                {t(locale, 'schedule.class.coaches.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'end' }}>
        <SelectField
          data-testid="class-coach-person"
          label={t(locale, 'schedule.class.coaches.person')}
          onChange={(event) => setPersonId(event.target.value)}
          value={personId}
        >
          <option value="">{t(locale, 'schedule.class.coaches.choose')}</option>
          {offerable.map((member) => (
            <option key={member.person_id} value={member.person_id ?? ''}>
              {`${member.first_name ?? ''} ${member.last_name ?? ''}`.trim()}
            </option>
          ))}
        </SelectField>
        <SelectField
          data-testid="class-coach-role"
          label={t(locale, 'schedule.class.coaches.role')}
          onChange={(event) => setRole(event.target.value as 'lead_coach' | 'assistant_coach')}
          value={role}
        >
          <option value="lead_coach">{t(locale, 'common.setup.staff.role.lead_coach')}</option>
          <option value="assistant_coach">
            {t(locale, 'common.setup.staff.role.assistant_coach')}
          </option>
        </SelectField>
        <Button
          data-testid="class-coach-add"
          disabled={!personId}
          onClick={() => void add()}
          variant="secondary"
        >
          {t(locale, 'schedule.class.coaches.add')}
        </Button>
      </div>
      {error ? (
        <p role="alert" data-testid="class-coach-error">
          {error}
        </p>
      ) : null}
    </section>
  )
}
