// The rules half of the import: what a row from the file means against THIS studio, and
// what stops it. Pure functions over plain data, so the screen holds nothing but drafts and
// the tests need neither a file nor a network.
//
// A `Draft` is one trainee as the review table holds it — the file's text already resolved
// to the studio's ids where a name matched, with the unmatched text kept beside it so the
// row can say what was written. Every cell is editable on the screen; editing a draft and
// re-running `problemsOf` is the whole model.
import type { RawRow } from './columns'
import { normalizeName } from './columns'

export type Payment = '' | 'cash' | 'cheque' | 'standing_order'

export type Draft = {
  /** Local only — the server's id does not exist until the button. */
  id: string
  line: number
  first_name: string
  last_name: string
  /** ISO day, `''` for none, `'invalid'` when the file's value could not be read. */
  birthdate: string
  parent_first: string
  parent_last: string
  email: string
  phone: string
  group_id: string
  belt_rank_id: string
  plan_id: string
  payment: Payment
  /** The file's words for the list columns, kept for the row to show when unmatched. */
  group_name: string
  belt_name: string
  plan_name: string
  payment_text: string
  /** A duplicate the manager chose to import anyway. */
  force: boolean
}

export type Lists = {
  groups: readonly { id: string; name: string; class_id?: string | null }[]
  /** §5.9's ladders hang off the CLASS, so the belt a row names is checked against the
   *  ladder of the class its group belongs to. */
  beltsByClass: Readonly<Record<string, readonly { id: string; name: string }[]>>
  plans: readonly { id: string; name: string }[]
  existing: readonly {
    first_name: string
    last_name: string
    birthdate: string | null
    guardian_display_names?: string[]
  }[]
}

export type Problem =
  | 'missing_first_name'
  | 'missing_contact'
  | 'bad_email'
  | 'bad_birthdate'
  | 'unknown_group'
  | 'unknown_belt'
  | 'belt_without_group'
  | 'unknown_plan'
  | 'bad_payment'
  | 'card_payment'
  | 'minor_without_parent'
  | 'duplicate'

export type Family = {
  key: string
  email: string
  parentName: string
  phone: string
  /** No parent named: the trainee is their own account (18+). */
  adult: boolean
  members: Draft[]
}

const ADULT_AGE = 18

/** The club's own three words for money that already arrived, in the spellings a keyboard
 *  and a word processor produce. `card` is recognised only to be refused: a card payment
 *  arrives through uPay and closes its own charge, so there is nothing to mark here. */
const PAYMENT_WORDS: Record<string, Payment | 'card'> = {
  'מזומן': 'cash',
  'cash': 'cash',
  "צ'ק": 'cheque',
  "צ'קים": 'cheque',
  'צקים': 'cheque',
  'cheque': 'cheque',
  'check': 'cheque',
  'cheques': 'cheque',
  'הוראת קבע': 'standing_order',
  'הו"ק': 'standing_order',
  'standing_order': 'standing_order',
  'standing order': 'standing_order',
  'אשראי': 'card',
  'כרטיס אשראי': 'card',
  'card': 'card',
  'upay_card': 'card',
}

export function paymentFromText(text: string): Payment | 'card' | 'unknown' {
  const key = normalizeName(text)
  if (key === '') return ''
  return PAYMENT_WORDS[key] ?? 'unknown'
}

const findByName = <T extends { name: string }>(items: readonly T[], name: string): T | undefined => {
  const wanted = normalizeName(name)
  return wanted === '' ? undefined : items.find((item) => normalizeName(item.name) === wanted)
}

export function classOfGroup(lists: Lists, groupId: string): string | null {
  return lists.groups.find((group) => group.id === groupId)?.class_id ?? null
}

export function beltsForGroup(lists: Lists, groupId: string): readonly { id: string; name: string }[] {
  const classId = classOfGroup(lists, groupId)
  return classId ? (lists.beltsByClass[classId] ?? []) : []
}

let nextId = 1
const draftId = () => `d${nextId++}`

export function draftsFromRows(rows: readonly RawRow[], lists: Lists): Draft[] {
  return rows.map((row) => {
    const group = findByName(lists.groups, row.group)
    const groupId = group?.id ?? ''
    const belt = findByName(beltsForGroup(lists, groupId), row.belt)
    const plan = findByName(lists.plans, row.plan)
    const payment = paymentFromText(row.payment)
    return {
      id: draftId(),
      line: row.line,
      first_name: row.first_name,
      last_name: row.last_name,
      birthdate: row.birthdate,
      parent_first: row.parent_first,
      parent_last: row.parent_last,
      email: row.email.trim(),
      phone: row.phone,
      group_id: groupId,
      belt_rank_id: belt?.id ?? '',
      plan_id: plan?.id ?? '',
      payment: payment === 'card' || payment === 'unknown' ? '' : payment,
      group_name: row.group,
      belt_name: row.belt,
      plan_name: row.plan,
      payment_text: row.payment,
      force: false,
    }
  })
}

export const isAdult = (draft: Pick<Draft, 'parent_first' | 'parent_last'>): boolean =>
  draft.parent_first.trim() === '' && draft.parent_last.trim() === ''

export function ageOn(birthdate: string, today: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return null
  const [by, bm, bd] = birthdate.split('-').map(Number) as [number, number, number]
  const [ty, tm, td] = today.split('-').map(Number) as [number, number, number]
  let age = ty - by
  if (tm < bm || (tm === bm && td < bd)) age -= 1
  return age
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const fullName = (first: string, last: string) => normalizeName(`${first} ${last}`)

/** Same name, and either the same birthdate or no birthdate on one side to tell them
 *  apart. A namesake born on another day is a different child. */
export function isDuplicate(draft: Draft, lists: Lists): boolean {
  const name = fullName(draft.first_name, draft.last_name)
  return lists.existing.some((student) => {
    if (fullName(student.first_name, student.last_name) !== name) return false
    if (!draft.birthdate || draft.birthdate === 'invalid' || !student.birthdate) return true
    return student.birthdate === draft.birthdate
  })
}

export function problemsOf(draft: Draft, lists: Lists, today: string): Problem[] {
  const problems: Problem[] = []
  if (draft.first_name.trim() === '') problems.push('missing_first_name')
  // Email OR phone, which is exactly what the server asks for — `GuardianCreate`'s own
  // validator refuses a guardian carrying neither, and `invitation`'s CHECK says the same
  // thing in the database. Requiring the EMAIL here was stricter than both, and it kept a
  // club that has run on WhatsApp for years from importing the families it reaches by
  // phone (owner, 2026-09-23). Those families simply cannot be emailed an invitation
  // later — a visible gap on the students screen, rather than a red row that stops the
  // whole migration.
  if (draft.email.trim() === '') {
    if (normalizePhone(draft.phone) === '') problems.push('missing_contact')
  } else if (!EMAIL.test(draft.email.trim())) problems.push('bad_email')
  if (draft.birthdate === 'invalid') problems.push('bad_birthdate')

  const groupUnknown = draft.group_id === '' && draft.group_name.trim() !== ''
  if (groupUnknown) problems.push('unknown_group')
  // The belt is checked against the ladder of the group's class, so it waits for the
  // group: one problem for the root cause, not two for one fix.
  if (!groupUnknown && draft.belt_rank_id === '' && draft.belt_name.trim() !== '') {
    problems.push(draft.group_id === '' ? 'belt_without_group' : 'unknown_belt')
  }
  if (draft.plan_id === '' && draft.plan_name.trim() !== '') problems.push('unknown_plan')

  if (draft.payment === '' && draft.payment_text.trim() !== '') {
    problems.push(paymentFromText(draft.payment_text) === 'card' ? 'card_payment' : 'bad_payment')
  }

  if (isAdult(draft)) {
    const age = ageOn(draft.birthdate, today)
    if (age !== null && age < ADULT_AGE) problems.push('minor_without_parent')
  }

  if (!draft.force && isDuplicate(draft, lists)) problems.push('duplicate')
  return problems
}

/** Digits only, in E.164 without the plus — the same shape `normalize_phone` in
 *  `app/services/people/matching.py` reduces to, so `050-123-4567` here and `0501234567`
 *  on a Person already in the database are one number. Israel is the club's country, so a
 *  leading 0 means +972. `''` when this is not a phone number at all. */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim()
  let digits = trimmed.replace(/\D+/g, '')
  if (!digits) return ''
  if (!trimmed.startsWith('+') && digits.startsWith('0')) digits = `972${digits.slice(1)}`
  return digits.length >= 7 && digits.length <= 15 ? digits : ''
}

/** What makes two rows one family. The email first, because that is what the server
 *  matches a guardian on; the phone second, so the siblings of a family reached only by
 *  phone land on ONE card instead of one each. The server agrees either way —
 *  `pending_guardian` matches a normalized phone too — but a review that split them would
 *  tell the manager he was creating two parents when he was not. */
const familyKey = (email: string, phone: string) =>
  email.trim().toLowerCase() || (normalizePhone(phone) && `phone:${normalizePhone(phone)}`) || ''

/** One card per account: siblings share their parent's email, an adult is alone on
 *  theirs. First-seen order, so the review reads in the file's order. */
export function familiesOf(drafts: readonly Draft[]): Family[] {
  const families: Family[] = []
  for (const draft of drafts) {
    const key = familyKey(draft.email, draft.phone) || `line-${draft.line}`
    let family = families.find((row) => row.key === key)
    if (!family) {
      const adult = isAdult(draft)
      family = {
        key,
        email: draft.email.trim(),
        parentName: adult ? '' : `${draft.parent_first} ${draft.parent_last}`.trim(),
        phone: draft.phone,
        adult,
        members: [],
      }
      families.push(family)
    }
    family.members.push(draft)
  }
  return families
}

export function readyDrafts(drafts: readonly Draft[], lists: Lists, today: string): Draft[] {
  return drafts.filter((draft) => problemsOf(draft, lists, today).length === 0)
}
