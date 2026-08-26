// Artboard 7d — הזמנה לאירוע ואישור השתתפות.
//
// **Finding 1 is the reason this screen needed building rather than porting.** §5.8: an
// RSVP does not count as confirmed until the parent's consent is signed. On the artboard
// the confirm button and the consent card are independent, simultaneously usable controls —
// confirm is drawn in the ordinary enabled primary style, with no disabled state, no lock
// and no inline copy — and nothing ties them. A parent can press confirm without signing.
// `events.consent.blocksConfirmation` ships the sentence and the button is disabled until
// the signature exists.
//
// **Declining is never gated.** §5.8 gates CONFIRMATION. Asking a parent to sign a consent
// in order to say their child is not coming would put a form between a family and "no".
//
// **Finding 2:** `events.fee.chargeOnConfirm` exists and the artboard does not draw it, so
// nothing on the canvas says that confirming creates a charge. It is drawn.
//
// **Finding 4, refused:** the artboard prints a coach's personal mobile to every parent.
// §11 governs personal data and a coach's mobile is personal data. No phone number here.
//
// **Findings 5 and 6, cut:** capacity and a transport arrangement with departure and return
// times. §5.8's event has a column for neither.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, Card, MoneyDisplay, StatusChip } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { blocksConfirmation, deadlinePassed } from './client'
import type { ParentEventOut, ParentEventsClient } from './client'

const pageStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }

const titleStyle: CSSProperties = {
  color: 'var(--fg)',
  fontSize: 'var(--text-display)',
  fontWeight: 'var(--weight-semibold)',
  margin: 0,
}

const hintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const footerStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  flexWrap: 'wrap',
}

export function EventInviteScreen({
  client,
  eventId,
  locale,
  now,
  studentId,
}: {
  client: ParentEventsClient
  eventId: string
  locale: Locale
  now: string
  studentId: string
}) {
  const [row, setRow] = useState<ParentEventOut | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [changing, setChanging] = useState(false)

  useEffect(() => {
    let live = true
    client
      .myEvents()
      .then((page) => {
        if (!live) return
        setRow(
          page.items.find(
            (item) => item.event.id === eventId && item.registration.student_id === studentId,
          ) ?? null,
        )
        setLoaded(true)
      })
      .catch(() => live && setLoaded(true))
    return () => {
      live = false
    }
  }, [client, eventId, studentId])

  if (!row) return <p style={hintStyle}>{loaded ? '' : t(locale, 'events.list.loading')}</p>

  const { event, registration } = row
  const gated = blocksConfirmation(event, registration)
  const closed = deadlinePassed(event, now)
  const answered = registration.rsvp !== 'pending'

  const answer = async (rsvp: 'yes' | 'no') => {
    const next = await client.answer(eventId, studentId, rsvp)
    setRow({ ...row, registration: next.registration, confirmed: next.confirmed })
    setChanging(false)
  }

  const sign = async () => {
    const next = await client.signConsent(eventId, studentId)
    setRow({ ...row, registration: next.registration, confirmed: next.confirmed })
  }

  return (
    <div style={pageStyle}>
      <p style={hintStyle}>
        <StatusChip label={t(locale, `events.type.${event.type}`)} status="planned" />
      </p>
      <h2 style={titleStyle}>{event.title}</h2>
      <p style={hintStyle}>{event.location_text}</p>

      {/* Finding 2 — the key exists and the canvas never draws it, so nothing on the
          artboard says what pressing confirm actually does to the family's balance. */}
      {event.fee_agorot !== null ? (
        <p style={hintStyle}>{t(locale, 'events.fee.chargeOnConfirm')}</p>
      ) : null}

      {gated ? (
        <Alert iconLabel={t(locale, 'events.consent.required')} tone="danger">
          {/* The sentence the design does not express. */}
          {t(locale, 'events.consent.blocksConfirmation')}
        </Alert>
      ) : null}

      {gated ? (
        <Card>
          <p style={hintStyle}>{event.consent_text}</p>
          <Button onClick={() => void sign()} variant="secondary">
            {t(locale, 'events.consent.sign')}
          </Button>
        </Card>
      ) : null}

      {event.requires_consent && registration.consent_signed_at ? (
        <p style={hintStyle}>
          <StatusChip label={t(locale, 'events.consent.signed')} status="paid" />
        </p>
      ) : null}

      {closed ? (
        <p style={hintStyle}>{t(locale, 'events.rsvp.deadlinePassed')}</p>
      ) : answered && !changing ? (
        <>
          {/* Finding 3 — the artboard draws no answered state and no way back, though
              rsvp.change exists. */}
          <p style={hintStyle}>
            {registration.rsvp === 'yes'
              ? t(locale, 'events.rsvp.youConfirmed')
              : t(locale, 'events.rsvp.youDeclined')}
          </p>
          <Button onClick={() => setChanging(true)} variant="secondary">
            {t(locale, 'events.rsvp.change')}
          </Button>
        </>
      ) : (
        <div style={footerStyle}>
          <Button
            // The gate. Disabled rather than absent: a parent needs to see that confirming
            // is the goal and that one thing stands between them and it.
            disabled={gated}
            onClick={() => void answer('yes')}
            variant="primary"
          >
            {t(locale, 'events.rsvp.yes')}
            {event.fee_agorot !== null ? (
              <>
                {' · '}
                {/* Inside a button label, through the primitive. A {digits}₪ pair built by
                    interpolation is where an RTL label flips. */}
                <MoneyDisplay agorot={event.fee_agorot} label={t(locale, 'events.fee.label')} />
              </>
            ) : null}
          </Button>
          {/* Never gated — see the module docstring. */}
          <Button onClick={() => void answer('no')} variant="secondary">
            {t(locale, 'events.rsvp.no')}
          </Button>
        </div>
      )}
    </div>
  )
}
