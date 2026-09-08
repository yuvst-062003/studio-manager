// Where a plan card's words come from.
//
// Two things are pinned here. The join key, because a join on position is the mistake
// CLAUDE.md already records paying for; and the derived path, because it is not the rare
// case — the demo studio is priced 24,000 / 32,000 / 42,000 against the landing page's
// 30,000 / 40,000 / 55,000, so every local checkout and the §19 developer account render
// it, every day.
import { describe, expect, it } from 'vitest'
import { planCopyFor } from './planCopy'
import { PRICES_AGOROT } from '../landing/clubContent'

const plan = (over: Partial<Parameters<typeof planCopyFor>[0]> = {}) => ({
  name: 'פעמיים בשבוע',
  monthly_amount_agorot: 30_000,
  weekly_extra_allowance: 0,
  sessions_per_week: 2,
  ...over,
})

describe('the landing page’s copy, joined by price', () => {
  it('gives a matched plan the club’s own marketing name and bullets', () => {
    const copy = planCopyFor(plan({ monthly_amount_agorot: PRICES_AGOROT[1] }), 'he')
    expect(copy.matched).toBe(true)
    expect(copy.title).toBe('מסלול לוחם')
    expect(copy.features.length).toBeGreaterThan(0)
  })

  it('keeps the DATABASE name as the second line, so neither surface contradicts the other', () => {
    // The family saw 'מסלול לוחם' on the club's site and 'שלוש פעמים בשבוע' on their
    // charges. Both are in their hand at once rather than one replacing the other.
    const copy = planCopyFor(
      plan({ monthly_amount_agorot: PRICES_AGOROT[1], name: 'שלוש פעמים בשבוע' }),
      'he',
    )
    expect(copy.cadence).toBe('שלוש פעמים בשבוע')
  })

  it('is keyed by PRICE and not by list position', () => {
    // The three landing plans are ordered cheapest-first. Asking for the dearest by its
    // amount must return the dearest's copy, whatever index it sits at.
    const dearest = planCopyFor(plan({ monthly_amount_agorot: PRICES_AGOROT[2] }), 'he')
    const cheapest = planCopyFor(plan({ monthly_amount_agorot: PRICES_AGOROT[0] }), 'he')
    expect(dearest.title).not.toBe(cheapest.title)
  })

  it('falls back rather than returning nothing for an unknown price', () => {
    // An empty card is worse than a plain one, and "no marketing words" is not the same
    // thing as "no plan".
    const copy = planCopyFor(plan({ monthly_amount_agorot: 33_333 }), 'he')
    expect(copy.matched).toBe(false)
    expect(copy.title).toBeNull()
    expect(copy.features.length).toBeGreaterThan(0)
  })
})

describe('the derived path — what a club off the landing page’s prices sees', () => {
  it('reads its cadence from sessions_per_week', () => {
    const copy = planCopyFor(plan({ monthly_amount_agorot: 24_000, sessions_per_week: 3 }), 'he')
    expect(copy.cadence).toContain('3')
  })

  it('says open membership rather than printing a number it does not have', () => {
    const copy = planCopyFor(
      plan({ monthly_amount_agorot: 24_000, sessions_per_week: null, weekly_extra_allowance: null }),
      'he',
    )
    expect(copy.cadence).toBe('אימונים ללא הגבלה')
  })

  it('NEVER claims unlimited on a plan whose cadence names a number', () => {
    // The defect a screenshot caught. `seed_money` sets `sessions_per_week` and leaves
    // `weekly_extra_allowance` NULL, and the model reads that NULL as "no weekly limit" —
    // so the card printed 'פעמיים בשבוע' as its cadence directly above 'כל האימונים
    // במערכת, ללא הגבלה שבועית' as its bullet. One card, two facts, contradicting each
    // other. A plan that names a number of sessions a week is not unlimited, whatever the
    // other column is missing.
    const copy = planCopyFor(
      plan({ monthly_amount_agorot: 24_000, sessions_per_week: 2, weekly_extra_allowance: null }),
      'he',
    )
    expect(copy.features.join(' ')).not.toContain('ללא הגבלה')
  })

  it('claims unlimited only when BOTH columns say so', () => {
    const copy = planCopyFor(
      plan({ monthly_amount_agorot: 24_000, sessions_per_week: null, weekly_extra_allowance: null }),
      'he',
    )
    expect(copy.features.join(' ')).toContain('ללא הגבלה')
    // §5.1 attaches the Saturday private lesson to exactly this state.
    expect(copy.features.join(' ')).toContain('פרטני')
  })

  it('names the extra sessions a plan actually buys', () => {
    const copy = planCopyFor(
      plan({ monthly_amount_agorot: 24_000, weekly_extra_allowance: 1 }),
      'he',
    )
    expect(copy.features.join(' ')).toContain('1')
  })

  it('never invents an emphasis the club did not choose', () => {
    // A derived card has no badge and is never the highlighted tier: those are the club's
    // own marketing decisions, and there is no copy here to have made them.
    const copy = planCopyFor(plan({ monthly_amount_agorot: 24_000 }), 'he')
    expect(copy.badge).toBeNull()
    expect(copy.highlighted).toBe(false)
  })
})
