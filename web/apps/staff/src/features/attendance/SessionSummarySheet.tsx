// סיכום מפגש — what a coach does after the register, as a popup (owner, 2026-10-13).
//
// **What this replaces.** `9g` shipped as a screen at `#/attendance/<id>/summary` with three
// cards: the counts, a note, and an injury report that drew ONE RADIO PER STUDENT. On a
// phone, at the end of a lesson, that was sixteen radios in a cramped grid above the box the
// coach actually wanted — and the owner's verdict was the plain one: "no need to box every
// student for injury, only a place to write how it was and specific things".
//
// So: two boxes, and the roster is not in the dialog at all.
//
//   * **איך היה השיעור** — the session note. §5.13's audience, stated: coaches of the
//     student's groups and all managers, never guardians. Queued like a mark, because a
//     coach writing up a lesson in a basement is the ordinary case (§10.2: "Writable,
//     queued").
//   * **משהו חריג** — optional, and the one thing that leaves immediately. It is the same
//     `health.injury` route the radio grid used, now callable with no child named: without a
//     student there are no guardians to notify, so it reaches the MANAGERS and the manager
//     phones the family. Online-only, the mirror of the parent's absence pre-report — a
//     report that syncs after everyone has gone home is not a report.
//
// The counts ride in the header as one line rather than three tiles: a dialog opened on
// purpose does not need to re-teach the numbers the register behind it already shows.
import { useState } from 'react'
import { ClipboardList, X } from 'lucide-react'
import { useModalDialog } from '@studio/ui'
import { queueMark, useNetworkMode } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { RosterRow as RosterRowData } from '@studio/core'

export function SessionSummarySheet({
  sessionId,
  roster,
  locale,
  personId,
  clock = () => new Date().toISOString(),
  onClose,
  onReportSomething,
  heading,
}: {
  sessionId: string
  roster: RosterRowData[]
  locale: Locale
  personId: string | null
  /** One clock per device — see `RosterScreen`'s own `clock` for why this is a function. */
  clock?: () => string
  onClose: () => void
  /** Online-only, immediate, manager-only. Absent → the second box is withheld rather than
   *  rendered inert, the same rule the injury card always followed. */
  onReportSomething?: (description: string) => Promise<void>
  /** "קבוצה 4 · 16:00", from the roster screen that already has it. */
  heading?: string | null
}) {
  const dialogRef = useModalDialog(true, onClose)
  const [note, setNote] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)
  const [odd, setOdd] = useState('')
  const [oddState, setOddState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const mode = useNetworkMode()

  const present = roster.filter((row) => row.status === 'present').length
  const absent = roster.filter((row) => row.status === 'absent_unexcused').length

  function saveNote(): void {
    if (note.trim() === '') return
    // §10.2's table — session notes are "Writable, queued". The same path as a mark.
    void queueMark({
      clientMarkId: `${sessionId}:note:${clock()}`,
      kind: 'note.session',
      sessionId,
      studentId: null,
      payload: { body: note.trim() },
      deviceMarkedAt: clock(),
      personId,
    })
    setNote('')
    setNoteSaved(true)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-summary-title"
        tabIndex={-1}
        data-testid="session-summary-sheet"
        className="tw-scope bg-[var(--surface-raised)] w-full sm:max-w-sm max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-[var(--border)] space-y-4"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-[var(--emphasis-tint)] text-[var(--emphasis)] flex items-center justify-center shrink-0">
              <ClipboardList className="w-4 h-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="session-summary-title" className="text-sm font-black text-[var(--fg)] truncate">
                {t(locale, 'attendance.summary.title')}
              </h2>
              {/* The counts as one quiet line. Three tiles here would repeat, in a dialog,
                  what the register behind it is already showing. */}
              <p className="text-[11px] text-[var(--text-muted)] m-0 truncate" data-testid="summary-counts">
                {heading ? <>{heading} · </> : null}
                {present} {t(locale, 'attendance.roster.present')} · {absent}{' '}
                {t(locale, 'attendance.roster.absent')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(locale, 'people.profile.close')}
            data-testid="session-summary-close"
            className="w-9 h-9 rounded-lg bg-[var(--disabled-surface)] text-[var(--text-muted)] flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <label className="block">
          <span className="block text-xs font-bold text-[var(--fg)]">
            {t(locale, 'attendance.summary.howWasIt')}
          </span>
          <textarea
            data-testid="summary-note"
            rows={3}
            value={note}
            onChange={(event) => {
              setNote(event.currentTarget.value)
              setNoteSaved(false)
            }}
            placeholder={t(locale, 'schedule.note.placeholder')}
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
          {/* The audience, stated — §5.13 and `9g` finding 2, carried over unchanged. */}
          <span className="block text-[11px] text-[var(--text-muted)] mt-1" data-testid="summary-note-audience">
            {t(locale, 'attendance.summary.noteAudience')}
          </span>
        </label>

        {noteSaved ? (
          <p role="status" className="text-[11px] font-bold text-[var(--emphasis)] m-0" data-testid="summary-note-saved">
            {t(locale, 'people.emergency.saved')}
          </p>
        ) : null}

        {onReportSomething ? (
          <label className="block">
            <span className="block text-xs font-bold text-[var(--fg)]">
              {t(locale, 'attendance.summary.somethingOdd')}
            </span>
            <textarea
              data-testid="summary-odd"
              rows={2}
              value={odd}
              onChange={(event) => {
                setOdd(event.currentTarget.value)
                setOddState('idle')
              }}
              placeholder={t(locale, 'attendance.summary.somethingOddPlaceholder')}
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
            <span className="block text-[11px] text-[var(--text-muted)] mt-1" data-testid="summary-odd-audience">
              {t(locale, 'attendance.summary.somethingOddAudience')}
            </span>
          </label>
        ) : null}

        {oddState === 'sent' ? (
          <p role="status" className="text-[11px] font-bold text-[var(--emphasis)] m-0" data-testid="summary-odd-sent">
            {t(locale, 'attendance.summary.injury.sent')}
          </p>
        ) : null}
        {oddState === 'failed' ? (
          <p role="alert" className="text-[11px] font-bold text-[var(--danger)] m-0" data-testid="summary-odd-failed">
            {t(locale, 'attendance.summary.injury.failed')}
          </p>
        ) : null}
        {odd.trim() !== '' && mode !== 'online' ? (
          <p className="text-[11px] text-[var(--text-muted)] m-0" data-testid="summary-odd-offline">
            {t(locale, 'attendance.summary.injury.needsConnection')}
          </p>
        ) : null}

        <button
          type="button"
          data-testid="summary-save"
          disabled={
            oddState === 'sending' ||
            (note.trim() === '' && odd.trim() === '') ||
            (odd.trim() !== '' && mode !== 'online')
          }
          onClick={() => {
            saveNote()
            if (odd.trim() === '' || !onReportSomething) {
              onClose()
              return
            }
            setOddState('sending')
            onReportSomething(odd.trim())
              .then(() => {
                setOddState('sent')
                setOdd('')
                onClose()
              })
              .catch(() => setOddState('failed'))
          }}
          className="min-h-11 w-full rounded-xl bg-[var(--emphasis)] py-2 text-xs font-black text-[var(--on-emphasis)] disabled:bg-[var(--border)] disabled:text-[var(--text-muted)]"
        >
          {t(locale, oddState === 'sending' ? 'people.emergency.saving' : 'people.emergency.save')}
        </button>
      </div>
    </div>
  )
}
