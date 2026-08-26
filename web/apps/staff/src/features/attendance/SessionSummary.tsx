// Staff artboard `9g` — סיכום מפגש. What a coach does after the register.
//
// **No exam or belt affordance appears anywhere**, and that is `9g` finding 8: the artboard's
// own title says "without an exam recommendation", and §5.9 makes eligibility a manager's
// calculation from rank and time in grade, not a coach's impression at the end of a lesson.
// Recorded here so a later reader does not "complete" the screen by adding one.
//
// **The injury-report card is not built** — `9g` finding 1. The artboard promises it reaches
// a manager and a parent *immediately*, which is a notification kind with no
// `comms.preferences.kind.*` member, an audit-relevant record with no table, and almost
// certainly health-adjacent data about a minor (G7). It cannot be built from a card, and
// building three-quarters of it would ship a button that silently does nothing with an
// injury. Deferred to whichever wave gives it a model.
//
// **The note card states its audience**, which `9g` finding 2 says the artboard does not —
// on a screen where both its neighbours do. §5.13: session notes are "visible to coaches of
// that student's groups and to all managers. **Never visible to guardians.**" A coach
// writing about a child should know who reads it.
import { useState } from 'react'
import { Button, Card, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { queueMark, usePendingCount } from '@studio/core'
import type { RosterRow as RosterRowData } from '@studio/core'

export function SessionSummary({
  sessionId,
  roster,
  locale,
  personId,
  clock = () => new Date().toISOString(),
  onBackToRoster,
}: {
  sessionId: string
  roster: RosterRowData[]
  locale: Locale
  personId: string | null
  /** One clock per device — see `RosterScreen`'s own `clock` for why this is a function. */
  clock?: () => string
  onBackToRoster?: () => void
}) {
  const [note, setNote] = useState('')
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
          {counts.present} · {t(locale, 'attendance.roster.present')}
        </li>
        <li data-count="absent">
          {counts.absent} · {t(locale, 'attendance.roster.absent')}
        </li>
        {/* `9g` finding 3 — this state renders with no semantic colour here and `--pending`
            on `1c` and `9f`. One state, one role: the tile carries `data-count`, and the
            stylesheet gives all three their semantic token. */}
        <li data-count="pre-reported">
          {counts.preReported} · {t(locale, 'attendance.source.preReported')}
        </li>
      </ul>

      <p data-testid="summary-prompt">{t(locale, 'attendance.summary.whatNext')}</p>

      <Card caption={t(locale, 'schedule.note.title')}>
        <TextField
          label={t(locale, 'schedule.note.title')}
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
