// 9i's `רשימת משתתפים` — who is coming, who has not answered, whose consent is signed.
//
// A separate screen from `ExamResultsScreen` on purpose: the participants list is about an
// event still AHEAD (chasing answers), the result sheet is about one already held. Routing
// both from `#/events/<id>` made every future event open an exam sheet whose eligibility
// read had nothing to say.
//
// **No money.** `EventRegistrationOut` carries `charge_id` and no amount, and this screen
// renders neither — §3.2's rule is kept by omission, same as the events list.
//
// **C3 (2026-09-06) gave this screen the session register's card shapes** — the rounded-3xl
// header, the rounded-2xl rows, the hairline borders and `shadow-xs` `RosterScreen.tsx`
// carries — so the two read as one screen, per §4.3: "This same screen shape serves an
// event's register." Deliberately NOT the same component: an event's row has no mark to
// cycle, no belt, no health flag and no offline queue behind it (§6.5 is what adds that,
// checkpoint 13, alone) — only an RSVP and, where the event asks for one, a consent chip.
// Nothing below this note touches `client.read`/`client.registrations`, the failure path
// or the consent predicate; this pass is markup and class names only.
import { useEffect, useState } from 'react'
import { EmptyState, LoadFailed, StatusChip } from '@studio/ui'
import { useNetworkMode } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { EventRegistrationOut, StaffEventsClient } from './client'

function rsvpTone(rsvp: EventRegistrationOut['rsvp']): 'paid' | 'cancelled' | 'pending' {
  if (rsvp === 'yes') return 'paid'
  if (rsvp === 'no') return 'cancelled'
  return 'pending'
}

export function EventRosterScreen({
  client,
  eventId,
  locale,
}: {
  client: StaffEventsClient
  eventId: string
  locale: Locale
}) {
  // S11 — a failed read distinguishes offline from broken (S5's network state).
  const networkMode = useNetworkMode()
  const [rows, setRows] = useState<EventRegistrationOut[] | null>(null)
  const [requiresConsent, setRequiresConsent] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    Promise.all([client.read(eventId), client.registrations(eventId)])
      .then(([event, page]) => {
        if (!live) return
        setRequiresConsent(event.requires_consent)
        setRows(page.items)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [client, eventId, attempt])

  if (failed) {
    return (
      <LoadFailed
        offline={networkMode !== 'online'}
        locale={locale}
        onRetry={() => {
          setFailed(false)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }

  return (
    <section
      aria-labelledby="event-roster-title"
      className="flex flex-col gap-4 px-4 pt-4"
      data-testid="event-roster"
    >
      <header className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-xs">
        <h1 className="text-base font-black text-slate-900" id="event-roster-title">
          {t(locale, 'events.roster.title')}
        </h1>
      </header>
      {rows === null ? null : rows.length === 0 ? (
        <EmptyState title={t(locale, 'events.roster.empty')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              className="flex min-h-11 flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs"
              data-testid="event-roster-row"
              key={row.id}
            >
              <bdi className="me-auto text-sm font-bold text-slate-900">
                {row.student_display_name}
              </bdi>
              <StatusChip
                label={t(locale, `events.rsvp.${row.rsvp}`)}
                status={rsvpTone(row.rsvp)}
              />
              {/* The consent chip exists only when the event asks for one — a chip that
                  said "not applicable" on every seminar row would be noise. Timestamp
                  presence only, never contents (§14). */}
              {requiresConsent ? (
                <StatusChip
                  label={t(
                    locale,
                    row.consent_signed_at ? 'events.consent.signed' : 'events.consent.pending',
                  )}
                  status={row.consent_signed_at ? 'paid' : 'pending'}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
