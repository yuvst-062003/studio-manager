// Staff artboard `9g` — סיכום מפגש. What a coach does after the register.
//
// **No exam or belt affordance appears anywhere**, and that is `9g` finding 8: the artboard's
// own title says "without an exam recommendation", and §5.9 makes eligibility a manager's
// calculation from rank and time in grade, not a coach's impression at the end of a lesson.
// Recorded here so a later reader does not "complete" the screen by adding one.
//
// **The injury-report card ships (S2).** `9g` finding 1 deferred it "to whichever wave
// gives it a model"; the model turned out to already exist — `health.injury` rides the
// notification table with an always-on §5.11 prefix, and the audit row carries the
// recipient count and never the description (G7's discipline, applied to a record that
// is not itself a declaration). It is ONLINE-ONLY, the mirror of the parent's absence
// pre-report: an injury report that syncs after everyone has gone home is not a report —
// so the card renders only when the container supplies a real `onReportInjury`, and the
// submit disables offline rather than queueing into the void.
//
// **The note card states its audience**, which `9g` finding 2 says the artboard does not —
// on a screen where both its neighbours do. §5.13: session notes are "visible to coaches of
// that student's groups and to all managers. **Never visible to guardians.**" A coach
// writing about a child should know who reads it.
import { useState } from 'react'
import { Button, Card, Radio, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { queueMark, useNetworkMode, usePendingCount } from '@studio/core'
import type { RosterRow as RosterRowData } from '@studio/core'

export function SessionSummary({
  sessionId,
  roster,
  locale,
  personId,
  clock = () => new Date().toISOString(),
  onBackToRoster,
  onReportInjury,
}: {
  sessionId: string
  roster: RosterRowData[]
  locale: Locale
  personId: string | null
  /** One clock per device — see `RosterScreen`'s own `clock` for why this is a function. */
  clock?: () => string
  onBackToRoster?: () => void
  /** Online-only, immediate. When absent the injury card is withheld, never inert. */
  onReportInjury?: (studentId: string, description: string) => Promise<void>
}) {
  const [note, setNote] = useState('')
  const [injuryStudentId, setInjuryStudentId] = useState('')
  const [injuryText, setInjuryText] = useState('')
  const [injuryState, setInjuryState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const mode = useNetworkMode()
  const pending = usePendingCount()

  // `9g`'s three read-only tiles: present · absent · notified in advance.
  const counts = {
    present: roster.filter((row) => row.status === 'present').length,
    absent: roster.filter((row) => row.status === 'absent_unexcused').length,
    preReported: roster.filter((row) => row.has_absence_report).length,
  }

  return (
    <section aria-labelledby="summary-title" data-testid="session-summary">
      <h1 id="summary-title">{t(locale, 'attendance.summary.title')}</h1>

      <ul data-testid="summary-counts">
        <li data-count="present">
          <span className="count-number">{counts.present}</span>
          <span className="count-label">{t(locale, 'attendance.roster.present')}</span>
        </li>
        <li data-count="absent">
          <span className="count-number">{counts.absent}</span>
          <span className="count-label">{t(locale, 'attendance.roster.absent')}</span>
        </li>
        {/* `9g` finding 3 — this state renders with no semantic colour here and `--pending`
            on `1c` and `9f`. One state, one role: the tile carries `data-count`, and the
            stylesheet gives all three their semantic token. */}
        <li data-count="pre-reported">
          <span className="count-number">{counts.preReported}</span>
          <span className="count-label">{t(locale, 'attendance.source.preReported')}</span>
        </li>
      </ul>

      <p data-testid="summary-prompt">{t(locale, 'attendance.summary.whatNext')}</p>

      <Card caption={t(locale, 'schedule.note.title')}>
        <TextField
          // The card's caption is already `schedule.note.title`; labelling the field with
          // the same string gives the screen two elements with one accessible name, which
          // is ambiguous to a screen reader and to `getByLabelText` alike.
          label={t(locale, 'schedule.note.add')}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t(locale, 'schedule.note.placeholder')}
          value={note}
        />
        {/* The audience, stated. §5.13 and `9g` finding 2. The key is in THIS namespace and
            not in `schedule`: the sentence is about who reads a note, which is a §5.13 rule
            this lane is surfacing, and `schedule` is lane M2's file. */}
        <p data-testid="summary-note-audience">{t(locale, 'attendance.summary.noteAudience')}</p>
        <Button
          onClick={() => {
            if (note.trim() === '') return
            // §10.2's table — session notes are "Writable, queued". The same path as a
            // mark, for the same reason: a coach writing up a lesson in a basement is the
            // ordinary case.
            void queueMark({
              clientMarkId: `${sessionId}:note:${clock()}`,
              kind: 'note.session',
              sessionId,
              studentId: null,
              payload: { body: note },
              deviceMarkedAt: clock(),
              personId,
            })
            setNote('')
          }}
          variant="primary"
        >
          {t(locale, 'attendance.roster.addNote')}
        </Button>
      </Card>

      {onReportInjury ? (
        <Card caption={t(locale, 'attendance.summary.injury.title')}>
          {injuryState === 'sent' ? (
            <p data-testid="injury-sent">{t(locale, 'attendance.summary.injury.sent')}</p>
          ) : (
            <>
              <fieldset data-testid="injury-children">
                <legend>{t(locale, 'attendance.summary.injury.who')}</legend>
                {roster.map((row) => (
                  <Radio
                    checked={injuryStudentId === row.student_id}
                    key={row.student_id}
                    label={row.display_name}
                    name="injury-student"
                    onChange={() => setInjuryStudentId(row.student_id)}
                    value={row.student_id}
                  />
                ))}
              </fieldset>
              <TextField
                label={t(locale, 'attendance.summary.injury.what')}
                onChange={(event) => setInjuryText(event.target.value)}
                value={injuryText}
              />
              {/* Immediate or not at all — §10.2's absence-report reasoning, mirrored. */}
              {mode !== 'online' ? (
                <p data-testid="injury-offline">{t(locale, 'attendance.summary.injury.needsConnection')}</p>
              ) : null}
              {injuryState === 'failed' ? (
                <p data-testid="injury-failed">{t(locale, 'attendance.summary.injury.failed')}</p>
              ) : null}
              <Button
                data-testid="injury-send"
                disabled={
                  mode !== 'online' ||
                  injuryState === 'sending' ||
                  injuryStudentId === '' ||
                  injuryText.trim() === ''
                }
                onClick={() => {
                  setInjuryState('sending')
                  onReportInjury(injuryStudentId, injuryText.trim())
                    .then(() => setInjuryState('sent'))
                    .catch(() => setInjuryState('failed'))
                }}
                variant="destructive"
              >
                {t(locale, 'attendance.summary.injury.send')}
              </Button>
            </>
          )}
        </Card>
      ) : null}

      <Button onClick={onBackToRoster} variant="secondary">
        {t(locale, 'attendance.summary.backToRoster')}
      </Button>

      <footer>
        {/* `9g`'s persistent footer caption. Plain muted text, not a Toast — a Toast is
            transient and this is a standing statement about where the work is. */}
        <p data-testid="summary-sync">
          {pending > 0
            ? t(locale, 'attendance.network.offlineHint')
            : t(locale, 'attendance.sync.synced')}
        </p>
      </footer>
    </section>
  )
}
