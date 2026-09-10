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
/** A row of `GET /classes/{id}/staff` — the class's own coaches, already named. */
type ClassCoachRow = { person_id: string; display_name: string; role: string }

export function GroupCoachPanel({
  groupId,
  locale,
  classId,
  rosterVersion = 0,
}: {
  groupId: string
  locale: Locale
  /** The group's class. The picker offers only that class's own coaches: the owner's rule
   *  is "only class coaches can be assigned to the class", and a picker that offered
   *  everybody would be a list where most choices come back as a 422. Absent while the
   *  class is still resolving, and then the picker simply has nothing to offer yet. */
  classId?: string
  /** Bumped by the class roster above when it changes, so a coach added there is offerable
   *  here immediately rather than after a reload. */
  rosterVersion?: number
}) {
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
    // **This class's roster, not the whole studio's staff.** Offering everybody would put
    // karate's coach in judo's picker, where choosing them comes back as a 422 -- the owner
    // asked for them refused AND hidden, and hiding them is this line.
    if (classId) {
      void apiFetch(`/api/v1/classes/${classId}/staff`)
        .then(async (r) =>
          r.ok ? ((await r.json()) as { items: ClassCoachRow[] }).items : [],
        )
        .then(
          (rows) =>
            alive &&
            setStaff(
              rows.map((row) => ({
                person_id: row.person_id,
                first_name: row.display_name,
                last_name: '',
              })),
            ),
        )
        .catch(() => undefined)
    }
    // No `else { setStaff([]) }`: a synchronous setState in an effect body cascades a
    // render, and the React Compiler's own rule refuses it. The empty case is DERIVED at
    // render instead -- `offerable` below -- which is knowable without a second pass.
    return () => {
      alive = false
    }
  }, [groupId, classId, version, rosterVersion])

  // Nothing is offerable until the class is known: the picker's whole source is that
  // class's roster, so before it resolves there is no honest list to show.
  const offerable = classId ? staff : []

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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'end' }}>
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
            fontSize: 'var(--text-label)',
          }}
        >
          {t(locale, 'schedule.group.coaches.person')}
          <select
            data-testid="assign-coach-person"
            onChange={(event) => setPersonId(event.target.value)}
            value={personId}
          >
            <option value="">—</option>
            {/* Empty when the class has no coaches yet: the roster above is where they are
                added, and an empty picker with a filled roster beside it says which. */}
            {offerable.map((member) => (
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
