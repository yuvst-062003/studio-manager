// This lane's `student-card` section: the guardians.
//
// L8 and §5.3 — "All guardians are equal... There is one guardian view in the app and no
// permission branching inside it." Every row offers the same affordances; `is_primary` is
// rendered with the hint naming exactly its two consequences and nothing else.
import { t } from '@studio/i18n'
import { GuardianRow } from '../ProfileAndLeave'
import type { StudentCardSectionProps } from '../StudentCard'

export function GuardiansSection({ locale, guardians = [] }: StudentCardSectionProps) {
  return (
    <section aria-labelledby="card-guardians" data-testid="student-card-guardians">
      <h2 id="card-guardians">{t(locale, 'people.guardian.plural')}</h2>
      {guardians.length === 0 ? (
        <p>{t(locale, 'people.guardian.empty')}</p>
      ) : (
        <ul>
          {guardians.map((guardian) => (
            <GuardianRow key={guardian.person_id} guardian={guardian} locale={locale} />
          ))}
        </ul>
      )}
    </section>
  )
}
