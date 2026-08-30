// `טופס הרשמה` block 3, on the screen a coach opens at the door.
//
// **The field only does its job if the person at the door can read it.** The club's paper
// form asks "אנשים אחרים (חוץ מההורים) שרשאים לאסוף את הילדים" for one reason: somebody is
// standing at the door saying they have come for a child, and a coach has to know. Stored and
// never shown, it would be write-only data — which is why these contacts live on their own
// table rather than inside `health_declaration.answers_encrypted`, where §11.1 would have put
// them behind a manager-only, audit-logged read.
//
// **This is not the health boundary and must not start behaving like it.** §5.5's rule — a
// coach sees `derived_flags` and never an answer — is about MEDICAL information. A name and a
// phone number are not that, and applying the stricter rule here would break the one use the
// field has.
//
// The aliyah year is on the same endpoint and deliberately not rendered here: it is
// national-origin data for the עמותה's funding return, the API withholds it below manager,
// and a coach's card is not where it belongs.
import { useEffect, useState } from 'react'
import { apiFetch } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export type PickupContact = { name: string; phone: string; relation?: string | null }

export type PickupContactsProps = {
  student: { id: string }
  locale: Locale
  /** Injected by tests. Production reads through `apiFetch` like every other feature client. */
  load?: (studentId: string) => Promise<{ pickup_contacts: PickupContact[] }>
}

function defaultLoad(studentId: string): Promise<{ pickup_contacts: PickupContact[] }> {
  return apiFetch(`/api/v1/students/${studentId}/registration`).then((response) =>
    response.ok ? response.json() : { pickup_contacts: [] },
  )
}

export function PickupContacts({ student, locale, load = defaultLoad }: PickupContactsProps) {
  const [contacts, setContacts] = useState<PickupContact[] | null>(null)

  useEffect(() => {
    let live = true
    load(student.id)
      .then((data) => {
        if (live) setContacts(data.pickup_contacts ?? [])
      })
      // A failed read renders the empty state, never a crash: this card is opened mid-class
      // with one hand, and a section that throws takes the attendance marks down with it.
      .catch(() => {
        if (live) setContacts([])
      })
    return () => {
      live = false
    }
  }, [student.id, load])

  if (contacts === null) return null

  return (
    <section aria-labelledby={`pickup-${student.id}`} data-testid="student-card-pickup">
      <h2 id={`pickup-${student.id}`}>{t(locale, 'health.registration.pickup')}</h2>
      {contacts.length === 0 ? (
        // Said out loud rather than left blank. An empty section reads as "not loaded yet",
        // and a coach guessing whether the list is empty or missing is the one outcome this
        // section cannot afford.
        <p style={{ color: 'var(--text-muted)' }}>{t(locale, 'health.registration.pickupNone')}</p>
      ) : (
        <ul style={{ margin: 0, paddingInlineStart: 'var(--space-4)' }}>
          {contacts.map((contact) => (
            <li key={`${contact.name}-${contact.phone}`}>
              <bdi>{contact.name}</bdi>
              {contact.phone ? (
                <>
                  {' · '}
                  {/* A tel: link, because the coach's next action is to phone the parent. */}
                  <a dir="ltr" href={`tel:${contact.phone}`}>
                    {contact.phone}
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
