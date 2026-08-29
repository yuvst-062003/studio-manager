// Step 5 · צוות — invite a coach by email, assign them to a group. Fully M1; no later
// lane extends this file.
//
// The invitation flow and `POST /groups/{id}/staff` both shipped in M1.4, so this step
// adds no endpoint of its own.
import { useEffect, useState } from 'react'
import { t } from '@studio/i18n'
import { ActionBar } from '../primitives/ActionBar'
import { Button } from '../primitives/Button'
import { Checkbox } from '../primitives/Checkbox'
import { Radio } from '../primitives/Radio'
import { SectionHeader } from '../primitives/SectionHeader'
import { StatusChip } from '../primitives/StatusChip'
import { TextField } from '../primitives/TextField'
import type { NamedRow } from './GroupsStep'
import type { WizardStepProps } from './types'

export type StaffInvite = { email: string; role: string; groups: string[] }

export type StaffClient = {
  listGroups: () => Promise<NamedRow[]>
  listInvitations: () => Promise<StaffInvite[]>
  /** Groups the coach starts on. Empty is legal — §3.3 lets a coach exist before a group. */
  invite: (email: string, role: string, groupIds: string[]) => Promise<void>
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
    const [picked, setPicked] = useState<readonly string[]>([])
    const [busy, setBusy] = useState(false)
    const [failed, setFailed] = useState(false)

    const allPicked = groups.length > 0 && picked.length === groups.length
    const toggle = (id: string) =>
      setPicked((current) =>
        current.includes(id) ? current.filter((one) => one !== id) : [...current, id],
      )

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

            {/* A coach almost always takes more than one group, and this was a single
                `<select>` — so the honest answer to "which groups?" could not be given.
                Toggles, with an all/none control, because the common case is "all of
                them" and the second most common is two of five. §3.3 keeps *none* a real
                answer: a coach may exist before any group does. */}
            <fieldset className="setup-teams" data-testid="staff-groups">
              <legend className="setup-group__legend">
                {t(locale, 'common.setup.staff.group')}
              </legend>
              {groups.length === 0 ? (
                <p className="setup-panel__empty">{t(locale, 'common.setup.staff.noGroupsYet')}</p>
              ) : (
                <>
                  <div className="setup-teams__bulk">
                    <Button
                      data-testid="staff-groups-all"
                      onClick={() => setPicked(allPicked ? [] : groups.map((group) => group.id))}
                      variant="ghost"
                    >
                      {t(
                        locale,
                        allPicked ? 'common.setup.staff.clearAll' : 'common.setup.staff.pickAll',
                      )}
                    </Button>
                    <span className="setup-teams__count" data-testid="staff-groups-count">
                      {t(locale, 'common.setup.staff.picked')
                        .replace('{{count}}', String(picked.length))
                        .replace('{{total}}', String(groups.length))}
                    </span>
                  </div>
                  <ul className="setup-teams__list">
                    {groups.map((group) => (
                      <li key={group.id}>
                        {/* A span, not a label: Checkbox emits its own <label htmlFor>,
                            and nesting one inside another gives the inner control two
                            labels and unpredictable click targets. */}
                        <span className="setup-team" data-selected={picked.includes(group.id)}>
                          <Checkbox
                            checked={picked.includes(group.id)}
                            label={group.name}
                            onChange={() => toggle(group.id)}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="setup-step__meta">{t(locale, 'common.setup.staff.groupHint')}</p>
            </fieldset>

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
                      .invite(email.trim(), role, [...picked])
                      .then(() => {
                        const names = groups
                          .filter((group) => picked.includes(group.id))
                          .map((group) => group.name)
                        setInvites((current) => [
                          ...current,
                          { email: email.trim(), role, groups: names },
                        ])
                        setEmail('')
                        setPicked([])
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
                      {/* The groups they were actually put on — the panel used to show
                          the role alone, which is the half that was never in doubt. */}
                      {(invite.groups ?? []).map((name) => (
                        <StatusChip key={name} label={name} status="planned" />
                      ))}
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
