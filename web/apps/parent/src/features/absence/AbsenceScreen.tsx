// Parent artboard `12a` — דיווח היעדרות.
//
// **The one screen in the product that refuses to work offline, on purpose.** §10.2: "A
// parent's absence pre-report requires a connection on purpose: it is time-critical and
// worthless if it lands after the lesson. The app says so rather than queuing it into the
// void."
//
// `12a` finding 1 is that the artboard does not draw that state — "the one screen that must
// show an offline state does not draw it" — while
// `attendance.absence.requiresConnection` and `.requiresConnectionHint` were written for
// exactly this. Both are used below, and the submit is disabled rather than optimistic.
//
// Two more findings, both corrected rather than carried:
//
//   * finding 2 — neither `tooLate` nor `alreadyReported` is drawn, "and the deadline is the
//     screen's whole premise". Both render, from the server's code and not the device's
//     clock: a phone an hour behind would otherwise let a parent file a pre-report for a
//     lesson already in progress.
//   * finding 3 — the disclaimer's second half, "no refund for a missed lesson", is a
//     **billing policy stated on an attendance screen** with no key and no §5.10 line. It is
//     not rendered. §5.7 is explicit that absences have no financial consequence at all —
//     "the monthly fee buys the slot, not the sessions" — so the sentence would be stating a
//     rule the product does not have.
import { useEffect, useState } from 'react'
import { Alert, Button, Radio, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { formatTimeInStudioZone, useNetworkMode } from '@studio/core'
import { AbsenceRefused, countdown } from './client'
import type { AbsenceClient, AbsenceError, UpcomingSession } from './client'

export function AbsenceScreen({
  locale,
  client,
  children,
  clock = () => new Date().toISOString(),
}: {
  locale: Locale
  client: AbsenceClient
  /** The parent's children, from M3's data. `12a`'s three chips. */
  children: { id: string; display_name: string }[]
  clock?: () => string
}) {
  const mode = useNetworkMode()
  const [sessions, setSessions] = useState<UpcomingSession[]>([])
  const [studentId, setStudentId] = useState(children[0]?.id ?? '')
  const [sessionId, setSessionId] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<AbsenceError | null>(null)
  const [submitted, setSubmitted] = useState(false)

  // §10.2's table — the parent app's offline scope is a READ-ONLY cache of "upcoming
  // sessions". So the picker fills from cache in a lift; only the submit needs the network,
  // which is the distinction the whole screen turns on.
  useEffect(() => {
    let live = true
    void client
      .upcoming()
      .then((rows) => {
        if (!live) return
        setSessions(rows)
        setSessionId((current) => current || (rows[0]?.id ?? ''))
      })
      .catch(() => {
        // An empty picker with the offline notice below it is a truthful screen. An error
        // boundary over it is not.
      })
    return () => {
      live = false
    }
  }, [client])

  // §10.1 — every mode except `online` is the offline path. `slow` is in that set because a
  // six-second write is a write this screen must not pretend succeeded, and `intermittent`
  // because a captive portal answers and routes nowhere.
  const connected = mode === 'online'

  if (submitted) {
    return (
      <section data-testid="absence-submitted">
        <p>{t(locale, 'attendance.absence.submitted')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="absence-title" data-testid="absence-screen">
      <header>
        <h1 id="absence-title">{t(locale, 'attendance.absence.title')}</h1>
        <p data-testid="absence-deadline">{t(locale, 'attendance.absence.subtitle')}</p>
      </header>

      {/* `12a` finding 1 — drawn nowhere on the artboard, and the reason both keys exist. */}
      {!connected ? (
        <Alert
          iconLabel={t(locale, 'attendance.absence.requiresConnection')}
          live
          tone="danger"
        >
          <strong>{t(locale, 'attendance.absence.requiresConnection')}</strong>
          <span>{t(locale, 'attendance.absence.requiresConnectionHint')}</span>
        </Alert>
      ) : null}

      {error !== null ? (
        <Alert iconLabel={t(locale, 'attendance.absence.title')} live tone="danger">
          {t(locale, messageKey(error))}
        </Alert>
      ) : null}

      <fieldset data-testid="absence-children">
        <legend>{t(locale, 'attendance.absence.chooseChild')}</legend>
        {children.map((child) => (
          <Radio
            checked={child.id === studentId}
            key={child.id}
            label={child.display_name}
            name="absence-child"
            onChange={() => setStudentId(child.id)}
            value={child.id}
          />
        ))}
      </fieldset>

      <fieldset data-testid="absence-sessions">
        <legend>{t(locale, 'attendance.absence.chooseSession')}</legend>
        {sessions.map((session) => (
          <Radio
            checked={session.id === sessionId}
            key={session.id}
            label={`${session.group_name} · ${formatTimeInStudioZone(session.starts_at, locale)} · ${countdown(clock(), session.starts_at, locale)}`}
            name="absence-session"
            onChange={() => setSessionId(session.id)}
            value={session.id}
          />
        ))}
      </fieldset>

      <TextField
        label={t(locale, 'attendance.absence.reason')}
        onChange={(event) => setReason(event.target.value)}
        // `12a` finding 6 — `absence.reasonOptional` bundles `סיבה` and `לא חובה` into one
        // string while the artboard renders them as two elements. The bundled key is used
        // where it reads naturally, as the hint, and the label carries the bare noun.
        placeholder={t(locale, 'attendance.absence.reasonOptional')}
        value={reason}
      />

      <Button
        // §10.2 — disabled, not optimistic. A queued pre-report is a pre-report that syncs
        // after the lesson, which is not a pre-report at all.
        disabled={!connected || studentId === '' || sessionId === ''}
        onClick={() => void submit()}
        variant="primary"
      >
        {t(locale, 'attendance.absence.submit')}
      </Button>

      {/* What the coach will see. `12a`'s disclaimer, minus its billing half — see the file
          header for why that sentence is not here. */}
      <p data-testid="absence-disclaimer">{t(locale, 'attendance.source.preReportedHint')}</p>
    </section>
  )

  async function submit(): Promise<void> {
    setError(null)
    try {
      await client.report({ studentId, sessionId, reason })
      setSubmitted(true)
    } catch (caught) {
      setError(caught instanceof AbsenceRefused ? caught.code : 'unknown')
    }
  }
}

/** The server's code to the key the screen renders. Every one of these already exists in the
 *  namespace; none of them is a sentence the server sent. */
function messageKey(error: AbsenceError): string {
  if (error === 'too_late') return 'attendance.absence.tooLate'
  if (error === 'already_reported') return 'attendance.absence.alreadyReported'
  if (error === 'offline') return 'attendance.absence.requiresConnectionHint'
  return 'attendance.sync.failed'
}
