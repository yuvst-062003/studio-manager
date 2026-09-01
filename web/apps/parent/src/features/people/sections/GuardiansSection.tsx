// This lane's `student-card` section: the guardians, as one row.
//
// L8 and §5.3 — "All guardians are equal... There is one guardian view in the app and no
// permission branching inside it." That view is `12i` behind `#/profile`, and it is where
// the phone numbers, the primary badge and its hint live. The card names who they are and
// goes there; it does not build a second guardian view beside the first one.
//
// The old section rendered the full `GuardianRow` list — names, badges, hints and call
// links — under its own heading, which is most of `12i` reproduced inside a summary card.
import { DetailRow } from '@studio/ui'
import { t } from '@studio/i18n'
import type { StudentCardSectionProps } from '../StudentCard'

export function GuardiansSection({ locale, guardians = [] }: StudentCardSectionProps) {
  return (
    <DetailRow
      href="#/profile"
      label={t(locale, 'people.guardian.plural')}
      testId="student-card-guardians"
    >
      {guardians.length === 0 ? (
        t(locale, 'people.guardian.empty')
      ) : (
        // One <bdi> per name rather than one around a joined string: a Hebrew name beside
        // a Latin one in a single isolate still reorders across the separator.
        <span>
          {guardians.map((guardian, index) => (
            <span key={guardian.person_id} data-testid="guardian-name">
              {index > 0 ? ' · ' : ''}
              <bdi>{guardian.display_name}</bdi>
            </span>
          ))}
        </span>
      )}
    </DetailRow>
  )
}
