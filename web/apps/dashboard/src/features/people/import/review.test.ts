// The rules half of the import (owner, 2026-09-18). Pure: rows in, families with their
// problems out. Every rule the review screen shows on a row is decided here.
import { describe, expect, it } from 'vitest'
import type { RawRow } from './columns'
import type { Lists } from './review'
import { beltIdInGroup, draftsFromRows, familiesOf, isAdult, problemsOf, readyDrafts } from './review'

const LISTS: Lists = {
  groups: [
    { id: 'g-kids', name: 'ג׳ודו ילדים א׳', class_id: 'c-judo' },
    { id: 'g-teens', name: 'ג׳ודו נוער', class_id: 'c-judo' },
    { id: 'g-adults', name: 'בוגרים', class_id: 'c-judo' },
  ],
  beltsByClass: { 'c-judo': [{ id: 'b-white', name: 'לבן' }, { id: 'b-yellow', name: 'צהוב' }] },
  plans: [{ id: 'p-month', name: 'מנוי חודשי' }],
  existing: [
    { first_name: 'אלון', last_name: 'ביטון', birthdate: '2017-03-12', guardian_display_names: ['שרה ביטון'] },
    { first_name: 'נועה', last_name: 'לוי', birthdate: null, guardian_display_names: [] },
  ],
}
const TODAY = '2026-09-18'

function row(over: Partial<RawRow>): RawRow {
  return {
    line: 2,
    first_name: 'דנה',
    last_name: 'כהן',
    birthdate: '2018-04-12',
    parent_first: 'רות',
    parent_last: 'כהן',
    email: 'ruth@example.com',
    phone: '050-1234567',
    group: 'ג׳ודו ילדים א׳',
    belt: 'צהוב',
    plan: 'מנוי חודשי',
    payment: 'הוראת קבע',
    ...over,
  }
}

const one = (over: Partial<RawRow>) => draftsFromRows([row(over)], LISTS)[0]!

describe('draftsFromRows — names in the file become the studio\'s ids', () => {
  it("matches group, belt and plan by name, forgiving the apostrophe Excel typed (ג'ודו vs ג׳ודו)", () => {
    const draft = one({ group: "ג'ודו ילדים א'", belt: ' צהוב ', plan: 'מנוי חודשי' })
    expect(draft.group_id).toBe('g-kids')
    expect(draft.belt_rank_id).toBe('b-yellow')
    expect(draft.plan_id).toBe('p-month')
  })

  it('reads the payment words the club uses, in either spelling of צ׳קים', () => {
    expect(one({ payment: 'מזומן' }).payment).toBe('cash')
    expect(one({ payment: "צ'קים" }).payment).toBe('cheque')
    expect(one({ payment: 'צ׳ק' }).payment).toBe('cheque')
    expect(one({ payment: 'הוראת קבע' }).payment).toBe('standing_order')
    expect(one({ payment: '' }).payment).toBe('')
  })

  it('keeps the text it could not match so the row can say what was written', () => {
    const draft = one({ group: 'נוער ב׳' })
    expect(draft.group_id).toBe('')
    expect(draft.group_name).toBe('נוער ב׳')
  })
})

describe('problemsOf — what stops a row', () => {
  it('a clean row has no problems', () => {
    expect(problemsOf(one({}), LISTS, TODAY)).toEqual([])
  })

  it('requires the first name, and an address that is one when an address is given', () => {
    expect(problemsOf(one({ first_name: '' }), LISTS, TODAY)).toContain('missing_first_name')
    expect(problemsOf(one({ email: 'ruth at example' }), LISTS, TODAY)).toContain('bad_email')
  })

  it('takes a phone in place of an email, and refuses a family reachable by neither', () => {
    // The server's own rule and nothing narrower: `GuardianCreate` refuses a guardian
    // carrying neither, and `invitation`'s CHECK says the same in the database. Demanding
    // the EMAIL here kept a club that has run on WhatsApp for years from importing the
    // families it reaches by phone (owner, 2026-09-23).
    expect(problemsOf(one({ email: '' }), LISTS, TODAY)).toEqual([])
    expect(problemsOf(one({ email: '', phone: '' }), LISTS, TODAY)).toContain('missing_contact')
    // Two digits is not a phone number, so it is not a way to reach anybody either.
    expect(problemsOf(one({ email: '', phone: '12' }), LISTS, TODAY)).toContain('missing_contact')
  })

  it('names an unknown group, belt or plan rather than dropping it silently', () => {
    expect(problemsOf(one({ group: 'נוער ב׳' }), LISTS, TODAY)).toEqual(['unknown_group'])
    expect(problemsOf(one({ belt: 'סגול' }), LISTS, TODAY)).toEqual(['unknown_belt'])
    expect(problemsOf(one({ plan: 'שנתי' }), LISTS, TODAY)).toEqual(['unknown_plan'])
  })

  it('a blank group and a blank plan each stop the row', () => {
    // Both were optional until 2026-09-23. A trainee with no group is on no register and a
    // trainee with no price is invisible to billing, and NEITHER shows as an error anywhere
    // downstream — the file is the only place the mistake can still be caught.
    expect(problemsOf(one({ group: '' }), LISTS, TODAY)).toContain('missing_group')
    expect(problemsOf(one({ plan: '' }), LISTS, TODAY)).toEqual(['missing_plan'])
  })

  it('says "choose a group" once, not twice, when the belt is waiting on it', () => {
    // `belt_without_group` would repeat the instruction `missing_group` has already given.
    expect(problemsOf(one({ group: '', belt: 'צהוב' }), LISTS, TODAY)).toEqual(['missing_group'])
  })

  it('refuses a card as the prepaid method — a card payment closes itself through the app', () => {
    expect(problemsOf(one({ payment: 'אשראי' }), LISTS, TODAY)).toEqual(['card_payment'])
    expect(problemsOf(one({ payment: 'ביט' }), LISTS, TODAY)).toEqual(['bad_payment'])
  })

  it('a child with no parent is blocked; an adult with no parent is fine', () => {
    const child = one({ parent_first: '', parent_last: '', birthdate: '2019-08-15' })
    expect(isAdult(child)).toBe(true)
    expect(problemsOf(child, LISTS, TODAY)).toEqual(['minor_without_parent'])
    const adult = one({ parent_first: '', parent_last: '', birthdate: '1999-11-30', group: 'בוגרים', belt: '' })
    expect(problemsOf(adult, LISTS, TODAY)).toEqual([])
  })

  it('flags a birthdate the parser could not read', () => {
    expect(problemsOf(one({ birthdate: 'invalid' }), LISTS, TODAY)).toEqual(['bad_birthdate'])
  })

  it('a student already in the system is a duplicate — same name and the same birthdate, or no birthdate to tell them apart', () => {
    expect(problemsOf(one({ first_name: 'אלון', last_name: 'ביטון', birthdate: '2017-03-12' }), LISTS, TODAY)).toEqual(['duplicate'])
    // A namesake born on another day is a different child.
    expect(problemsOf(one({ first_name: 'אלון', last_name: 'ביטון', birthdate: '2015-01-01' }), LISTS, TODAY)).toEqual([])
    // Neither side has a birthdate: assume the same child rather than create a second one.
    expect(problemsOf(one({ first_name: 'נועה', last_name: 'לוי', birthdate: '' }), LISTS, TODAY)).toEqual(['duplicate'])
  })

  it('the manager can override a duplicate and import it anyway', () => {
    const draft = { ...one({ first_name: 'אלון', last_name: 'ביטון' }), force: true }
    expect(problemsOf(draft, LISTS, TODAY)).toEqual([])
  })
})

describe('familiesOf — one card per email', () => {
  it('groups siblings by email, case and space insensitive, keeping first-seen order', () => {
    const drafts = draftsFromRows(
      [
        row({ line: 2, first_name: 'דנה', email: 'Ruth@Example.com' }),
        row({ line: 3, first_name: 'עומר', parent_first: '', parent_last: '', email: 'omer@example.com', birthdate: '1999-11-30' }),
        row({ line: 4, first_name: 'יוסי', email: ' ruth@example.com ' }),
      ],
      LISTS,
    )
    const families = familiesOf(drafts)
    expect(families.map((family) => family.members.map((member) => member.first_name))).toEqual([['דנה', 'יוסי'], ['עומר']])
    expect(families[0]!.adult).toBe(false)
    expect(families[0]!.parentName).toBe('רות כהן')
    expect(families[1]!.adult).toBe(true)
  })
})

describe('familiesOf — a family the club reaches only by phone', () => {
  it('groups those siblings onto ONE card, matching how the server matches them', () => {
    // `pending_guardian` (`app/services/people/matching.py`) normalises a phone on both
    // sides and reuses the parent it finds, so these two children really do land on one
    // Person. A review that split them would tell the manager he was creating two.
    const drafts = draftsFromRows(
      [
        row({ line: 2, first_name: 'דנה', email: '', phone: '050-123-4567' }),
        row({ line: 3, first_name: 'יוסי', email: '', phone: '0501234567' }),
      ],
      LISTS,
    )
    const families = familiesOf(drafts)
    expect(families).toHaveLength(1)
    expect(families[0]!.members.map((member) => member.first_name)).toEqual(['דנה', 'יוסי'])
  })

  it('keeps two families apart when neither has an email or a usable phone', () => {
    const drafts = draftsFromRows(
      [
        row({ line: 2, first_name: 'דנה', email: '', phone: '' }),
        row({ line: 3, first_name: 'יוסי', email: '', phone: '' }),
      ],
      LISTS,
    )
    expect(familiesOf(drafts)).toHaveLength(2)
  })
})

describe('readyDrafts — what the button will send', () => {
  it('counts rows with no problems and skips removed ones', () => {
    const drafts = draftsFromRows([row({ line: 2 }), row({ line: 3, first_name: '' }), row({ line: 4, first_name: 'יוסי' })], LISTS)
    expect(readyDrafts(drafts, LISTS, TODAY).map((draft) => draft.line)).toEqual([2, 4])
  })
})

describe('beltIdInGroup — the belt survives a group change', () => {
  it('resolves the name the file wrote against the chosen group’s ladder', () => {
    // Choosing a group used to force the manager to pick the belt again on every row whose
    // group needed fixing, because §5.9's ladders hang off the class and the row's belt is
    // re-asked then. Re-asking the LISTS instead is the whole point of this helper.
    expect(beltIdInGroup(LISTS, 'g-kids', 'צהוב')).toBe('b-yellow')
    expect(beltIdInGroup(LISTS, 'g-teens', 'לבן')).toBe('b-white')
  })

  it('is forgiving about spacing and the Hebrew apostrophe, like every other name match', () => {
    expect(beltIdInGroup(LISTS, 'g-kids', '  צהוב ')).toBe('b-yellow')
  })

  it("answers '' when the ladder does not have it, or when no group was chosen", () => {
    expect(beltIdInGroup(LISTS, 'g-kids', 'סגול')).toBe('')
    expect(beltIdInGroup(LISTS, '', 'צהוב')).toBe('')
    expect(beltIdInGroup(LISTS, 'g-kids', '')).toBe('')
  })
})
