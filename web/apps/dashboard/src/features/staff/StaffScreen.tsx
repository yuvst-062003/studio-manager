// Dashboard artboard 3d — צוות: from a read-only table into the lifecycle (F5).
//
// The invite returns its token EXACTLY once and the screen says so: no mailer exists
// anywhere in this product, so the manager shares the code the same way the platform's
// owner invite and §5.4b's onboarding link work. Weekly hours are measured now (F8) —
// the שעות שבוע column was '—' with an apology for two waves after sessions shipped.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiFetch } from '@studio/core'
import { Alert, Button, Card, Checkbox, LoadFailed, StatusChip, Table, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

type StaffGroup = { id: string; name: string }

type StaffMember = {
  person_id: string | null
  invitation_id: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  roles: string[]
  groups: StaffGroup[]
  weekly_hours: number | null
  permissions: string[]
  status: string
}

type StaffPayload = {
  items: StaffMember[]
  groups_without_coach: StaffGroup[]
  sessions_without_coach: number
}

const GRANTABLE = ['manager', 'lead_coach', 'assistant_coach'] as const

const chipRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-1)',
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

const chipStyle: CSSProperties = {
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-pill)',
  paddingBlock: 'var(--space-1)',
  paddingInline: 'var(--space-2)',
  fontSize: 'var(--text-caption)',
}

const actionsRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  alignItems: 'center',
}

function displayName(member: StaffMember, locale: Locale): string {
  const name = [member.first_name, member.last_name].filter(Boolean).join(' ').trim()
  // A pending invitation has no Person, so the address IS the identity — and printing an
  // empty cell would make the row look broken rather than pending.
  return name || member.email || t(locale, 'common.staff.status.invited')
}

async function json(path: string, init?: RequestInit) {
  const response = await apiFetch(path, init)
  if (!response.ok) throw new Error(String(response.status))
  return response.status === 204 ? null : ((await response.json()) as unknown)
}

export function StaffScreen({ locale }: { locale: Locale }) {
  const [payload, setPayload] = useState<StaffPayload | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  // The invite form.
  const [inviting, setInviting] = useState(false)
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [roles, setRoles] = useState<string[]>(['lead_coach'])
  const [inviteFailed, setInviteFailed] = useState(false)
  // The one-time code, shown after create or resend and never reproducible.
  const [issuedToken, setIssuedToken] = useState<{ email: string; token: string } | null>(null)
  // The per-person role editor.
  const [editingRoles, setEditingRoles] = useState<string | null>(null)
  const [draftRoles, setDraftRoles] = useState<string[]>([])
  const [refusal, setRefusal] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void apiFetch('/api/v1/staff')
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status))
        return (await response.json()) as StaffPayload
      })
      .then((next) => {
        if (alive) setPayload(next)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [attempt])

  const reload = () => setAttempt((n) => n + 1)

  if (failed) {
    return (
      <section aria-labelledby="staff-title">
        <h2 id="staff-title">{t(locale, 'common.staff.title')}</h2>
        {/* F1a — a real re-fetch, never location.reload(): the service worker may
            serve the same failure from cache. */}
        <LoadFailed
          locale={locale}
          onRetry={() => {
            setFailed(false)
            reload()
          }}
        />
      </section>
    )
  }
  if (payload === null) return <p data-testid="staff-loading">{t(locale, 'common.setup.loading')}</p>

  const uncovered = payload.groups_without_coach
  const totalHours = payload.items.reduce((sum, member) => sum + (member.weekly_hours ?? 0), 0)
  const people = payload.items.filter((member) => member.person_id !== null).length

  const toggleRole = (list: string[], role: string): string[] =>
    list.includes(role) ? list.filter((r) => r !== role) : [...list, role]

  async function submitInvite() {
    setInviteFailed(false)
    try {
      const body = (await json('/api/v1/staff/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          roles,
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
        }),
      })) as { email: string; token: string }
      setIssuedToken({ email: body.email, token: body.token })
      setInviting(false)
      setEmail('')
      setFirstName('')
      setLastName('')
      reload()
    } catch {
      setInviteFailed(true)
    }
  }

  return (
    <section aria-labelledby="staff-title">
      <header>
        <h2 id="staff-title">{t(locale, 'common.staff.title')}</h2>
        {/* The companion's header summary: `5 אנשי צוות · 50 שעות שבועיות`. */}
        <p data-testid="staff-count">
          {t(locale, 'common.staff.summary')
            .replace('{n}', String(people))
            .replace('{h}', String(Math.round(totalHours)))}
        </p>
      </header>

      {uncovered.length > 0 ? (
        <div data-testid="staff-uncovered">
          <Alert tone="danger" iconLabel={t(locale, 'common.dev.noticeIcon')}>
            {t(locale, 'common.staff.uncovered.title').replace('{n}', String(uncovered.length))} ·{' '}
            {uncovered.map((group) => (
              // F4 — the alert names a problem the product now solves: each group links
              // to its schedule page, where the coach assignment lives.
              <a
                data-testid={`uncovered-group-${group.id}`}
                href={`#/groups/${group.id}`}
                key={group.id}
                style={{ marginInlineEnd: 'var(--space-2)' }}
              >
                {group.name}
              </a>
            ))}
          </Alert>
        </div>
      ) : (
        <p data-testid="staff-covered">{t(locale, 'common.staff.uncovered.none')}</p>
      )}
      {/* F8 — the banner at 3d's drawn resolution, measured from sessions. */}
      {payload.sessions_without_coach > 0 ? (
        <p data-testid="staff-sessions-uncovered">
          {t(locale, 'common.staff.uncovered.sessions').replace(
            '{n}',
            String(payload.sessions_without_coach),
          )}
        </p>
      ) : null}

      {/* F5 — הוספת איש צוות. */}
      {issuedToken ? (
        <Card>
          <p data-testid="invite-token">
            <bdi>{issuedToken.email}</bdi> · <code>{issuedToken.token}</code>
          </p>
          <p>{t(locale, 'common.staff.invite.tokenHint')}</p>
          <Button onClick={() => setIssuedToken(null)} variant="secondary">
            {t(locale, 'common.install.back')}
          </Button>
        </Card>
      ) : null}
      {inviting ? (
        <Card>
          <h3>{t(locale, 'common.staff.invite.title')}</h3>
          <TextField
            label={t(locale, 'common.staff.invite.email')}
            onChange={(event) => setEmail(event.target.value)}
            value={email}
          />
          <TextField
            label={t(locale, 'common.staff.invite.firstName')}
            onChange={(event) => setFirstName(event.target.value)}
            value={firstName}
          />
          <TextField
            label={t(locale, 'common.staff.invite.lastName')}
            onChange={(event) => setLastName(event.target.value)}
            value={lastName}
          />
          <fieldset>
            <legend>{t(locale, 'common.staff.invite.roles')}</legend>
            {GRANTABLE.map((role) => (
              <Checkbox
                checked={roles.includes(role)}
                key={role}
                label={t(locale, `common.staff.role.${role}`)}
                onChange={() => setRoles((current) => toggleRole(current, role))}
              />
            ))}
          </fieldset>
          {inviteFailed ? (
            <p data-testid="invite-failed">{t(locale, 'common.staff.invite.failed')}</p>
          ) : null}
          <Button
            data-testid="invite-submit"
            disabled={!email.trim() || roles.length === 0}
            onClick={() => void submitInvite()}
          >
            {t(locale, 'common.staff.invite.submit')}
          </Button>
        </Card>
      ) : (
        <Button data-testid="invite-open" onClick={() => setInviting(true)}>
          {t(locale, 'common.staff.invite.title')}
        </Button>
      )}

      {refusal ? (
        <Alert live tone="danger" iconLabel={t(locale, 'common.dev.noticeIcon')}>
          <span data-testid="staff-refusal">{refusal}</span>
        </Alert>
      ) : null}

      {/* F1b — the primitive owns widths, caption, scroll and the card fallback. */}
      <Table
        caption={t(locale, 'common.staff.title')}
        columns={[
          {
            id: 'person',
            header: t(locale, 'common.staff.col.person'),
            width: '12rem',
            cell: (member) => displayName(member, locale),
          },
          {
            id: 'role',
            header: t(locale, 'common.staff.col.role'),
            width: '10rem',
            cell: (member) =>
              member.roles.map((role) => t(locale, `common.setup.staff.role.${role}`)).join(' · '),
          },
          {
            id: 'groups',
            header: t(locale, 'common.staff.col.groups'),
            width: '12rem',
            cell: (member) =>
              member.groups.length === 0
                ? t(locale, 'common.staff.noGroups')
                : member.groups.map((group) => group.name).join(' · '),
          },
          {
            id: 'hours',
            header: t(locale, 'common.staff.col.hours'),
            width: '7rem',
            cell: (member) => (
              // F8 — measured from this week's staffed sessions. A pending invitation
              // staffs nothing, and stays an em dash rather than a fake zero.
              <span data-testid="staff-hours-cell">
                {member.weekly_hours ?? t(locale, 'common.staff.noHours')}
              </span>
            ),
          },
          {
            id: 'permissions',
            header: t(locale, 'common.staff.col.permissions'),
            width: '14rem',
            cell: (member) => (
              <ul style={chipRowStyle}>
                {member.permissions.map((permission) => (
                  <li key={permission} style={chipStyle}>
                    {t(locale, `common.staff.perm.${permission}`)}
                  </li>
                ))}
              </ul>
            ),
          },
          {
            id: 'status',
            header: t(locale, 'common.staff.col.status'),
            width: '8rem',
            cell: (member) => (
              // 4h's six statuses are the product's own vocabulary; `paid` and
              // `pending` are the two that mean settled and awaiting-someone-else,
              // which is exactly active vs invited.
              <StatusChip
                status={member.status === 'active' ? 'paid' : 'pending'}
                label={t(locale, `common.staff.status.${member.status}`)}
              />
            ),
          },
          {
            id: 'actions',
            header: t(locale, 'common.staff.invite.roles'),
            width: '16rem',
            cell: (member) =>
              member.invitation_id ? (
                <span style={actionsRowStyle}>
                  <Button
                    data-testid={`resend-${member.invitation_id}`}
                    onClick={() =>
                      void json(`/api/v1/staff/invitations/${member.invitation_id}/resend`, {
                        method: 'POST',
                      })
                        .then((body) => setIssuedToken(body as { email: string; token: string }))
                        .catch(() => setRefusal(t(locale, 'common.staff.invite.failed')))
                    }
                    variant="secondary"
                  >
                    {t(locale, 'common.staff.actions.resend')}
                  </Button>
                  <Button
                    data-testid={`revoke-${member.invitation_id}`}
                    onClick={() =>
                      void json(`/api/v1/staff/invitations/${member.invitation_id}`, {
                        method: 'DELETE',
                      })
                        .then(() => reload())
                        .catch(() => setRefusal(t(locale, 'common.staff.invite.failed')))
                    }
                    variant="ghost"
                  >
                    {t(locale, 'common.staff.actions.revoke')}
                  </Button>
                </span>
              ) : editingRoles === member.person_id ? (
                <span style={actionsRowStyle}>
                  {GRANTABLE.map((role) => (
                    <Checkbox
                      checked={draftRoles.includes(role)}
                      key={role}
                      label={t(locale, `common.staff.role.${role}`)}
                      onChange={() => setDraftRoles((current) => toggleRole(current, role))}
                    />
                  ))}
                  <Button
                    data-testid={`save-roles-${member.person_id}`}
                    disabled={draftRoles.length === 0}
                    onClick={() =>
                      void json(`/api/v1/staff/${member.person_id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ roles: draftRoles }),
                      })
                        .then(() => {
                          setEditingRoles(null)
                          reload()
                        })
                        .catch(() => setRefusal(t(locale, 'common.staff.invite.failed')))
                    }
                  >
                    {t(locale, 'common.staff.actions.saveRoles')}
                  </Button>
                </span>
              ) : (
                <span style={actionsRowStyle}>
                  <Button
                    data-testid={`edit-roles-${member.person_id}`}
                    onClick={() => {
                      setEditingRoles(member.person_id)
                      setDraftRoles(member.roles.filter((role) => role !== 'owner'))
                    }}
                    variant="secondary"
                  >
                    {t(locale, 'common.staff.actions.editRoles')}
                  </Button>
                  {/* 2026-08-28: the owner row now carries the ROLE editor too — the
                      owner granting themselves lead_coach is how "the manager coaches
                      the groups I pick" starts. Ownership itself stays immovable: the
                      server re-adds it on every save, and deactivate is never offered. */}
                  {member.roles.includes('owner') ? null : (
                  <Button
                    data-testid={`deactivate-${member.person_id}`}
                    onClick={() =>
                      void apiFetch(`/api/v1/staff/${member.person_id}/deactivate`, {
                        method: 'POST',
                      }).then(async (response) => {
                        if (response.ok) {
                          reload()
                          return
                        }
                        const body = (await response.json().catch(() => null)) as {
                          detail?: { code?: string; details?: { groups?: string[] } }
                        } | null
                        // F5's decision surfaced: the server refuses to orphan a group.
                        setRefusal(
                          body?.detail?.code === 'sole_lead_coach'
                            ? t(locale, 'common.staff.deactivate.soleLead').replace(
                                '{groups}',
                                (body.detail.details?.groups ?? []).join(' · '),
                              )
                            : t(locale, 'common.staff.invite.failed'),
                        )
                      })
                    }
                    variant="destructive"
                  >
                    {t(locale, 'common.staff.actions.deactivate')}
                  </Button>
                  )}
                </span>
              ),
          },
        ]}
        empty={
          <Card>
            <p>{t(locale, 'common.staff.empty')}</p>
          </Card>
        }
        rowKey={(member) => member.person_id ?? `invited-${member.invitation_id}`}
        rows={payload.items}
      />
    </section>
  )
}
