// Dashboard artboard 3d — צוות: from a read-only table into the lifecycle (F5).
//
// The invite returns its token EXACTLY once and the screen says so: no mailer exists
// anywhere in this product, so the manager shares the code the same way the platform's
// owner invite and §5.4b's onboarding link work. Weekly hours are measured now (F8) —
// the שעות שבוע column was '—' with an apology for two waves after sessions shipped.
//
// B4 (docs/design/proposals/dashboard-screens-redesign.md) — the header summary becomes
// three `StatTile`s (B4.1), `הרשאות` comes out of the table and into the `⋯` menu's role
// editor (B4.2), `קבוצות` becomes a capped `ChipList` (B4.3), and the four per-row actions
// — `עריכת תפקידים`, `קוד חדש`, `ביטול הזמנה`, `סיום העסקה` — collapse behind one
// `RowActions` trigger per row (B4.4). `./staff.css` carries the layout this needs.
import { useEffect, useState } from 'react'
import { apiFetch, fill } from '@studio/core'
import {
  Alert,
  Button,
  Card,
  ChipList,
  Checkbox,
  LoadFailed,
  PageHeader,
  RowActions,
  StatTile,
  StatusChip,
  Table,
  TextField,
} from '@studio/ui'
import type { RowAction } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import './staff.css'

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

// B4.3 — two group chips and a "+N", never nine names joined into a run-on string. Set
// here (rather than left at ChipList's own default of 3) to match the target's own
// worked example: nine groups render as two chips and a "+7".
const GROUPS_CHIP_MAX = 2

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
  // The per-person role editor, opened from RowActions' `עריכת תפקידים` (B4.2/B4.4). It
  // now carries the read-only permission list that used to be its own table column.
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
  if (payload === null)
    return <p data-testid="staff-loading">{t(locale, 'common.setup.loading')}</p>

  const uncovered = payload.groups_without_coach
  const totalHours = payload.items.reduce((sum, member) => sum + (member.weekly_hours ?? 0), 0)
  const people = payload.items.filter((member) => member.person_id !== null).length
  const coverageMessage =
    uncovered.length === 0
      ? t(locale, 'common.staff.uncovered.none')
      : t(locale, 'common.staff.uncovered.title').replace('{n}', String(uncovered.length))
  // F8's session-level count is a different measurement of the same fact (coverage) at a
  // finer grain than `uncovered` — it can be non-zero while every GROUP nominally has a
  // coach (a session-level gap, not a group-level one), so it cannot live inside the
  // `Alert` below: that only renders when `uncovered.length > 0` and would silently drop
  // this figure in exactly that case. The coverage tile always renders, so it goes there.
  const sessionsMessage =
    payload.sessions_without_coach > 0
      ? t(locale, 'common.staff.uncovered.sessions').replace(
          '{n}',
          String(payload.sessions_without_coach),
        )
      : undefined

  const toggleRole = (list: string[], role: string): string[] =>
    list.includes(role) ? list.filter((r) => r !== role) : [...list, role]

  function openRoleEditor(member: StaffMember) {
    setEditingRoles(member.person_id)
    setDraftRoles(member.roles.filter((role) => role !== 'owner'))
  }

  function saveRoles(member: StaffMember) {
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

  function resendInvitation(member: StaffMember) {
    void json(`/api/v1/staff/invitations/${member.invitation_id}/resend`, { method: 'POST' })
      .then((body) => setIssuedToken(body as { email: string; token: string }))
      .catch(() => setRefusal(t(locale, 'common.staff.invite.failed')))
  }

  function revokeInvitation(member: StaffMember) {
    void json(`/api/v1/staff/invitations/${member.invitation_id}`, { method: 'DELETE' })
      .then(() => reload())
      .catch(() => setRefusal(t(locale, 'common.staff.invite.failed')))
  }

  function deactivateMember(member: StaffMember) {
    void apiFetch(`/api/v1/staff/${member.person_id}/deactivate`, { method: 'POST' }).then(
      async (response) => {
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
      },
    )
  }

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
      {/* B4.1/B4.5 — one row: title and the primary action, instead of the four stacked,
          left-aligned lines (`<h2>`, the summary, the coverage prose, the button) this
          screen drew before. */}
      <PageHeader
        actions={
          inviting ? undefined : (
            <Button data-testid="invite-open" onClick={() => setInviting(true)}>
              {t(locale, 'common.staff.invite.title')}
            </Button>
          )
        }
        title={t(locale, 'common.staff.title')}
        titleId="staff-title"
      />

      {/* B4.1 — three StatTiles instead of one <h2>/<p> summary. The coverage tile wears
          `paid` or `debt` — the good state and the bad state are the same component in a
          different tone, not a bare <p> beside an <Alert>. */}
      <div className="staff-stats" data-testid="staff-stats">
        <StatTile label={t(locale, 'common.staff.stat.people')} value={people} />
        <StatTile label={t(locale, 'common.staff.stat.hours')} value={Math.round(totalHours)} />
        <StatTile
          hint={sessionsMessage}
          label={t(locale, 'common.staff.stat.coverage')}
          tone={uncovered.length === 0 ? 'paid' : 'debt'}
          value={coverageMessage}
        />
      </div>

      {/* The Alert with its per-group links stays, and appears only when coverage is
          incomplete — the covered state is now told entirely by the tile above it. */}
      {uncovered.length > 0 ? (
        <div data-testid="staff-uncovered">
          <Alert tone="danger" iconLabel={t(locale, 'common.dev.noticeIcon')}>
            {coverageMessage} ·{' '}
            {uncovered.map((group) => (
              // F4 — the alert names a problem the product now solves: each group links
              // to its schedule page, where the coach assignment lives.
              <a
                className="staff-uncovered-link"
                data-testid={`uncovered-group-${group.id}`}
                href={`#/groups/${group.id}`}
                key={group.id}
              >
                {group.name}
              </a>
            ))}
          </Alert>
        </div>
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
      ) : null}

      {refusal ? (
        <Alert live tone="danger" iconLabel={t(locale, 'common.dev.noticeIcon')}>
          <span data-testid="staff-refusal">{refusal}</span>
        </Alert>
      ) : null}

      {/* F1b — the primitive owns widths, caption, scroll and the card fallback.
          B4.2 — six columns, not seven: `הרשאות` moved into the role editor below.
          B4.3 — `קבוצות` is a capped ChipList, not nine names joined with ' · '.
          B4.4 — `actions` is one RowActions trigger per row, headed `common.staff.col.actions`
          rather than the `invite.roles` ("תפקידים") key the old header misused. */}
      <div className="staff-table">
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
              width: '9rem',
              cell: (member) =>
                member.roles
                  .map((role) => t(locale, `common.setup.staff.role.${role}`))
                  .join(' · '),
            },
            {
              id: 'hours',
              header: t(locale, 'common.staff.col.hours'),
              width: '6rem',
              cell: (member) => (
                // F8 — measured from this week's staffed sessions. A pending invitation
                // staffs nothing, and stays an em dash rather than a fake zero.
                <span data-testid="staff-hours-cell">
                  {member.weekly_hours ?? t(locale, 'common.staff.noHours')}
                </span>
              ),
            },
            {
              id: 'groups',
              header: t(locale, 'common.staff.col.groups'),
              width: '14rem',
              cell: (member) =>
                member.groups.length === 0 ? (
                  t(locale, 'common.staff.noGroups')
                ) : (
                  <ChipList
                    items={member.groups.map((group) => group.name)}
                    max={GROUPS_CHIP_MAX}
                    moreLabel={(n) => fill(t(locale, 'common.chips.more'), { count: n })}
                  />
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
              header: t(locale, 'common.staff.col.actions'),
              width: '10rem',
              cell: (member) => {
                const name = displayName(member, locale)
                const triggerLabel = fill(t(locale, 'common.staff.rowActions'), { name })

                if (member.invitation_id) {
                  const actions: RowAction[] = [
                    {
                      id: 'resend',
                      label: t(locale, 'common.staff.actions.resend'),
                      onSelect: () => resendInvitation(member),
                    },
                    {
                      id: 'revoke',
                      label: t(locale, 'common.staff.actions.revoke'),
                      onSelect: () => revokeInvitation(member),
                    },
                  ]
                  return <RowActions actions={actions} triggerLabel={triggerLabel} />
                }

                // `member.person_id !== null` guards against `editingRoles`'s closed-state
                // value (`null`) coincidentally matching a row that has no person yet —
                // this branch is for staffed members, who always carry a real id.
                if (member.person_id !== null && editingRoles === member.person_id) {
                  return (
                    <div
                      className="staff-role-editor"
                      data-testid={`role-editor-${member.person_id}`}
                    >
                      <fieldset className="staff-role-editor__roles">
                        <legend>{t(locale, 'common.staff.invite.roles')}</legend>
                        {GRANTABLE.map((role) => (
                          <Checkbox
                            checked={draftRoles.includes(role)}
                            key={role}
                            label={t(locale, `common.staff.role.${role}`)}
                            onChange={() => setDraftRoles((current) => toggleRole(current, role))}
                          />
                        ))}
                      </fieldset>
                      {/* B4.2 — the ten hand-styled pills a table cell used to carry now
                        live here, where permissions are edited anyway. */}
                      <div className="staff-role-editor__permissions">
                        <p className="staff-role-editor__permissions-label">
                          {t(locale, 'common.staff.col.permissions')}
                        </p>
                        <ul className="staff-permission-list">
                          {member.permissions.map((permission) => (
                            <li className="staff-permission-list__item" key={permission}>
                              {t(locale, `common.staff.perm.${permission}`)}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <Button
                        data-testid={`save-roles-${member.person_id}`}
                        disabled={draftRoles.length === 0}
                        onClick={() => saveRoles(member)}
                      >
                        {t(locale, 'common.staff.actions.saveRoles')}
                      </Button>
                    </div>
                  )
                }

                // 2026-08-28: the owner row now carries the ROLE editor too — the owner
                // granting themselves lead_coach is how "the manager coaches the groups
                // I pick" starts. Ownership itself stays immovable: the server re-adds it
                // on every save, and deactivate is never offered.
                const actions: RowAction[] = [
                  {
                    id: 'editRoles',
                    label: t(locale, 'common.staff.actions.editRoles'),
                    onSelect: () => openRoleEditor(member),
                  },
                ]
                if (!member.roles.includes('owner')) {
                  actions.push({
                    id: 'deactivate',
                    label: t(locale, 'common.staff.actions.deactivate'),
                    onSelect: () => deactivateMember(member),
                    destructive: true,
                  })
                }
                return <RowActions actions={actions} triggerLabel={triggerLabel} />
              },
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
      </div>
    </section>
  )
}
