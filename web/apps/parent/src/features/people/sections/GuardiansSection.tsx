// This lane's `student-card` section: who else the club can reach about this child.
//
// ── Three defects, one row (spec §4.3) ───────────────────────────────────────────────
//
// **A2 — an adult member was listed as his own parent.** §5.3's identity model allows an
// adult student who is also their own guardian, and `services/people/onboarding.py` has
// been writing `relation='self'` for them since the join wizard shipped. Nothing read it.
// The row rendered a fixed `people.guardian.plural` — הורים — over whatever names came
// back, so a grown member opening his own card found himself filed under his own parents.
//
// He now gets NO row. That is not a special case to be tidy about: there is nobody else to
// name, and a heading with one self-referential name under it is the defect stated more
// politely.
//
// **A3 — it showed the family's guardians, not the child's.** The container's read changed
// (`TraineeCardSection`); this file just renders what it is given, which is now one child's
// list.
//
// **A4 — it linked to `#/profile`.** The old comment said "there is one guardian view in
// the app and it is 12i behind #/profile". That view no longer exists: the 2026-09-06
// review replaced the stacked profile screen with a card of button-rows, and none of its
// five sheets lists guardians — פרטים אישיים is the CALLER's own record. So the row
// pointed at a menu, and there was nowhere in the app showing a second guardian's phone.
//
// It answers itself instead. Each guardian's name, their relation, and their number as a
// `tel:` — which is the whole of what a parent opens this row for. Building a managed
// guardian view (add, remove, set primary) behind a fix would be inventing scope; the
// product has no such screen on any surface, staff included.
import { DetailRow } from '@studio/ui'
import { fill } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { GuardianOut } from '../peopleClient'
import type { StudentCardSectionProps } from '../redesign/TraineeCard'

/**
 * Which word heads the row, or `null` for no row at all.
 *
 * `self` rows are dropped BEFORE the decision, so an adult member with no other guardian
 * gets nothing. A set containing a grandparent is אפוטרופוסים, which is true of it where
 * הורים is not — and is the same word the join wizard's own form already uses
 * (`joinWizard.form.guardianSection`: 'פרטי ההורה / אפוטרופוס').
 */
export function guardianLabelKey(
  guardians: readonly Pick<GuardianOut, 'relation'>[],
): 'people.card.guardians' | 'people.card.guardiansPlural' | null {
  const others = guardians.filter((row) => row.relation !== 'self')
  if (others.length === 0) return null
  return others.every((row) => row.relation === 'parent')
    ? 'people.card.guardians'
    : 'people.card.guardiansPlural'
}

function GuardianLine({ guardian, locale }: { guardian: GuardianOut; locale: Locale }) {
  const relation = t(locale, `people.guardian.relation.${guardian.relation}`)
  return (
    <span className="flex items-baseline gap-2 w-full" data-testid="guardian-name">
      {/* One <bdi> per name rather than one around a joined string: a Hebrew name beside a
          Latin one in a single isolate still reorders across the separator. */}
      <bdi className="min-w-0 truncate">{guardian.display_name}</bdi>
      {guardian.phone ? (
        <a
          href={`tel:${guardian.phone}`}
          data-testid="guardian-call"
          // Two anchors reading 'חיוג' are two links a screen reader cannot tell apart,
          // and telling them apart is the whole point of listing more than one guardian.
          aria-label={fill(t(locale, 'people.card.callGuardian'), {
            name: guardian.display_name,
          })}
          className="text-[11px] font-bold text-[#0056c5] dark:text-blue-300 shrink-0 cursor-pointer"
        >
          {guardian.phone}
        </a>
      ) : null}
      <span className="text-[11px] text-slate-400 dark:text-slate-500 ms-auto shrink-0">
        {relation}
      </span>
    </span>
  )
}

export function GuardiansSection({ locale, guardians = [] }: StudentCardSectionProps) {
  const labelKey = guardianLabelKey(guardians)
  // No row at all for a self-guarding adult. Rendering an empty one under a label reads as
  // a broken feature rather than an absent fact — the same rule `DetailsSection` follows
  // for a missing birthdate.
  if (labelKey === null) return null

  const shown = guardians.filter((row) => row.relation !== 'self')
  return (
    <DetailRow label={t(locale, labelKey)} testId="student-card-guardians">
      <span className="flex flex-col gap-1 w-full">
        {shown.map((guardian) => (
          <GuardianLine key={guardian.person_id} guardian={guardian} locale={locale} />
        ))}
      </span>
    </DetailRow>
  )
}
