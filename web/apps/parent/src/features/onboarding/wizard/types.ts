// What the wizard holds between step 1 and the single write at step 3's final button.
//
// **Ids and values, never display labels.** The prototype's `Trainee` carries
// `grade: 'כיתה ד׳'` and `belt: 'חגורה לבנה-צהובה'` -- the words on the screen. That works
// when nothing is ever submitted; here these become `RegistrationIn`, so a label would have
// to be parsed back into an id at the seam. The screen formats; the state stores.

export type GradeKey =
  | 'kindergarten'
  | 'grade_1'
  | 'grade_2'
  | 'grade_3'
  | 'grade_4'
  | 'grade_5'
  | 'grade_6'
  | 'grade_7'
  | 'grade_8'
  | 'grade_9'
  | 'highschool'
  /** Bug #9 — after תיכון. `מסגרת` is half of this field's own label ('כיתה / מסגרת'), and
   *  a member between school and whatever comes next has one of those but not the other. */
  | 'post_highschool'

const GRADE_KEYS: readonly GradeKey[] = [
  'kindergarten',
  'grade_1',
  'grade_2',
  'grade_3',
  'grade_4',
  'grade_5',
  'grade_6',
  'grade_7',
  'grade_8',
  'grade_9',
  'highschool',
  'post_highschool',
]

/** Is this stored value one of the grades the picker can actually show?
 *
 *  `student.grade` is free text on the server and predates `GradeKey`, so a row written by
 *  an import, an older client or a manager typing into the staff app can hold anything. The
 *  gate's wizard pre-fill reads it (`App.tsx`), and a value outside this set must become an
 *  empty field the parent is asked to fill -- never a `<select>` holding an option that is
 *  not in its own list, which renders as blank and silently submits the wrong thing. */
export function isGradeKey(value: string | null | undefined): value is GradeKey {
  return value !== null && value !== undefined && (GRADE_KEYS as readonly string[]).includes(value)
}

export type HealthFund = 'clalit' | 'maccabi' | 'meuhedet' | 'leumit'

/** One training group as the group card needs it -- richer than the wizard's current
 *  `{id, name, weekdays}` (spec §10). */
export type WizardGroup = {
  readonly id: string
  readonly name: string
  readonly trackLabel: string
  readonly durationMin: number
  readonly scheduleLabel: string
  readonly coachesLabel: string
  readonly locationLabel: string
}

/** One rung of the CLUB's own ladder (bug #10). Mirrors `PublicBeltRankOut`
 *  (`app/routers/public.py`) minus the colours, which no wizard screen draws.
 *
 *  `id` and not a key: the eight-key list this replaced was the same eight for every club
 *  in the product, so a club that had built its own ladder in `5b` watched families
 *  register against belts it does not award. */
export type WizardBelt = {
  readonly id: string
  readonly name: string
}

/** A price plan as the plan card needs it. `pricePerMonthAgorot` and not shekels: money is
 *  stored in agorot everywhere in this product and a float never enters the state. */
export type WizardPlan = {
  readonly id: string
  readonly title: string
  readonly subtitle: string
  readonly pricePerMonthAgorot: number
  readonly features: readonly string[]
  readonly isRecommended?: boolean
  readonly badge?: string
}

export type PickupArrangement = {
  parentOnly: boolean
  extraName: string
  extraPhone: string
}

/** הורה 2. Every field optional, including the name — a family with one parent is not an
 *  incomplete family, and the API's `other_parent` is `null` for exactly that. Held as a
 *  nested object rather than four more flat `otherParent*` keys so "is there a second
 *  parent at all" is one question with one answer, which is what the tab strip asks. */
export type OtherParentDraft = {
  firstName: string
  lastName: string
  nationalId: string
  phone: string
}

export type StudentDraft = {
  id: string
  firstName: string
  lastName: string
  nationalId: string
  birthDate: string
  address: string
  city: string
  email: string
  /** The member's OWN mobile. Bug #28 — asked only of an adult, who is their own account
   *  holder: a minor's number reaches the club through `guardianPhone`, and the club rings
   *  the parent. Without it `toRegisterPayload` had nothing to fall back to and wrote a
   *  NULL `Person.phone` for every adult who registered themselves, which is the number
   *  that "did not load" on the profile screen. */
  phone: string
  grade: GradeKey | ''
  beltId: string
  /** `שנת עליה`, the STUDENT's own. Optional and free-form, like the paper form's block 4.
   *  A self-guarding adult is asked once and it travels as the signer's — see
   *  `toRegisterPayload`, and the note in the API's `save_registration` on why that
   *  matters when both write the same `Person` row. */
  aliyahYear: string
  guardianFirstName: string
  guardianLastName: string
  guardianNationalId: string
  guardianPhone: string
  guardianEmail: string
  /** The GUARDIAN's `שנת עליה`. Optional, and asked only when there is a guardian block to
   *  ask it in — an adult member answers the student one above and nothing else. */
  guardianAliyahYear: string
  /** הורה 2, or `null` when the family has not added one. Minors only: nobody else's name
   *  belongs on an adult's own registration. */
  otherParent: OtherParentDraft | null
  pickup: PickupArrangement
  groupId: string
  planId: string
  /** Joining the club, or coming for one lesson first.
   *
   * **Decided when the child is ADDED, not at the payment step.** A trial is not a way of
   * paying — it is the family saying this child is not joining yet — so it is chosen on
   * the button that adds them and it keeps them out of step 3 entirely. Putting it beside
   * אשראי/מזומן/צ׳קים/הו״ק was the first attempt and it was wrong: it asked a parent how
   * they would like to pay for something that costs nothing (owner, 2026-09-11).
   *
   * It also must never reach `student.payment_method`, whose database CHECK holds only
   * ('upay_card','cash','cheque','standing_order') — a trial child simply has none, which
   * is what that column is nullable for. */
  intent: 'join' | 'trial'
  emergencyPhone: string
  healthFund: HealthFund | ''
  /** `null` until the family answers. NOT `true`: the prototype defaults this to "healthy"
   *  and pre-answers all thirteen questions, so a safety declaration completes itself by
   *  pressing Next five times (§14.1). */
  healthyPreset: boolean | null
  healthAnswers: Record<string, boolean | string | null>
  medicalNotes: string
  /** Unticked. The prototype pre-ticks it, and a pre-ticked box is not consent. */
  attested: boolean
  signatureDataUrl: string
}

export type WizardStepKey = 1 | 2 | 3 | 4
export type FormPart = 1 | 2 | 3 | 4 | 5

/** Under 18 on the day it is asked. Derived, never stored and never a question.
 *
 *  **An unknown age is a minor.** `ageFrom('')` is `NaN` and `NaN < 18` is `false`, so a
 *  blank form would render in the ADULT shape -- no school class, no guardian block at
 *  all -- until a date is typed. Defaulting the other way asks for more rather than less,
 *  and an adult reveals themselves the moment they enter a birthdate. */
export function isMinor(birthDate: string, today = new Date()): boolean {
  const age = ageFrom(birthDate, today)
  return Number.isNaN(age) || age < 18
}

/** Whole years, or `null` when the date is missing or unparseable. Returns a NUMBER --
 *  the prototype returns the formatted string `" (בן 11)"` and its caller wraps that in
 *  `קטין (גיל …)` again, printing `קטין (גיל  (בן 11))` (§14.2). */
export function ageFrom(birthDate: string, today = new Date()): number {
  if (!birthDate) return Number.NaN
  const born = new Date(birthDate)
  if (Number.isNaN(born.getTime())) return Number.NaN
  let age = today.getFullYear() - born.getFullYear()
  const monthDelta = today.getMonth() - born.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < born.getDate())) age -= 1
  return age
}

/** §8.1 -- what puts a child in front of a manager and stops their charge.
 *
 *  Derived from the ANSWERS, not from the preset. The prototype short-circuits on
 *  `healthyPreset === false`, so a family that picks "there is a limitation" and then
 *  answers all thirteen questions "no" stays flagged with nothing on screen saying why and
 *  no way back except re-clicking the preset, which wipes their answers.
 *
 *  `medicalNotes` is NOT a trigger. The prototype flags any non-empty note, so "wears
 *  glasses during fitness training" suspends a registration and stops a charge. */
export function needsManagerReview(student: Pick<StudentDraft, 'healthAnswers'>): boolean {
  return Object.values(student.healthAnswers).some((answer) => answer === true)
}

export function emptyStudent(id: string, defaults?: Partial<StudentDraft>): StudentDraft {
  return {
    id,
    firstName: '',
    lastName: '',
    nationalId: '',
    birthDate: '',
    address: '',
    city: '',
    email: '',
    phone: '',
    grade: '',
    beltId: '',
    aliyahYear: '',
    guardianFirstName: '',
    guardianLastName: '',
    guardianNationalId: '',
    guardianPhone: '',
    guardianEmail: '',
    guardianAliyahYear: '',
    otherParent: null,
    pickup: { parentOnly: true, extraName: '', extraPhone: '' },
    groupId: '',
    planId: '',
    intent: 'join',
    emergencyPhone: '',
    healthFund: '',
    healthyPreset: null,
    healthAnswers: {},
    medicalNotes: '',
    attested: false,
    signatureDataUrl: '',
    ...defaults,
  }
}

/** Agorot to a Hebrew-formatted shekel string. Money is integer agorot everywhere in this
 *  product; this is the only place it becomes a display value, and it never becomes a
 *  float on the way. */
export function formatShekels(agorot: number): string {
  return Math.round(agorot / 100).toLocaleString('he-IL')
}

export type PaymentMethod = 'credit' | 'cash' | 'cheque' | 'standing_order'

/** How the family says they will pay. Three of the four are `payment_promise.method`
 *  verbatim -- `app/models/payment_promise.py` constrains it to
 *  ('cash', 'cheque', 'standing_order') and its docstring describes exactly this
 *  conversation. The fourth goes to uPay as a real payment order. */
export const PROMISE_METHODS: readonly PaymentMethod[] = ['cash', 'cheque', 'standing_order']
