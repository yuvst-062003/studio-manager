// Step 2's per-student-panel state and its mapping to the wire format. Pure logic, kept
// separate from the component so the validation/mapping/plan-coverage rules are testable
// without mounting anything.
//
// **F6 -- one row is a panel, not a form field.** `JoinFamilyStep.tsx` owns which row's
// panel is currently open (`editingKey`, transient UI state that has no business in a
// draft persisted to `localStorage`); this module owns what is IN each row and how a
// finished list of rows becomes the wire payload.
//
// **Wave E -- the trial field set (decision 8).** §3's door table gives doors A/B/C one
// field set for the WHOLE run, but Door D's own spec is explicit that its choice is "a
// control INSIDE that panel" -- a member sibling and a trial sibling can share one wizard
// run. A trial row asks full name, birthdate, ONE group and a slot -- never ת.ז., never
// address, never a plan (decision 8: "a stranger booking a free lesson should not hand
// over a minor's national ID"). `rowValid` branches on `fieldSet` below; `resolveRowFamily`
// never runs for a trial row (`isMinorChildRow` treats it as never a "family" row at all,
// so the second-parent/pickup machinery, which decision 8 does not ask of this door, is
// simply never reached for it) -- and `toJoinFamilyPayload`/`toTrialChildPayloads` are the
// two halves of the split at submit time.
//
// **Decision 12/F8 -- there is no 18+ toggle.** `isRowAdult` derives it from the row's own
// `birthdate` (`self` rows are adult by construction -- the signer who is filling the
// wizard). Nothing here sends the derived flag to the server either: it only decides which
// UI a row shows and, through that, whether `other_parent`/`pickup_contacts` end up
// non-empty in the payload -- exactly the same mechanism `isAdult` used to be, with the
// answer read off a fact the parent already typed instead of a second question.
//
// **F7 -- second parent and pickup are per row**, not one family-wide pair. A row's own
// `otherFullName`/`otherNationalId`/`otherPhone`/`pickups` are what THAT student answered.
// `sameAsPrevious` is a live link to the nearest earlier minor row rather than a value
// copied once: `resolveRowFamily` walks backward through the list every time it is asked,
// so editing an earlier minor's details is reflected in every later row still linked to it,
// and unticking a later row's checkbox is what makes it diverge (its own fields, frozen at
// whatever they last resolved to, become editable).
import { isValidNationalId } from '../health/nationalId'
import type { GuardianRelation, JoinFamilyPayload } from './JoinFamilyStep'

export type PickupContact = { name: string; phone: string }

/** The door-variance hook (wave E). §3's door table gives doors A/B/C one field set for
 *  the WHOLE run (trial vs member), but door D's own spec is explicit that its choice is
 *  "a control INSIDE that panel, not a screen of its own" -- one wizard run there can mix
 *  a member sibling and a trial sibling. That is a per-STUDENT fact, not a per-step one,
 *  which is why this lives on `SubjectRow` rather than as a prop on `JoinFamilyStep`: a
 *  step-level prop cannot express Door D's per-row mix at all, and building one anyway
 *  would have to be undone rather than extended. `'trial'` (wave E, decision 8) swaps
 *  ת.ז./grade/plan/second-parent/pickup for a single group and a slot -- see `rowValid`. */
export type StudentFieldSet = 'member' | 'trial'

export type SubjectRow = {
  key: string
  kind: 'self' | 'child'
  /** See `StudentFieldSet`. */
  fieldSet: StudentFieldSet
  firstName: string
  lastName: string
  birthdate: string
  groupIds: string[]
  nationalId: string
  grade: string
  /** Decision 14 -- this student's own plan. `null` until one is picked (or until at
   *  least one covering plan exists to preselect); a submission with no live plans in
   *  the studio leaves this `null` on every row, same as the server's own
   *  `plan_for_volume` returning `None`. Meaningless for a `'trial'` row -- decision 8
   *  asks no plan of a trial student. */
  pricePlanId: string | null
  /** Decision 8 -- a trial row's own slot, chosen "under the group that filters it",
   *  inside the same panel. `null` until picked, or when the chosen group has no
   *  bookable session (the server accepts a booking with no session id). Meaningless
   *  for a `'member'` row. */
  sessionId: string | null
  /** F7's per-row second-parent/pickup fields. Meaningless (and never shown) for a
   *  `self` row, a `'trial'` row (decision 8 asks none of this) or a row whose derived
   *  age is 18+ -- see `isRowAdult`. When `sameAsPrevious` is true these are stale
   *  placeholders, not the effective values; read through `resolveRowFamily`, never
   *  these fields directly. */
  otherFullName: string
  otherNationalId: string
  otherPhone: string
  pickups: PickupContact[]
  /** F7 -- "אותם פרטים כמו הקודם". Defaults to `true` at row-creation time when a
   *  previous minor already exists in the list (`emptySubjectRow`'s caller decides
   *  this, since only the component knows the list at the moment of adding); ticking
   *  it off is what lets two siblings diverge. */
  sameAsPrevious: boolean
}

export function emptySubjectRow(
  kind: 'self' | 'child',
  sameAsPrevious = false,
  fieldSet: StudentFieldSet = 'member',
): SubjectRow {
  return {
    key: crypto.randomUUID(),
    kind,
    fieldSet,
    firstName: '',
    lastName: '',
    birthdate: '',
    groupIds: [],
    nationalId: '',
    grade: '',
    pricePlanId: null,
    sessionId: null,
    otherFullName: '',
    otherNationalId: '',
    otherPhone: '',
    pickups: [],
    sameAsPrevious,
  }
}

/** A birthdate string (`YYYY-MM-DD`) → whether that person is 18 or older as of `today`.
 *  An unparsable or empty birthdate reads as "not yet 18" -- a fresh row with no
 *  birthdate typed is a minor until proven otherwise, same default the old explicit
 *  toggle used (defaulting to "no"), so the family/pickup section a parent is about to
 *  need does not flicker away and back as they type. */
export function isAdultBirthdate(birthdate: string, today: Date = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthdate.trim())
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const eighteenthBirthday = new Date(year + 18, month - 1, day)
  return eighteenthBirthday.getTime() <= today.getTime()
}

/** Decision 12 -- age is derived, never asked. `self` rows are always adult (the signer
 *  filling the wizard is one, by construction); `child` rows derive it from `birthdate`. */
export function isRowAdult(row: SubjectRow, today: Date = new Date()): boolean {
  return row.kind === 'self' || isAdultBirthdate(row.birthdate, today)
}

function isMinorChildRow(row: SubjectRow, today: Date): boolean {
  // A trial row (decision 8) is never a "family" row -- it asks no second parent, no
  // pickup contacts, whatever its age. Excluding it here is what keeps
  // `resolveRowFamily` and the whole second-parent/pickup UI from ever running for it.
  return row.kind === 'child' && row.fieldSet !== 'trial' && !isRowAdult(row, today)
}

/** Any row still counted as a minor. Drives the signer card's "אני: האם/האב/קרוב אחר"
 *  control, which is a family-wide fact (who the SIGNER is) and stays shared even though
 *  the second-parent/pickup answers underneath it are now per row (F7). */
export function hasSharedMinors(rows: SubjectRow[], today: Date = new Date()): boolean {
  return rows.some((row) => isMinorChildRow(row, today))
}

/** Whether a NEW minor row, if added right now, would have an earlier minor to default
 *  "אותם פרטים כמו הקודם" against. The component calls this once, at add-time, to seed
 *  `emptySubjectRow`'s `sameAsPrevious` -- ticked by default exactly when this is true. */
export function hasPreviousMinor(rows: SubjectRow[], today: Date = new Date()): boolean {
  return hasSharedMinors(rows, today)
}

export type ResolvedFamily = {
  otherFullName: string
  otherNationalId: string
  otherPhone: string
  pickups: PickupContact[]
}

const EMPTY_FAMILY: ResolvedFamily = {
  otherFullName: '',
  otherNationalId: '',
  otherPhone: '',
  pickups: [],
}

/** The EFFECTIVE second-parent/pickup details for `rows[index]` -- what a payload or a
 *  validation check must read, never the row's own fields directly. Not a minor, or not a
 *  `child` row at all: empty, unconditionally (a `self` row and an 18+ "child" row never
 *  carry this data, whatever happens to be sitting in their fields). A minor with
 *  `sameAsPrevious` set walks backward to the nearest earlier minor row and resolves
 *  THROUGH it recursively -- so a chain of three siblings all ticked "same as previous"
 *  all resolve to the first one's own typed values, and editing the first is reflected in
 *  every descendant still linked to it. Backward-only, so the recursion always
 *  terminates -- a row can never (transitively) point at itself. */
export function resolveRowFamily(
  rows: SubjectRow[],
  index: number,
  today: Date = new Date(),
): ResolvedFamily {
  const row = rows[index]
  if (!row || !isMinorChildRow(row, today)) return EMPTY_FAMILY
  if (row.sameAsPrevious) {
    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = rows[i]
      if (candidate && isMinorChildRow(candidate, today)) {
        return resolveRowFamily(rows, i, today)
      }
    }
    // Ticked, but no earlier minor exists (yet) to copy from -- an honest blank rather
    // than falling through to this row's own (equally blank) fields, which would look
    // identical here but diverge in intent the moment a real earlier minor DOES read
    // non-empty and this branch should have preferred it instead.
    return EMPTY_FAMILY
  }
  return {
    otherFullName: row.otherFullName,
    otherNationalId: row.otherNationalId,
    otherPhone: row.otherPhone,
    pickups: row.pickups,
  }
}

function rowValid(
  rows: SubjectRow[],
  index: number,
  relation: GuardianRelation,
  today: Date,
): boolean {
  const row = rows[index]
  if (!row) return false
  if (row.groupIds.length === 0) return false
  if (row.kind === 'self') return true
  if (row.firstName.trim() === '' || row.birthdate.trim() === '') return false
  // Decision 8 -- a trial row asks full name, birthdate and a group, full stop: no
  // ת.ז., no address, no grade, no second parent, no plan. `isMinorChildRow` already
  // reads `false` for a trial row, so the family block below never applies to one; this
  // is the earlier exit that skips the member-only ת.ז./grade checks too.
  if (row.fieldSet === 'trial') return true
  if (!isValidNationalId(row.nationalId)) return false
  if (row.grade.trim() === '') return false
  if (isMinorChildRow(row, today)) {
    const family = resolveRowFamily(rows, index, today)
    if (relation === 'other') {
      // §Step 2: "קרוב אחר is the one case where both slots open... the club genuinely
      // needs both names" -- neither parent is on file, so this row's second-parent
      // block is the only place either can be recorded.
      if (family.otherFullName.trim() === '' || !isValidNationalId(family.otherNationalId)) {
        return false
      }
    } else if (
      family.otherNationalId.trim() !== '' &&
      !isValidNationalId(family.otherNationalId)
    ) {
      return false
    }
  }
  return true
}

export type FamilyFormState = {
  signerNationalId: string
  address: string
  city: string
  phone: string
  rows: SubjectRow[]
  relation: GuardianRelation
}

export type FamilyFormValidOptions = {
  /** Door D (wave E): the signer is already a member -- their own ת.ז./address/city/
   *  phone are on file from an earlier registration and this door never asks for them
   *  again (there is a top signer CARD to hide along with this check; see
   *  `JoinFamilyStep`'s `showSignerDetails` prop). `true` (the default) preserves
   *  Doors B/C's existing behaviour exactly. */
  requireSignerDetails?: boolean
}

export function familyFormValid(
  state: FamilyFormState,
  today: Date = new Date(),
  options: FamilyFormValidOptions = {},
): boolean {
  const { requireSignerDetails = true } = options
  if (state.rows.length === 0) return false
  if (
    requireSignerDetails &&
    (!isValidNationalId(state.signerNationalId) ||
      state.address.trim() === '' ||
      state.city.trim() === '' ||
      state.phone.trim() === '')
  ) {
    return false
  }
  return state.rows.every((_row, index) => rowValid(state.rows, index, state.relation, today))
}

export type FamilyPayloadState = FamilyFormState & {
  phoneHome?: string
  aliyahYear?: string
}

export function toJoinFamilyPayload(
  displayName: string,
  state: FamilyPayloadState,
  today: Date = new Date(),
): JoinFamilyPayload {
  const parts = displayName.trim().split(/\s+/)
  const first = parts[0] ?? ''
  const last = parts.slice(1).join(' ')

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
    // Trial rows (decision 8) never reach the member registration shape -- see
    // `toTrialChildPayloads` for their own, separate write. `flatMap` rather than
    // `filter().map()` so `resolveRowFamily` still walks `state.rows` at each row's
    // ORIGINAL index -- a filtered-then-mapped array would renumber every row after the
    // first trial one and break the backward "same as previous" chain.
    children: state.rows.flatMap((row, index): JoinFamilyPayload['children'] => {
      if (row.fieldSet === 'trial') return []
      if (row.kind === 'self') {
        return [
          {
            first_name: first,
            last_name: last,
            birthdate: null,
            group_ids: row.groupIds,
            self_student: true,
            national_id: null,
            grade: null,
            price_plan_id: row.pricePlanId,
            other_parent: null,
            pickup_contacts: [],
          },
        ]
      }
      const [childFirst = '', ...childRest] = row.firstName.trim().split(/\s+/)
      const family = resolveRowFamily(state.rows, index, today)
      const pickupContacts = family.pickups
        .map((entry) => ({ name: entry.name.trim(), phone: entry.phone.trim() }))
        .filter((entry) => entry.name !== '')
      const [otherFirst = '', ...otherRest] = family.otherFullName.trim().split(/\s+/)
      return [
        {
          first_name: childFirst,
          last_name: childRest.join(' ') || last,
          birthdate: row.birthdate || null,
          group_ids: row.groupIds,
          self_student: false,
          national_id: row.nationalId.trim() || null,
          grade: row.grade.trim() || null,
          price_plan_id: row.pricePlanId,
          other_parent:
            family.otherFullName.trim() || state.relation === 'other'
              ? {
                  first_name: otherFirst,
                  last_name: otherRest.join(' ') || null,
                  national_id: family.otherNationalId.trim() || null,
                  phone: family.otherPhone.trim() || null,
                }
              : null,
          pickup_contacts: pickupContacts,
        },
      ]
    }),
  }
}

// -- decision 14: each student's own plan --------------------------------------------
export type PlanOption = {
  id: string
  name: string
  monthlyAmountAgorot: number
  sessionsPerWeek: number | null
}

/** C11's volume, read client-side from the SAME input the server derives it from: the
 *  weekdays each chosen group actually trains (`weekly_volume` in
 *  `app/services/people/attendance_pattern.py` sums `len(expected_weekdays(...))` per
 *  enrollment, and a fresh self-service enrollment always carries `attends_weekdays:
 *  None` -- "every session of the group" -- so that sum is exactly the chosen groups'
 *  weekday counts added together, which is all `JoinGroup.weekdays` already gives the
 *  client for free). */
export function weeklyVolumeForGroups(
  groupIds: string[],
  groups: readonly { id: string; weekdays: readonly number[] }[],
): number {
  const weekdayCountById = new Map(groups.map((group) => [group.id, group.weekdays.length]))
  return groupIds.reduce((total, id) => total + (weekdayCountById.get(id) ?? 0), 0)
}

/** §4 step 2 item 5: "only plans that cover the groups chosen". Mirrors
 *  `plan_for_volume`'s own coverage rule (`sessions_per_week IS NULL` is open membership
 *  and covers everything; otherwise `sessions_per_week >= volume`) -- this is a CLIENT-
 *  SIDE filter for what the picker offers, not the authority; `OnboardingService.register`
 *  re-checks coverage server-side and 422s a plan that does not cover, so a stale list
 *  here costs a round trip, never a mis-priced family. Cheapest first, name as the
 *  tiebreak, so the preselected plan (`preselectedPlanId`) is deterministic. */
export function coveringPlans(volume: number, plans: readonly PlanOption[]): PlanOption[] {
  if (volume <= 0) return []
  return plans
    .filter((plan) => plan.sessionsPerWeek === null || plan.sessionsPerWeek >= volume)
    .slice()
    .sort(
      (a, b) => a.monthlyAmountAgorot - b.monthlyAmountAgorot || a.name.localeCompare(b.name),
    )
}

/** "the matching one preselected" -- the cheapest plan that covers this volume, or `null`
 *  when nothing does (a real answer: a studio with no live plans, or none big enough,
 *  leaves the student unpriced, same as the server's own fallback). */
export function preselectedPlanId(volume: number, plans: readonly PlanOption[]): string | null {
  return coveringPlans(volume, plans)[0]?.id ?? null
}

// -- decision 8: the trial fork's own write shape -------------------------------------
export type TrialChildPayload = {
  first_name: string
  last_name: string
  birthdate: string | null
  group_id: string
  session_id: string | null
}

/** The mirror of `toJoinFamilyPayload` for `'trial'`-fieldSet rows -- `POST
 *  /trial-bookings/self`'s `children[]` shape (`TrialChildIn`), never the member
 *  registration shape. One group per trial row (decision 8: "group AND slot are both
 *  per student"), the first of `groupIds` if more than one was ever set (the panel only
 *  ever offers one for a trial row).
 *
 *  `contact` is Door D's self-row shortcut ("אני מתאמנ/ת גם ... their name, ת.ז. and
 *  address are already known") and Door A's ("`אני מתאמן/ת` ... reusing the name already
 *  typed in the contact block", decision 9): a `self` row has no name of its own to
 *  split, so it reuses whatever the caller already gave once, never asking twice. */
export function toTrialChildPayloads(
  rows: readonly SubjectRow[],
  contact: { firstName: string; lastName: string } = { firstName: '', lastName: '' },
): TrialChildPayload[] {
  return rows
    .filter((row) => row.fieldSet === 'trial')
    .map((row) => {
      const [first, last] =
        row.kind === 'self'
          ? [contact.firstName.trim(), contact.lastName.trim()]
          : (() => {
              const [f = '', ...rest] = row.firstName.trim().split(/\s+/)
              return [f, rest.join(' ')]
            })()
      return {
        first_name: first,
        last_name: last,
        birthdate: row.birthdate || null,
        group_id: row.groupIds[0] ?? '',
        session_id: row.sessionId,
      }
    })
}
