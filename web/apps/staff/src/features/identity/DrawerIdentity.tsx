// Staff artboard 9e's permission-boundaries teaching, and the role-label helper the
// account tab's own profile card (`AccountScreen.tsx`) shares with it.
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
//
// The identity block ITSELF (name, role, classes coached) moved into `AccountScreen.tsx`'s
// own profile card with the 2026-09-06 redesign — it needed to sit beside an avatar, phone
// and email that this file never had. `roleLabelsOf` is what is left of it here: the exact
// same role-filtering `DrawerIdentity` used, kept as one function so the card's `text-lg
// font-black` name line and `permission-locked-row`'s footnote never compute "which roles
// count" two different ways.
import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

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

/** The roles 9e/the profile card actually name — never `has_health_access` or the like. */
export function roleLabelsOf(roles: string[], locale: Locale): string[] {
  // **Deduplicated, and not only because the server now does it too.** §3.1 keys a role
  // assignment by scope, so a coach working eleven groups holds eleven `assistant_coach`
  // rows; `studios_for_identity` lacked DISTINCT and the profile card printed 'מאמן עוזר'
  // eleven times. The server is fixed -- but §10.2 means a coach can be running from a
  // session cached before that deploy, and a label list is a projection of what someone
  // IS either way. Deduping here costs one Set and makes the screen right regardless.
  return [...new Set(roles)]
    .filter((role) => ['owner', 'manager', 'lead_coach', 'assistant_coach'].includes(role))
    .map((role) => t(locale, `common.staff.role.${role}`))
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
