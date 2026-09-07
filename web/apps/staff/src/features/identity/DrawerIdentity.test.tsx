// Owner-reported, 2026-09-07: the profile card read "מאמן עוזר · מאמן עוזר · ..." eleven
// times over, then "מנהל". §3.1 keys a role assignment by `(person, role, scope_type,
// scope_id)`, so a coach who works eleven groups genuinely holds eleven live rows of the
// same role — the list was never wrong about the data, only about what it was for.
//
// The server-side half is `studios_for_identity`'s missing DISTINCT (fixed alongside this,
// with its own test). This half matters because §10.2 lets a coach run from a session
// cached before that deploy, and the card would still be wrong for them.
import { describe, expect, it } from 'vitest'
import { t } from '@studio/i18n'
import { roleLabelsOf } from './DrawerIdentity'

describe('roleLabelsOf', () => {
  it('names a role once however many scopes it is held on', () => {
    const elevenGroups = Array.from({ length: 11 }, () => 'assistant_coach')
    expect(roleLabelsOf([...elevenGroups, 'manager'], 'he')).toEqual([
      t('he', 'common.staff.role.assistant_coach'),
      t('he', 'common.staff.role.manager'),
    ])
  })

  it('still lists genuinely different roles', () => {
    expect(roleLabelsOf(['owner', 'lead_coach'], 'he')).toHaveLength(2)
  })

  it('drops anything that is not one of §3.1s four roles', () => {
    // `roles` arrives from the wire, so a value this app does not know must not become a
    // raw `common.staff.role.whatever` on a coach's profile card.
    expect(roleLabelsOf(['assistant_coach', 'guardian', 'nonsense'], 'he')).toEqual([
      t('he', 'common.staff.role.assistant_coach'),
    ])
  })
})
