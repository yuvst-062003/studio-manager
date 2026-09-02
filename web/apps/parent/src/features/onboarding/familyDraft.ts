// Step 2's flat-list state and its mapping to the wire format. Pure logic, kept
// separate from the component so the validation/mapping rules are testable without
// mounting anything -- the same split JoinFamilyStep.tsx's old inline `valid` useMemo
// and `submit()` never had.
//
// Wire format unchanged (per the spec): `JoinFamilyPayload`'s shape and the
// `POST /api/v1/onboarding/<token>/register` body do not change. The "18+" answer only
// decides which UI sections render (parent-of-record / pickup) -- it is never sent to
// the server, and a non-self child's required fields (name, birthdate, national id,
// grade) are the same regardless of it: `required_registration_fields`
// (app/services/health/agreement.py) only drops `grade` for a self-guarding student,
// and a parent-submitted "18+" child is never self-guarding (the parent's account is
// what registered them).
import { isValidNationalId } from '../health/nationalId'
import type { GuardianRelation, JoinFamilyPayload } from './JoinFamilyStep'

export type SubjectRow = {
  key: string
  kind: 'self' | 'child'
  firstName: string
  lastName: string
  birthdate: string
  groupIds: string[]
  /** The explicit "18 or older?" answer for a `child` row. Meaningless for `self`
   *  (the signer is always an adult by construction). Defaults `false` -- a fresh row
   *  is a minor until answered otherwise, so the shared parent/pickup section shows by
   *  default rather than a family having to opt into it. */
  isAdult: boolean
  nationalId: string
  grade: string
}

export function emptySubjectRow(kind: 'self' | 'child'): SubjectRow {
  return {
    key: crypto.randomUUID(),
    kind,
    firstName: '',
    lastName: '',
    birthdate: '',
    groupIds: [],
    isAdult: false,
    nationalId: '',
    grade: '',
  }
}

/** Any row still counted as a minor (not "self", and not answered "18+"). Drives the
 *  shared parent-info/pickup section -- one section for every minor, no per-row
 *  toggle, per the 2026-09-03 correction (no backend field to write a per-child
 *  divergence to). */
export function hasSharedMinors(rows: SubjectRow[]): boolean {
  return rows.some((row) => row.kind === 'child' && !row.isAdult)
}

function rowValid(row: SubjectRow): boolean {
  if (row.groupIds.length === 0) return false
  if (row.kind === 'self') return true
  return (
    row.firstName.trim() !== '' &&
    row.birthdate.trim() !== '' &&
    isValidNationalId(row.nationalId) &&
    row.grade.trim() !== ''
  )
}

export type FamilyFormState = {
  signerNationalId: string
  address: string
  city: string
  phone: string
  rows: SubjectRow[]
  otherFullName: string
  otherNationalId: string
  relation: GuardianRelation
}

export function familyFormValid(state: FamilyFormState): boolean {
  if (state.rows.length === 0) return false
  if (
    !isValidNationalId(state.signerNationalId) ||
    state.address.trim() === '' ||
    state.city.trim() === '' ||
    state.phone.trim() === ''
  ) {
    return false
  }
  if (hasSharedMinors(state.rows)) {
    if (state.relation === 'other') {
      if (state.otherFullName.trim() === '' || !isValidNationalId(state.otherNationalId)) {
        return false
      }
    } else if (
      state.otherNationalId.trim() !== '' &&
      !isValidNationalId(state.otherNationalId)
    ) {
      return false
    }
  }
  return state.rows.every(rowValid)
}

export type FamilyPayloadState = FamilyFormState & {
  phoneHome?: string
  aliyahYear?: string
  otherPhone?: string
  pickups?: { name: string; phone: string }[]
}

export function toJoinFamilyPayload(
  displayName: string,
  state: FamilyPayloadState,
): JoinFamilyPayload {
  const parts = displayName.trim().split(/\s+/)
  const first = parts[0] ?? ''
  const last = parts.slice(1).join(' ')
  const shared = hasSharedMinors(state.rows)
  const [otherFirst = '', ...otherRest] = state.otherFullName.trim().split(/\s+/)
  const pickupContacts = (state.pickups ?? [])
    .map((entry) => ({ name: entry.name.trim(), phone: entry.phone.trim() }))
    .filter((entry) => entry.name !== '')

  return {
    first_name: first,
    last_name: last,
    phone: state.phone.trim() || null,
    signer: {
      national_id: state.signerNationalId.trim(),
      address: state.address.trim(),
      city: state.city.trim(),
      phone_home: state.phoneHome?.trim() || null,
      aliyah_year: state.aliyahYear?.trim() || null,
      relation: state.relation,
    },
    other_parent:
      shared && (state.otherFullName.trim() || state.relation === 'other')
        ? {
            first_name: otherFirst,
            last_name: otherRest.join(' ') || null,
            national_id: state.otherNationalId.trim() || null,
            phone: state.otherPhone?.trim() || null,
          }
        : null,
    pickup_contacts: shared ? pickupContacts : [],
    children: state.rows.map((row) => {
      if (row.kind === 'self') {
        return {
          first_name: first,
          last_name: last,
          birthdate: null,
          group_ids: row.groupIds,
          self_student: true,
          national_id: null,
          grade: null,
        }
      }
      const [childFirst = '', ...childRest] = row.firstName.trim().split(/\s+/)
      return {
        first_name: childFirst,
        last_name: childRest.join(' ') || last,
        birthdate: row.birthdate || null,
        group_ids: row.groupIds,
        self_student: false,
        national_id: row.nationalId.trim() || null,
        grade: row.grade.trim() || null,
      }
    }),
  }
}
