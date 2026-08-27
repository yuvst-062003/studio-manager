// F4.1 — coach assignment, at last. `POST /groups/{id}/staff` shipped in M1.4 and the
// staff screen's red alert named a problem no screen could solve; this panel is the
// solution, mounted on the group page the alert now links to.
import { useEffect, useState } from 'react'
import { apiFetch } from '@studio/core'
import { Button, Radio } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

type GroupStaffRow = { id: string; person_id: string; role: string; to_date: string | null }
type StaffMember = { person_id: string | null; first_name: string | null; last_name: string | null }

export function GroupCoachPanel({ groupId, locale }: { groupId: string; locale: Locale }) {
  const [assigned, setAssigned] = useState<GroupStaffRow[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [personId, setPersonId] = useState('')
  const [role, setRole] = useState<'lead_coach' | 'assistant_coach'>('lead_coach')
  const [failed, setFailed] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let alive = true
    void apiFetch(`/api/v1/groups/${groupId}/staff`)
      .then(async (r) => (r.ok ? ((await r.json()) as { items: GroupStaffRow[] }).items : []))
      .then((rows) => alive && setAssigned(rows.filter((row) => row.to_date === null)))
      .catch(() => undefined)
    void apiFetch('/api/v1/staff')
      .then(async (r) => (r.ok ? ((await r.json()) as { items: StaffMember[] }).items : []))
      .then((rows) => alive && setStaff(rows.filter((row) => row.person_id !== null)))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [groupId, version])

  const nameOf = new Map(
    staff.map((member) => [
      member.person_id,
      `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim(),
    ]),
  )

  return (
    <section aria-labelledby="group-coaches-title" data-testid="group-coaches">
      <h3 id="group-coaches-title">{t(locale, 'schedule.group.coaches.title')}</h3>
      {assigned.length === 0 ? (
        <p data-testid="group-coaches-empty">{t(locale, 'schedule.group.coaches.empty')}</p>
      ) : (
        <ul>
          {assigned.map((row) => (
            <li data-testid={`group-coach-${row.person_id}`} key={row.id}>
              <bdi>{nameOf.get(row.person_id) || row.person_id}</bdi> ·{' '}
              {t(locale, `common.setup.staff.role.${row.role}`)}
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'end' }}>
        <label>
          {t(locale, 'schedule.group.coaches.person')}
          <select
            data-testid="assign-coach-person"
            onChange={(event) => setPersonId(event.target.value)}
            value={personId}
          >
            <option value="">—</option>
            {staff.map((member) => (
              <option key={member.person_id} value={member.person_id ?? ''}>
                {`${member.first_name ?? ''} ${member.last_name ?? ''}`.trim()}
              </option>
            ))}
          </select>
        </label>
        <Radio
          checked={role === 'lead_coach'}
          label={t(locale, 'common.setup.staff.role.lead_coach')}
          name={`coach-role-${groupId}`}
          onChange={() => setRole('lead_coach')}
        />
        <Radio
          checked={role === 'assistant_coach'}
          label={t(locale, 'common.setup.staff.role.assistant_coach')}
          name={`coach-role-${groupId}`}
          onChange={() => setRole('assistant_coach')}
        />
        <Button
          data-testid="assign-coach-submit"
          disabled={!personId}
          onClick={() => {
            setFailed(false)
            void apiFetch(`/api/v1/groups/${groupId}/staff`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ person_id: personId, role }),
            }).then((response) => {
              if (!response.ok) {
                setFailed(true)
                return
              }
              setPersonId('')
              setVersion((n) => n + 1)
            })
          }}
        >
          {t(locale, 'common.staff.uncovered.assign')}
        </Button>
        {failed ? (
          <span data-testid="assign-coach-failed">{t(locale, 'common.loadFailed.body')}</span>
        ) : null}
      </div>
    </section>
  )
}
