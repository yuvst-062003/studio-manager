// Step 6 — מאמנים. Who teaches each of this class's groups.
//
// The prototype calls this step "הרשאות ושכר" and offers two things this product does not
// have:
//
//   * **Wages.** `hourlyRate` and `expectedMonthlyHours` have no model and no endpoint —
//     `grep` for `hourly_rate\|wage\|salary` across `app/models` and `app/schemas` returns
//     nothing. Payroll is a product decision, not a screen. §4 rule 3.
//   * **Per-capability switches** — `canSendPush`, `canViewHealthRecords`,
//     `canRecommendBeltExam`, `canOnlyMarkAttendance`. Permissions in this product are
//     ROLES, and `POST /groups/{id}/staff` creates the group-scoped role assignment in the
//     same call as the staffing row. Four booleans beside a role would be a second
//     permission system that the server does not read, which is worse than none.
//
// So this step assigns coaches, and states which permissions the chosen role grants —
// read-only, exactly as `#/staff` does.
import { useEffect, useState } from 'react'
import { Button, EmptyState, StatusChip } from '@studio/ui'
import { t } from '@studio/i18n'
import type { ClassStepProps } from '../ClassWizard'
import type { WizardGroup, WizardGroupStaff, WizardStaff } from '../client'

const ROLES = ['lead_coach', 'assistant_coach'] as const

function nameOf(person: WizardStaff): string {
  return [person.first_name, person.last_name].filter(Boolean).join(' ')
}

export function CoachesStep({ locale, client, classId, onSaved }: ClassStepProps) {
  const [groups, setGroups] = useState<WizardGroup[] | null>(null)
  const [staff, setStaff] = useState<WizardStaff[]>([])
  const [assigned, setAssigned] = useState<Record<string, WizardGroupStaff[]>>({})
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [role, setRole] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!classId) return
    let live = true
    void (async () => {
      try {
        const [loadedGroups, loadedStaff] = await Promise.all([
          client.listGroups(classId),
          client.listStaff(),
        ])
        const byGroup: Record<string, WizardGroupStaff[]> = {}
        for (const group of loadedGroups) byGroup[group.id] = await client.listGroupStaff(group.id)
        if (!live) return
        setGroups(loadedGroups)
        // A pending invitation has no `person_id` — nobody has accepted it, so no `Person`
        // exists and a group cannot be staffed by them. Offering the name would be
        // offering a choice that 404s.
        setStaff(loadedStaff.filter((person) => person.person_id !== null))
        setAssigned(byGroup)
      } catch {
        if (live) setError(t(locale, 'common.loadFailed.body'))
      }
    })()
    return () => {
      live = false
    }
  }, [classId, client, locale])

  const assign = async (groupId: string) => {
    const personId = picked[groupId]
    if (!personId) return
    setBusy(true)
    setError(null)
    try {
      await client.assignStaff(groupId, {
        person_id: personId,
        role: role[groupId] ?? 'lead_coach',
      })
      const fresh = await client.listGroupStaff(groupId)
      setAssigned((current) => ({ ...current, [groupId]: fresh }))
      setPicked((current) => ({ ...current, [groupId]: '' }))
    } catch {
      setError(t(locale, 'schedule.wizard.coaches.failed'))
    } finally {
      setBusy(false)
    }
  }

  if (!classId) return <p>{t(locale, 'schedule.wizard.needsClass')}</p>

  return (
    <div className="wizard-step">
      <p className="wizard-step__lead">{t(locale, 'schedule.wizard.coaches.lead')}</p>

      {groups && groups.length === 0 ? (
        <EmptyState title={t(locale, 'schedule.wizard.coaches.noGroups')} />
      ) : null}

      <ul className="wizard-groups" data-testid="wizard-coach-groups">
        {(groups ?? []).map((group) => (
          <li className="wizard-groups__item" key={group.id}>
            <div className="wizard-groups__head">
              <strong>{group.name}</strong>
              {(assigned[group.id] ?? []).length === 0 ? (
                <StatusChip
                  label={t(locale, 'schedule.wizard.coaches.uncovered')}
                  status="pending"
                />
              ) : null}
            </div>

            <ul className="wizard-coach-list" data-testid={`wizard-coaches-${group.id}`}>
              {(assigned[group.id] ?? []).map((member) => (
                <li key={member.person_id}>
                  <bdi>{member.display_name}</bdi>{' '}
                  <span className="wizard-list__meta">
                    {t(locale, `schedule.wizard.coaches.role.${member.role}`)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="wizard-step__row">
              <label className="wizard-step__field">
                {t(locale, 'schedule.wizard.coaches.person')}
                <select
                  data-testid={`wizard-coach-person-${group.id}`}
                  onChange={(event) =>
                    setPicked((current) => ({ ...current, [group.id]: event.target.value }))
                  }
                  value={picked[group.id] ?? ''}
                >
                  <option value="">—</option>
                  {staff.map((person) => (
                    <option key={person.person_id} value={person.person_id ?? ''}>
                      {nameOf(person)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wizard-step__field">
                {t(locale, 'schedule.wizard.coaches.roleLabel')}
                <select
                  data-testid={`wizard-coach-role-${group.id}`}
                  onChange={(event) =>
                    setRole((current) => ({ ...current, [group.id]: event.target.value }))
                  }
                  value={role[group.id] ?? 'lead_coach'}
                >
                  {ROLES.map((value) => (
                    <option key={value} value={value}>
                      {t(locale, `schedule.wizard.coaches.role.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                data-testid={`wizard-coach-assign-${group.id}`}
                disabled={busy || !picked[group.id]}
                onClick={() => void assign(group.id)}
                variant="secondary"
              >
                {t(locale, 'schedule.wizard.coaches.assign')}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {/* What the role grants, read-only — the same thing `#/staff`'s role editor states. */}
      <p className="wizard-step__note" data-testid="wizard-coach-permissions">
        {t(locale, 'schedule.wizard.coaches.permissionsNote')}
      </p>

      {error ? (
        <p className="wizard-step__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="wizard-step__actions">
        <Button data-testid="wizard-coaches-next" onClick={() => onSaved()}>
          {t(locale, 'schedule.wizard.next')}
        </Button>
      </div>
    </div>
  )
}
