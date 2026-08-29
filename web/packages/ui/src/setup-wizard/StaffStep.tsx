// Step 5 · צוות — invite a coach by email, assign them to a group. Fully M1; no later
// lane extends this file.
//
// The invitation flow and `POST /groups/{id}/staff` both shipped in M1.4, so this step
// adds no endpoint of its own.
import { useEffect, useState } from 'react'
import { t } from '@studio/i18n'
import { ActionBar } from '../primitives/ActionBar'
import { Button } from '../primitives/Button'
import { Radio } from '../primitives/Radio'
import { SectionHeader } from '../primitives/SectionHeader'
import { StatusChip } from '../primitives/StatusChip'
import { TextField } from '../primitives/TextField'
import type { NamedRow } from './GroupsStep'
import type { WizardStepProps } from './types'

export type StaffInvite = { email: string; role: string }

export type StaffClient = {
  listGroups: () => Promise<NamedRow[]>
  listInvitations: () => Promise<StaffInvite[]>
  invite: (email: string, role: string, groupId: string | null) => Promise<void>
}

//: §3.1's two coach roles. Owner and manager are invited by the platform console (§5.1's
//: chain of authority), not from here.
const COACH_ROLES = ['lead_coach', 'assistant_coach'] as const

export function makeStaffStep(client: StaffClient) {
  return function StaffStep({ locale, status, onDone, onSkip }: WizardStepProps) {
    const [groups, setGroups] = useState<NamedRow[]>([])
    const [invites, setInvites] = useState<StaffInvite[]>([])
    const [email, setEmail] = useState('')
    const [role, setRole] = useState<string>(COACH_ROLES[0])
    const [groupId, setGroupId] = useState<string>('')
    const [busy, setBusy] = useState(false)
    const [failed, setFailed] = useState(false)

    useEffect(() => {
      let alive = true
      void Promise.all([client.listGroups(), client.listInvitations()]).then(([g, i]) => {
        if (!alive) return
        setGroups(g)
        setInvites(i)
      })
      return () => {
        alive = false
      }
    }, [])

    return (
      <section
        aria-labelledby="setup-staff-title"
        className="setup-step"
        data-testid="setup-step-staff"
      >
        <SectionHeader level={3} title={t(locale, 'common.setup.step.staff')} />
        {/* A club whose owner coaches alone must be able to pass through without feeling
            they have skipped something important. */}
        <p className="setup-step__meta">{t(locale, 'common.setup.staff.aloneIsFine')}</p>

        <div className="setup-two-col">
          <div className="setup-group">
            <TextField
              label={t(locale, 'common.setup.staff.email')}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="coach@example.com"
              type="email"
              value={email}
            />

            {/* §3.1's two roles, each stating what it can and cannot do, at the moment the
                choice is made. This was a select labelled "role": an owner inviting their
                first coach had no way to know which to pick, and the difference is a real
                permission rather than a title. */}
            <fieldset className="setup-roles" role="radiogroup">
              <legend className="studio-visually-hidden">
                {t(locale, 'common.setup.staff.role')}
              </legend>
              {COACH_ROLES.map((option) => (
                <label
                  className="setup-role"
                  data-selected={role === option}
                  data-testid={`staff-role-${option}`}
                  key={option}
                >
                  <Radio
                    checked={role === option}
                    label={t(locale, `common.setup.staff.role.${option}`)}
                    name="staff-role"
                    onChange={() => setRole(option)}
                    value={option}
                  />
                  <span className="setup-role__what">
                    {t(locale, `common.setup.staff.role.${option}What`)}
                  </span>
                </label>
              ))}
            </fieldset>

            <label className="setup-group__legend">
              {t(locale, 'common.setup.staff.group')}
              <select
                data-testid="staff-group"
                onChange={(event) => setGroupId(event.target.value)}
                value={groupId}
              >
                {/* §3.3 — a coach may exist before any group does, so 'no group yet' is a
                    real answer rather than a missing one. */}
                <option value="">{t(locale, 'common.setup.staff.noGroup')}</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>

            {failed ? (
              <p className="setup-group-row__failed" role="alert">
                {t(locale, 'common.setup.staff.inviteFailed')}
              </p>
            ) : null}

            <ActionBar
              end={
                <Button
                  disabled={busy || !email.includes('@')}
                  onClick={() => {
                    setBusy(true)
                    setFailed(false)
                    void client
                      .invite(email.trim(), role, groupId || null)
                      .then(() => {
                        setInvites((current) => [...current, { email: email.trim(), role }])
                        setEmail('')
                      })
                      .catch(() => setFailed(true))
                      .finally(() => setBusy(false))
                  }}
                >
                  {t(locale, 'common.setup.staff.invite')}
                </Button>
              }
            />
          </div>

          {/* Who has been invited, and that they have not accepted yet — an invitation is
              pending until the coach signs in, and an owner should be able to see that
              nothing has gone wrong. */}
          <aside className="setup-panel" data-testid="setup-invites">
            <SectionHeader level={3} title={t(locale, 'common.setup.staff.pendingTitle')} />
            {invites.length === 0 ? (
              <p className="setup-panel__empty">{t(locale, 'common.setup.staff.noPending')}</p>
            ) : (
              <ul className="setup-panel__list">
                {invites.map((invite) => (
                  <li key={`${invite.email}-${invite.role}`}>
                    <bdi>{invite.email}</bdi>
                    <span className="setup-panel__chips">
                      <StatusChip
                        label={t(locale, `common.setup.staff.role.${invite.role}`)}
                        status="planned"
                      />
                    </span>
                    <span className="setup-panel__awaiting">
                      {t(locale, 'common.setup.staff.awaiting')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>

        <ActionBar
          end={
            <Button onClick={onDone}>
              {t(locale, 'common.setup.continueTo').replace(
                '{{step}}',
                t(locale, 'common.setup.step.students'),
              )}
            </Button>
          }
          start={
            <Button onClick={onSkip} variant="ghost">
              {t(locale, 'common.setup.staff.later')}
            </Button>
          }
        />
        <p className="setup-step__meta" data-testid="setup-staff-status">
          {t(locale, `common.setup.status.${status}`)}
        </p>
      </section>
    )
  }
}
