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
import { Alert, Card, LoadFailed, StatusChip, Table } from '@studio/ui'
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
  const [attempt, setAttempt] = useState(0)

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
            setAttempt((n) => n + 1)
          }}
        />
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

      {/* F1b — the primitive owns the widths, the caption, the scroll container and
          the sub-768px card fallback, so "a manager checking cover on a phone" stops
          being a sideways scroller (F11). */}
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
            width: '14rem',
            cell: (member) =>
              member.groups.length === 0
                ? t(locale, 'common.staff.noGroups')
                : member.groups.map((group) => group.name).join(' · '),
          },
          {
            id: 'hours',
            header: (
              <>
                {t(locale, 'common.staff.col.hours')}
                {/* The reason lives beside the column it explains, not in a footnote. */}
                <span data-testid="staff-hours-note"> · {t(locale, 'common.staff.hoursUnknown')}</span>
              </>
            ),
            width: '10rem',
            cell: (member) => (
              <span data-testid="staff-hours-cell">
                {member.weekly_hours ?? t(locale, 'common.staff.noHours')}
              </span>
            ),
          },
          {
            id: 'permissions',
            header: t(locale, 'common.staff.col.permissions'),
            width: '16rem',
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
              // 4h's six statuses are the product's own vocabulary; `paid` and `pending`
              // are the two that mean settled and awaiting-someone-else, which is
              // exactly active vs invited.
              <StatusChip
                status={member.status === 'active' ? 'paid' : 'pending'}
                label={t(locale, `common.staff.status.${member.status}`)}
              />
            ),
          },
        ]}
        empty={
          <Card>
            <p>{t(locale, 'common.staff.empty')}</p>
          </Card>
        }
        rowKey={(member) => member.person_id ?? `invited-${member.email}`}
        rows={payload.items}
      />
    </section>
  )
}
