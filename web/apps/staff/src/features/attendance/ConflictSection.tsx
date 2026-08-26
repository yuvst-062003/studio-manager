// §10.5's conflict cards, registered into M3's `alert-centre` container (dashboard `6c`).
//
// "Rejected operations become dismissible conflict cards; **nothing is silently dropped**."
//
// This is a `registerSlot` file, not an edit to `AlertCentre.tsx`. The container knows
// nothing about the offline queue and does not fetch for this section — the cards come off
// the device's own store, which is the only place they can come from: a `different_person`
// card describes work that never reached the server.
import { Alert, Button } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { useConflicts } from '@studio/core'
import type { ConflictCard } from '@studio/core'

/** §10.5's four cases, each to the copy the namespace already carries. `rejected` falls back
 *  to the generic title — it is the catch-all for a server refusal this client does not have
 *  specific words for, and inventing a Hebrew sentence here would be a string §9 cannot
 *  reach (G4). */
const TITLE: Record<ConflictCard['kind'], string> = {
  session_cancelled: 'attendance.conflict.sessionCancelled',
  student_unenrolled: 'attendance.conflict.title',
  different_person: 'attendance.conflict.differentPerson',
  rejected: 'attendance.conflict.title',
}

const BODY: Record<ConflictCard['kind'], string> = {
  session_cancelled: 'attendance.conflict.sessionCancelledBody',
  student_unenrolled: 'attendance.conflict.sessionCancelledBody',
  different_person: 'attendance.conflict.differentPersonBody',
  rejected: 'attendance.conflict.sessionCancelledBody',
}

export function ConflictSection({ locale }: { locale: Locale }) {
  const { cards, dismiss } = useConflicts()
  if (cards.length === 0) return null

  return (
    <section data-testid="attendance-conflicts">
      {cards.map((card) => (
        <article data-conflict={card.kind} data-testid={`conflict-${card.id}`} key={card.id}>
          {/* `live` is deliberately off. `Alert`'s own docstring: role="alert" on content
              that was already there makes a screen reader interrupt itself on every render,
              and people learn to ignore an alert that always fires. A conflict card is a
              standing decision to make, not an interruption. */}
          <Alert iconLabel={t(locale, 'attendance.conflict.title')} tone="danger">
            <strong>{t(locale, TITLE[card.kind])}</strong>
            <span>{t(locale, BODY[card.kind])}</span>
            {/* `1c`'s copy interpolates the count — `השיעור בוטל — התקבלו 22 סימוני נוכחות`.
                The number is what tells a manager whether this is one child or a whole
                lesson, which is the difference between a shrug and a phone call. */}
            <span data-testid={`conflict-count-${card.id}`}>{card.count}</span>
          </Alert>
          {/* Dismiss HIDES the card. It does not delete a mark, and there is no control
              anywhere in this lane that does — §10.3 item 5. A `session_cancelled` card's
              marks are already on the server; a `different_person` card's ops are still in
              the queue for a manager to deal with. */}
          <Button onClick={() => void dismiss(card.id)} variant="secondary">
            {t(locale, 'attendance.conflict.review')}
          </Button>
        </article>
      ))}
    </section>
  )
}
