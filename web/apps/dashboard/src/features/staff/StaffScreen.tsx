// Dashboard artboard 3d — צוות: weekly load, permissions, and classes with no coach.
//
// Two of 3d's columns are honestly out of M1's reach and say so on the screen rather than
// being faked:
//
//   שעות שבוע — weekly load is group_schedule_rule × session, both W2 contract models.
//               The cell reads '—' and the header carries the reason. A 0 would be a
//               measurement, and would read as an idle coach.
//   the banner — 3d draws '2 שיעורים השבוע ללא מאמן'. Sessions do not exist yet, so M1
//               answers the same question one level up: which GROUPS have no coach. That
//               is the defect the banner is for. W2's SCHEDULE lane sharpens it.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiFetch } from '@studio/core'
import { Alert, Card, StatusChip } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

type StaffGroup = { id: string; name: string }

type StaffMember = {
  person_id: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  roles: string[]
  groups: StaffGroup[]
  weekly_hours: number | null
  permissions: string[]
  status: string
}

type StaffPayload = { items: StaffMember[]; groups_without_coach: StaffGroup[] }

const tableStyle: CSSProperties = {
  inlineSize: '100%',
  borderCollapse: 'collapse',
  // §6.4 is desktop-first, but a manager checking cover on a phone is a normal case: the
  // table scrolls inside its own box rather than widening the page.
  minInlineSize: '48rem',
}

const scrollStyle: CSSProperties = { overflowX: 'auto', maxInlineSize: '100%' }

const cellStyle: CSSProperties = {
  paddingBlock: 'var(--space-3)',
  paddingInline: 'var(--space-3)',
  borderBlockEnd: 'var(--border-width-hairline) solid var(--border)',
  textAlign: 'start',
  verticalAlign: 'top',
}

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

function displayName(member: StaffMember, locale: Locale): string {
  const name = [member.first_name, member.last_name].filter(Boolean).join(' ').trim()
  // A pending invitation has no Person, so the address IS the identity — and printing an
  // empty cell would make the row look broken rather than pending.
  return name || member.email || t(locale, 'common.staff.status.invited')
}

export function StaffScreen({ locale }: { locale: Locale }) {
  const [payload, setPayload] = useState<StaffPayload | null>(null)
  const [failed, setFailed] = useState(false)

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
  }, [])

  if (failed) {
    return (
      <section aria-labelledby="staff-title">
        <h2 id="staff-title">{t(locale, 'common.staff.title')}</h2>
        <Alert tone="danger" iconLabel={t(locale, 'common.dev.noticeIcon')}>
          {t(locale, 'common.setup.loadFailed')}
        </Alert>
      </section>
    )
  }
  if (payload === null) return <p data-testid="staff-loading">{t(locale, 'common.setup.loading')}</p>

  const uncovered = payload.groups_without_coach

  return (
    <section aria-labelledby="staff-title">
      <header>
        <h2 id="staff-title">{t(locale, 'common.staff.title')}</h2>
        <p data-testid="staff-count">
          {t(locale, 'common.staff.count').replace('{n}', String(payload.items.length))}
        </p>
      </header>

      {uncovered.length > 0 ? (
        <div data-testid="staff-uncovered">
          <Alert tone="danger" iconLabel={t(locale, 'common.dev.noticeIcon')}>
            {t(locale, 'common.staff.uncovered.title').replace('{n}', String(uncovered.length))} ·{' '}
            {uncovered.map((group) => group.name).join(' · ')}
          </Alert>
        </div>
      ) : (
        <p data-testid="staff-covered">{t(locale, 'common.staff.uncovered.none')}</p>
      )}
      {/* Named rather than silently missing. A manager who knows 3d shows sessions will
          otherwise read the group-level banner as a regression. */}
      <p data-testid="staff-sessions-note">{t(locale, 'common.staff.uncovered.sessionsLater')}</p>

      {payload.items.length === 0 ? (
        <Card>
          <p>{t(locale, 'common.staff.empty')}</p>
        </Card>
      ) : (
        <div style={scrollStyle}>
          <table style={tableStyle}>
            <caption>{t(locale, 'common.staff.title')}</caption>
            <thead>
              <tr>
                <th scope="col" style={cellStyle}>
                  {t(locale, 'common.staff.col.person')}
                </th>
                <th scope="col" style={cellStyle}>
                  {t(locale, 'common.staff.col.role')}
                </th>
                <th scope="col" style={cellStyle}>
                  {t(locale, 'common.staff.col.groups')}
                </th>
                <th scope="col" style={cellStyle}>
                  {t(locale, 'common.staff.col.hours')}
                  {/* The reason lives beside the column it explains, not in a footnote. */}
                  <span data-testid="staff-hours-note"> · {t(locale, 'common.staff.hoursUnknown')}</span>
                </th>
                <th scope="col" style={cellStyle}>
                  {t(locale, 'common.staff.col.permissions')}
                </th>
                <th scope="col" style={cellStyle}>
                  {t(locale, 'common.staff.col.status')}
                </th>
              </tr>
            </thead>
            <tbody>
              {payload.items.map((member) => (
                <tr key={member.person_id ?? `invited-${member.email}`}>
                  <th scope="row" style={cellStyle}>
                    {displayName(member, locale)}
                  </th>
                  <td style={cellStyle}>
                    {member.roles
                      .map((role) => t(locale, `common.setup.staff.role.${role}`))
                      .join(' · ')}
                  </td>
                  <td style={cellStyle}>
                    {member.groups.length === 0
                      ? t(locale, 'common.staff.noGroups')
                      : member.groups.map((group) => group.name).join(' · ')}
                  </td>
                  <td style={cellStyle} data-testid="staff-hours-cell">
                    {member.weekly_hours ?? t(locale, 'common.staff.noHours')}
                  </td>
                  <td style={cellStyle}>
                    <ul style={chipRowStyle}>
                      {member.permissions.map((permission) => (
                        <li key={permission} style={chipStyle}>
                          {t(locale, `common.staff.perm.${permission}`)}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td style={cellStyle}>
                    {/* 4h's six statuses are the product's own vocabulary; `paid` and
                        `pending` are the two that mean settled and awaiting-someone-else,
                        which is exactly active vs invited. */}
                    <StatusChip
                      status={member.status === 'active' ? 'paid' : 'pending'}
                      label={t(locale, `common.staff.status.${member.status}`)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
