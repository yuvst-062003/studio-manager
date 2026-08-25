// Step 5 · צוות — invite a coach by email, assign them to a group. Fully M1; no later
// lane extends this file.
//
// The invitation flow and `POST /groups/{id}/staff` both shipped in M1.4, so this step
// adds no endpoint of its own.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import { Button } from '../primitives/Button'
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

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  alignItems: 'end',
  flexWrap: 'wrap',
}

const listStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0 }

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
      <section aria-labelledby="setup-staff-title" data-testid="setup-step-staff">
        <h3 id="setup-staff-title">{t(locale, 'common.setup.step.staff')}</h3>

        <div style={rowStyle}>
          <TextField
            label={t(locale, 'common.setup.staff.email')}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label>
            {t(locale, 'common.setup.staff.role')}
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              {COACH_ROLES.map((option) => (
                <option key={option} value={option}>
                  {t(locale, `common.setup.staff.role.${option}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t(locale, 'common.setup.staff.group')}
            <select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
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
        </div>
        {failed ? <p role="alert">{t(locale, 'common.setup.staff.inviteFailed')}</p> : null}

        <ul data-testid="setup-invites" style={listStyle}>
          {invites.map((invite) => (
            <li key={`${invite.email}-${invite.role}`}>
              {invite.email} · {t(locale, `common.setup.staff.role.${invite.role}`)} ·{' '}
              {/* Artboard 5f's summary says '2 מאמנים הוזמנו — טרם אישרו'. The pending
                  half is the part a manager needs; an invitation is not a coach yet. */}
              {t(locale, 'common.setup.staff.pending')}
            </li>
          ))}
        </ul>

        <Button onClick={onDone}>{t(locale, 'common.setup.continue')}</Button>
        <Button variant="ghost" onClick={onSkip}>
          {t(locale, 'common.setup.skip')}
        </Button>
        <p data-testid="setup-staff-status">{t(locale, `common.setup.status.${status}`)}</p>
      </section>
    )
  }
}
