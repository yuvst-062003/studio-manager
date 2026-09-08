// The plan cards' marketing copy, joined to the club's real price plans.
//
// Owner decision, 2026-09-08: draw the plan options the way the public landing page draws
// its pricing tiers — badge, name, cadence, price, feature bullets, action — and REUSE the
// landing page's words rather than storing new ones.
//
// ── The join key is the PRICE, and that is not arbitrary ──────────────────────────────
//
// The two sources agree on the price and on nothing else. The database calls the 300 ₪ plan
// 'פעמיים בשבוע'; `clubContent.ts` calls it 'מסלול יסוד'. So a join on name matches
// nothing, and a join on LIST POSITION is the mistake CLAUDE.md already records paying for
// once — "a version check landed while one client still picked its template by list
// position, and the mismatch became an infinite loop with no error on screen".
//
// `PRICES_AGOROT` is `[30000, 40000, 55000]`, and those are the amounts the club's own
// `price_plan` rows carry. That is the whole of the agreement between the two files, so it
// is the whole of the key.
//
// ── The price on the card is always the DATABASE's ────────────────────────────────────
//
// `ClubPlan.priceAgorot` is never rendered. The card prints
// `PlanOptionOut.monthly_amount_agorot`, which is what the club actually charges and what
// appears on the family's charges. A club that re-prices therefore loses its BULLETS — the
// mapper stops matching and the derived path takes over — and never shows a wrong number.
// That failure mode is chosen: wrong words are a disappointment, a wrong price is a
// complaint.
//
// ── The fallback is not the rare path ─────────────────────────────────────────────────
//
// `seed_money` in `app/services/demo/layers.py` seeds the demo studio at
// 24,000 / 32,000 / 42,000. Nothing matches there, so on every local checkout and behind
// the §19 developer account EVERY card renders derived copy. It is what a developer sees
// each day and what any club that is not Gladiator sees for ever, so it gets the same
// layout, the same badge slot (empty), and bullets built from facts the API really carries.
import { clubContentFor } from '../landing/clubContent'
import type { Locale } from '@studio/i18n'
import { fill } from '@studio/core'
import { t } from '@studio/i18n'

/** The club whose landing copy this app ships. One slug, because `clubContentFor` knows
 *  one — a second club gets its own entry there and this file needs no change. */
const CLUB_SLUG = 'gladiator'

export type PlanCardCopy = {
  /** The marketing name — 'מסלול לוחם' — or `null` when there is no landing copy for this
   *  price, in which case the card titles itself with the database name. */
  title: string | null
  /** The line under the title. The database plan's own name when copy matched (so both
   *  surfaces' words are in the family's hand at once), otherwise derived. */
  cadence: string
  features: readonly string[]
  badge: string | null
  /** The club's own recommended tier. Only ever true for a matched plan — a derived card
   *  must not invent an emphasis the club did not choose. */
  highlighted: boolean
  /** Did the landing page's copy match? The card reads this only to decide whether it may
   *  show a badge; tests read it to tell the two paths apart. */
  matched: boolean
}

/** What the mapper needs off a plan. A structural type rather than `PlanOptionOut`, so the
 *  home pill's row shape works too — it carries the same three facts under the same names. */
export type PlanLike = {
  name: string
  monthly_amount_agorot: number
  weekly_extra_allowance?: number | null
  sessions_per_week?: number | null
}

/**
 * The cadence and bullets a plan describes itself with when no landing copy matches.
 *
 * Everything here is a fact the API actually carries. `sessions_per_week` is C11's label
 * ("'פעמיים בשבוע' is 2, 'כל יום' is 5") and is NULL for open membership, which is said as
 * such rather than printed as a number the row does not have.
 */
function derived(plan: PlanLike, locale: Locale): PlanCardCopy {
  const perWeek = plan.sessions_per_week ?? null
  const allowance = plan.weekly_extra_allowance
  const features: string[] = [t(locale, 'schedule.plan.feature.base')]

  /**
   * **A NULL allowance is only "unlimited" when the cadence agrees.**
   *
   * The two columns are different facts and a club can set one without the other — the
   * demo studio does exactly that, seeding `sessions_per_week` and leaving
   * `weekly_extra_allowance` NULL on every plan. Read alone, the NULL says "no weekly
   * limit" (the model's own note: "NULL rather than a large number, because 'no limit' is
   * a third state"), and the card then printed 'פעמיים בשבוע' as its cadence directly
   * above 'כל האימונים במערכת, ללא הגבלה שבועית' as its bullet. One card, two facts, and
   * they contradicted each other.
   *
   * A plan that names a number of sessions a week is not unlimited whatever the other
   * column is missing. So the cadence wins: unlimited is claimed only when BOTH say so.
   */
  const unlimited = (allowance === null || allowance === undefined) && perWeek === null

  if (unlimited) {
    features.push(t(locale, 'schedule.plan.feature.unlimited'))
    // §5.1: the Saturday private lesson attaches its rule to the allowance being NULL, so
    // this bullet is true exactly when that one is.
    features.push(t(locale, 'schedule.plan.feature.private'))
  } else if (allowance !== null && allowance !== undefined && allowance > 0) {
    features.push(fill(t(locale, 'schedule.plan.feature.extras'), { count: String(allowance) }))
  } else if (allowance === 0) {
    features.push(t(locale, 'schedule.plan.feature.baseOnly'))
  }
  // A plan with a cadence and NO allowance recorded says nothing further. Silence is the
  // honest answer where the club has filled in one column and not the other — inventing a
  // bullet from a column nobody set is how the contradiction above happened.

  return {
    title: null,
    cadence:
      perWeek === null
        ? t(locale, 'schedule.plan.cadenceOpen')
        : fill(t(locale, 'schedule.plan.cadence'), { count: String(perWeek) }),
    features,
    badge: null,
    highlighted: false,
    matched: false,
  }
}

/**
 * The landing page's copy for a plan at this price, or copy derived from the plan itself.
 *
 * Never returns `null`: an empty card is worse than a plain one, and "no marketing words"
 * is not the same as "no plan".
 */
export function planCopyFor(plan: PlanLike, locale: Locale): PlanCardCopy {
  const content = clubContentFor(CLUB_SLUG, locale)
  const match = content?.plans.find((row) => row.priceAgorot === plan.monthly_amount_agorot)
  if (!match) return derived(plan, locale)
  return {
    title: match.name,
    // The DATABASE's name as the second line. Both are shown so neither surface can
    // contradict the other in the family's hand: they saw 'מסלול לוחם' on the club's site,
    // and 'שלוש פעמים בשבוע' is what appears on their charges.
    cadence: plan.name,
    features: match.features,
    badge: match.badge ?? null,
    highlighted: match.highlighted === true,
    matched: true,
  }
}
