// Artboard 7c — עמוד אירוע · participants, consents and payment.
//
// **D9.2 ships here.** Six columns, and none of them is משקל or קטגוריה. §2.2 defers weight
// categories to v2 and they imply `student` fields §4.3 does not carry; the namespace has
// no such key and this table has no such column.
//
// **One not-answered count, computed once.** The canvas's header button says 13 and its KPI
// card says 10, and the artboard does not say which is right. A button naming a number a
// manager can see is wrong beside it is worse than one naming none, so both read the same
// field.
//
// **The em dash is a labelled cell, not a glyph.** A consent or a payment is meaningless
// until someone has said yes — that is the right model, and the audit says to keep it — but
// `—` is not a word. `events.roster.notApplicable` is.
//
// **The payment column is absent for a coach, not empty.** §3.2's hard rule: the API sends
// `charge_id: null`, and an empty money column would read as "nobody has paid".
//
// A real `<table>` with a `<caption>` and `<th scope="col">`, for the reason 3b's table
// records: §6.4 puts this in front of a manager who may be using a screen reader, and a
// grid of divs looks identical and is unreadable.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiFetch } from '@studio/core'
import { Button, Card, EmptyState, MoneyDisplay, StatusChip } from '@studio/ui'
import type { ChipStatus } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { DashboardEventsClient, EventOut, EventRegistrationOut } from './client'

const pageStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }

const stripStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-3)',
  gridTemplateColumns: 'repeat(auto-fit, minmax(8rem, 1fr))',
}

const tileValueStyle: CSSProperties = {
  color: 'var(--fg)',
  fontSize: 'var(--text-display)',
  fontWeight: 'var(--weight-semibold)',
  fontVariantNumeric: 'tabular-nums',
  margin: 0,
}

const tileLabelStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const scrollerStyle: CSSProperties = {
  // The table scrolls inside its own container; the page never scrolls sideways.
  overflowX: 'auto',
}

const tableStyle: CSSProperties = { borderCollapse: 'collapse', inlineSize: '100%' }

const cellStyle: CSSProperties = {
  borderBlockEnd: 'var(--border-width-hairline) solid var(--border)',
  paddingBlock: 'var(--space-2)',
  paddingInline: 'var(--space-3)',
  textAlign: 'start',
}

const headStyle: CSSProperties = {
  ...cellStyle,
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
  fontWeight: 'var(--weight-medium)',
}

/**
 * §5.8's gate, on the read side. `RsvpService.is_confirmed` is the definition; the server
 * computes it for the parent's own row on `/me/events`, and the roster carries the two
 * fields it is computed from, so the manager's table derives it rather than asking per row.
 */
export function isConfirmed(event: EventOut, row: EventRegistrationOut): boolean {
  if (row.rsvp !== 'yes') return false
  return !event.requires_consent || row.consent_signed_at !== null
}

export function tally(event: EventOut, roster: EventRegistrationOut[]) {
  return {
    confirmed: roster.filter((row) => isConfirmed(event, row)).length,
    declined: roster.filter((row) => row.rsvp === 'no').length,
    pending: roster.filter((row) => row.rsvp === 'pending').length,
    // Said yes and has not signed. `7c`'s חסר אישור הורה KPI, and the row the office chases.
    awaitingConsent: roster.filter(
      (row) => row.rsvp === 'yes' && event.requires_consent && row.consent_signed_at === null,
    ).length,
  }
}

/**
 * `ChipStatus` has six members and none of them is an RSVP state, so each of these is an
 * approximation. Reported rather than fixed by adding a member to a package this lane does
 * not own — `pending` has no dashed variant either, which `7c` uses to separate "not
 * answered" from "awaiting payment".
 */
function rsvpChip(rsvp: EventRegistrationOut['rsvp']): ChipStatus {
  if (rsvp === 'yes') return 'paid'
  if (rsvp === 'no') return 'cancelled'
  return 'unmarked'
}

function NotApplicable({ locale }: { locale: Locale }) {
  return (
    <span aria-label={t(locale, 'events.roster.notApplicable')} role="img">
      —
    </span>
  )
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <div aria-label={label} role="status">
        <p style={tileValueStyle}>{value}</p>
        <p style={tileLabelStyle}>{label}</p>
      </div>
    </Card>
  )
}

export function EventPage({
  client,
  eventId,
  locale,
  seesMoney,
}: {
  client: DashboardEventsClient
  eventId: string
  locale: Locale
  /** §3.2's hard rule. Decides whether the payment column exists at all. */
  seesMoney: boolean
}) {
  const [remindOutcome, setRemindOutcome] = useState<'sent' | 'quiet' | 'failed' | null>(null)
  const [event, setEvent] = useState<EventOut | null>(null)
  const [roster, setRoster] = useState<EventRegistrationOut[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let live = true
    Promise.all([client.read(eventId), client.registrations(eventId)])
      .then(([fresh, page]) => {
        if (!live) return
        setEvent(fresh)
        setRoster(page.items)
        setLoaded(true)
      })
      .catch(() => live && setLoaded(true))
    return () => {
      live = false
    }
  }, [client, eventId])

  if (!event) {
    return <p style={tileLabelStyle}>{t(locale, 'events.list.loading')}</p>
  }

  const counts = tally(event, roster)

  return (
    <div style={pageStyle}>
      <header>
        <h2 style={{ margin: 0 }}>{event.title}</h2>
        <p style={tileLabelStyle}>{event.location_text}</p>
      </header>

      <div style={stripStyle}>
        <Tile label={t(locale, 'events.counts.confirmed')} value={counts.confirmed} />
        <Tile label={t(locale, 'events.counts.declined')} value={counts.declined} />
        <Tile label={t(locale, 'events.counts.pending')} value={counts.pending} />
        <Tile
          label={t(locale, 'events.counts.awaitingConsent')}
          value={counts.awaitingConsent}
        />
      </div>

      {/* The same field the tile reads. See the module docstring. */}
      <p style={{ margin: 0 }}>
        <Button
          variant="primary"
          data-testid="remind-non-responders"
          disabled={counts.pending === 0}
          onClick={() => {
            void apiFetch(`/api/v1/reminders/events/${eventId}/non-responders`, {
              method: 'POST',
            }).then((response) =>
              setRemindOutcome(
                response.ok ? 'sent' : response.status === 409 ? 'quiet' : 'failed',
              ),
            )
          }}
        >
          {t(locale, 'events.remindNonResponders')} · {counts.pending}
        </Button>
        {remindOutcome ? (
          <span data-testid="remind-non-responders-outcome">
            {t(
              locale,
              remindOutcome === 'sent'
                ? 'events.nonRespondersReminded'
                : remindOutcome === 'quiet'
                  ? 'billing.reminder.quietHours'
                  : 'common.loadFailed.body',
            )}
          </span>
        ) : null}
      </p>

      {loaded && roster.length === 0 ? (
        <EmptyState title={t(locale, 'events.roster.empty')} />
      ) : (
        <div style={scrollerStyle}>
          <table style={tableStyle}>
            <caption style={tileLabelStyle}>{t(locale, 'events.roster.title')}</caption>
            <thead>
              <tr>
                <th scope="col" style={headStyle}>
                  {t(locale, 'people.student.one')}
                </th>
                <th scope="col" style={headStyle}>
                  {t(locale, 'events.rsvp.title')}
                </th>
                <th scope="col" style={headStyle}>
                  {t(locale, 'events.roster.columnConsent')}
                </th>
                {seesMoney ? (
                  <th scope="col" style={headStyle}>
                    {t(locale, 'events.roster.columnPayment')}
                  </th>
                ) : null}
                <th scope="col" style={headStyle}>
                  {t(locale, 'events.counts.attended')}
                </th>
              </tr>
            </thead>
            <tbody>
              {roster.map((row) => (
                <tr key={row.id}>
                  <th scope="row" style={cellStyle}>
                    {row.student_display_name}
                  </th>
                  <td style={cellStyle}>
                    <StatusChip
                      label={t(locale, `events.rsvp.${row.rsvp}`)}
                      status={rsvpChip(row.rsvp)}
                    />
                  </td>
                  <td style={cellStyle}>
                    {/* Not applicable until someone has said yes, and not applicable at all
                        when the event asks for no consent. */}
                    {!event.requires_consent || row.rsvp !== 'yes' ? (
                      <NotApplicable locale={locale} />
                    ) : row.consent_signed_at ? (
                      <StatusChip label={t(locale, 'events.consent.signed')} status="paid" />
                    ) : (
                      <StatusChip label={t(locale, 'events.consent.pending')} status="debt" />
                    )}
                  </td>
                  {seesMoney ? (
                    <td style={cellStyle}>
                      {event.fee_agorot === null ? (
                        <NotApplicable locale={locale} />
                      ) : row.charge_id ? (
                        <MoneyDisplay
                          agorot={event.fee_agorot}
                          label={t(locale, 'events.fee.label')}
                        />
                      ) : (
                        <NotApplicable locale={locale} />
                      )}
                    </td>
                  ) : null}
                  <td style={cellStyle}>
                    {row.attended ? (
                      <StatusChip label={t(locale, 'events.counts.attended')} status="paid" />
                    ) : (
                      <NotApplicable locale={locale} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
