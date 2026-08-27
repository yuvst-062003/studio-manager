// Staff artboard 9e — the drawer's two teaching blocks.
//
// **A locked capability is shown, not hidden.** 9e draws `מסמכים של חניכים`,
// `תשלומים וגבייה` and `מעבר חניך בין כיתות` greyed out with `לא זמין בהרשאה שלך` and a
// footnote naming who holds them — because showing the boundary teaches the role, while a
// silent fall-through reads as a bug. This is the same reconciliation 9c already made:
// `StaffStudentCard` tells an assistant coach who CAN move a student rather than hiding
// the control, and the drawer follows that choice.
//
// The list adapts to what is actually locked for THIS viewer: a lead coach can move a
// student (9c), so that row is not listed as locked for them.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { StaffPeopleClient } from '../people/peopleClient'

const blockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  paddingBlock: 'var(--space-2)',
  borderBlockStart: 'var(--border-width-hairline) solid var(--border)',
}

const mutedStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const lockedRowStyle: CSSProperties = {
  ...mutedStyle,
  display: 'flex',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
}

/** 9e's identity block: `שירה לוי · מאמנת · מתחילים · נוער` plus `הכיתות שלי N`. */
export function DrawerIdentity({
  locale,
  client,
  displayName,
  roles,
}: {
  locale: Locale
  client: StaffPeopleClient
  displayName: string | null
  roles: string[]
}) {
  const [groupNames, setGroupNames] = useState<string[]>([])

  useEffect(() => {
    let live = true
    client
      .myGroups()
      .then((body) => live && setGroupNames(body.items.map((group) => group.name)))
      .catch(() => live && setGroupNames([]))
    return () => {
      live = false
    }
  }, [client])

  const roleLabels = roles
    .filter((role) => ['owner', 'manager', 'lead_coach', 'assistant_coach'].includes(role))
    .map((role) => t(locale, `common.staff.role.${role}`))

  return (
    <div style={blockStyle} data-testid="drawer-identity">
      <p style={{ margin: 0 }}>
        <bdi>{displayName}</bdi>
        {roleLabels.length > 0 ? <span style={mutedStyle}> · {roleLabels.join(' · ')}</span> : null}
      </p>
      {groupNames.length > 0 ? (
        <p style={mutedStyle} data-testid="drawer-my-classes">
          {t(locale, 'common.identity.myClasses')} {groupNames.length} ·{' '}
          <bdi>{groupNames.join(' · ')}</bdi>
        </p>
      ) : null}
    </div>
  )
}

/** 9e's permission boundaries, greyed and named — never silently missing screens. */
export function PermissionBoundaries({
  locale,
  canMoveStudents,
}: {
  locale: Locale
  /** true for a lead coach — 9c gives them מעבר כיתה, so it is not locked for them. */
  canMoveStudents: boolean
}) {
  const locked = [
    'common.permission.documents',
    'common.permission.payments',
    ...(canMoveStudents ? [] : ['common.permission.moveStudent']),
  ]
  return (
    <div style={blockStyle} data-testid="permission-boundaries">
      {locked.map((key) => (
        <p key={key} style={lockedRowStyle} data-testid="permission-locked-row">
          <span>{t(locale, key)}</span>
          <span>{t(locale, 'common.permission.locked')}</span>
        </p>
      ))}
      <p style={mutedStyle}>{t(locale, 'common.permission.footnote')}</p>
    </div>
  )
}
