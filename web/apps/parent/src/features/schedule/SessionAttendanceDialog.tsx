// The popup a lesson opens on לוח הילד — "מגיעים לשיעור?" (owner request, 2026-08-30).
//
// **This is a pre-report, not a register.** The two answers are not symmetric and the
// asymmetry is the whole design:
//
//   לא מגיעים  writes an `absence_report`, which §5.7 also lands as an `absent_excused`
//              attendance row with `source = parent`. That is a real notice: it reaches
//              the coach's roster before the lesson, and §10.5 protects it from being
//              overwritten by a bulk "everyone present".
//   מגיעים     writes NOTHING when nothing was reported. A parent cannot mark their own
//              child present — attendance is the coach's, taken on the mat — so the
//              button's only job is to UNDO a report that already exists. Saying "רשמנו
//              שאתם מגיעים" over an empty write is the one thing this dialog must not do,
//              because a family who reads it will stop telling the club anything.
//
// **The deadline is the server's.** `report_absence` refuses once `now >= starts_at`, and
// a phone an hour behind would otherwise file a pre-report for a lesson in progress. The
// disabled state below is a courtesy that saves a round trip; the refusal is what decides,
// and `too_late` comes back as a code so §9 owns the sentence.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, StatusChip, TextField, useModalDialog } from '@studio/ui'
import { formatDateInStudioZone, formatTimeInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { SessionRow } from './client'

export type AttendanceChild = { id: string; first_name: string; last_name: string }

/** `${sessionId}:${studentId}` — the pairs this family has already reported absent. */
export type ReportedKey = string

export const reportedKey = (sessionId: string, studentId: string): ReportedKey =>
  `${sessionId}:${studentId}`

const scrimStyle: CSSProperties = {
  background: 'color-mix(in srgb, var(--fg) 45%, transparent)',
  insetBlock: 0,
  insetInline: 0,
  position: 'fixed',
  zIndex: 40,
}

const dialogStyle: CSSProperties = {
  background: 'var(--surface)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-lg, 0 10px 40px rgba(0,0,0,.25))',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  insetBlockStart: '50%',
  insetInlineStart: '50%',
  maxBlockSize: '85vh',
  maxInlineSize: '28rem',
  overflowY: 'auto',
  padding: 'var(--space-4)',
  position: 'fixed',
  transform: 'translate(-50%, -50%)',
  inlineSize: 'calc(100% - var(--space-4) * 2)',
  zIndex: 41,
}

const headerStyle: CSSProperties = { alignItems: 'center', display: 'flex', gap: 'var(--space-3)' }

const lessonStyle: CSSProperties = {
  borderBlockEnd: 'var(--border-width-hairline) solid var(--border)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  paddingBlockEnd: 'var(--space-3)',
}

const metaStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  fontSize: 'var(--text-caption)',
}

const answerRowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  minBlockSize: '44px',
}

const nameStyle: CSSProperties = { flex: 1, minInlineSize: '6rem' }

export function SessionAttendanceDialog({
  locale,
  sessions,
  children,
  reported,
  now,
  onReport,
  onCancelReport,
  onClose,
}: {
  locale: Locale
  /** Every lesson on that day. A family with two children in two groups gets two. */
  sessions: readonly SessionRow[]
  children: readonly AttendanceChild[]
  reported: ReadonlySet<ReportedKey>
  /** The same ISO instant the calendar decides upcoming-vs-past against. Never `new Date()`. */
  now: string
  onReport: (sessionId: string, studentId: string, reason: string | null) => Promise<void>
  onCancelReport: (sessionId: string, studentId: string) => Promise<void>
  onClose: () => void
}) {
  // Always open — the caller's conditional IS the open state (BookingDialog's convention).
  const dialogRef = useModalDialog(true, onClose)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  // Which (session, child) is mid-answer, and the reason being typed for it. One at a
  // time: two open reason boxes are two things a parent can press send on by mistake.
  const [asking, setAsking] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  function run(key: string, action: () => Promise<void>, message: string) {
    if (busy) return
    setBusy(key)
    setError(null)
    setSaved(null)
    action()
      .then(() => {
        setSaved(message)
        setAsking(null)
        setReason('')
      })
      .catch((cause: unknown) => {
        const code = cause instanceof Error ? cause.message : 'unknown'
        setError(
          code === 'too_late'
            ? t(locale, 'schedule.calendar.attend.tooLate')
            : code === 'already_reported'
              ? t(locale, 'schedule.calendar.attend.alreadyNotComing')
              : t(locale, 'common.error.generic'),
        )
      })
      .finally(() => setBusy(null))
  }

  return (
    <>
      {/* Pointer furniture. The close affordances for assistive tech are the button below
          and Escape, both from `useModalDialog`. */}
      <div aria-hidden="true" onClick={onClose} style={scrimStyle} />
      <div
        aria-labelledby="attend-dialog-title"
        aria-modal="true"
        data-testid="attend-dialog"
        ref={dialogRef}
        role="dialog"
        style={dialogStyle}
        tabIndex={-1}
      >
        <div style={headerStyle}>
          <h2 id="attend-dialog-title" style={{ fontSize: 'var(--text-title)', margin: 0 }}>
            {t(locale, 'schedule.calendar.attend.title')}
          </h2>
          <span style={{ marginInlineStart: 'auto' }}>
            <Button data-testid="attend-close" onClick={onClose} variant="ghost">
              {t(locale, 'schedule.calendar.attend.close')}
            </Button>
          </span>
        </div>

        {error ? (
          <Alert iconLabel={t(locale, 'schedule.calendar.attend.title')} live tone="danger">
            <span data-testid="attend-error">{error}</span>
          </Alert>
        ) : null}
        {saved ? (
          <Alert iconLabel={t(locale, 'schedule.calendar.attend.title')} live tone="paid">
            <span data-testid="attend-saved">{saved}</span>
          </Alert>
        ) : null}

        {sessions.length === 0 ? (
          <p data-testid="attend-none">{t(locale, 'schedule.calendar.attend.noSessions')}</p>
        ) : null}

        {sessions.map((session) => {
          // Three reasons a lesson takes no answer, and each one says which rather than
          // rendering a dead button: the club cancelled it, it already happened, or the
          // deadline passed. `starts_at <= now` covers the last two together.
          const past = session.starts_at <= now
          const cancelled = session.status === 'cancelled'
          const blocked = past || cancelled
          return (
            <section aria-label={session.group_name} key={session.id} style={lessonStyle}>
              <strong>{session.group_name}</strong>
              <div style={metaStyle}>
                <span>{formatDateInStudioZone(session.starts_at, locale)}</span>
                <span>
                  {formatTimeInStudioZone(session.starts_at, locale)}
                  {'–'}
                  {formatTimeInStudioZone(session.ends_at, locale)}
                </span>
                {session.location_name ? <span>{session.location_name}</span> : null}
              </div>

              {blocked ? (
                <p data-testid="attend-blocked">
                  {t(
                    locale,
                    cancelled
                      ? 'schedule.calendar.attend.cancelled'
                      : 'schedule.calendar.attend.past',
                  )}
                </p>
              ) : (
                children.map((child) => {
                  const key = reportedKey(session.id, child.id)
                  const isReported = reported.has(key)
                  return (
                    <div data-testid="attend-row" key={key} style={answerRowStyle}>
                      {/* One child needs no name repeated on every row; two do. */}
                      {children.length > 1 ? (
                        <span style={nameStyle}>
                          <bdi>{child.first_name}</bdi>
                        </span>
                      ) : null}
                      {isReported ? (
                        <StatusChip
                          label={t(locale, 'schedule.calendar.attend.notComing')}
                          status="pending"
                        />
                      ) : null}
                      <Button
                        aria-pressed={!isReported}
                        data-testid="attend-coming"
                        disabled={busy !== null}
                        onClick={() => {
                          // Nothing was reported, so there is nothing to undo and nothing
                          // to write. Close rather than claim a save that did not happen.
                          if (!isReported) {
                            onClose()
                            return
                          }
                          run(
                            key,
                            () => onCancelReport(session.id, child.id),
                            t(locale, 'schedule.calendar.attend.comingSaved'),
                          )
                        }}
                        variant={isReported ? 'secondary' : 'primary'}
                      >
                        {t(locale, 'schedule.calendar.attend.coming')}
                      </Button>
                      <Button
                        aria-pressed={isReported}
                        data-testid="attend-not-coming"
                        disabled={busy !== null || isReported}
                        onClick={() => {
                          setError(null)
                          setSaved(null)
                          setReason('')
                          setAsking(key)
                        }}
                        variant={isReported ? 'primary' : 'secondary'}
                      >
                        {t(locale, 'schedule.calendar.attend.notComing')}
                      </Button>

                      {asking === key ? (
                        <div
                          data-testid="attend-reason"
                          style={{ display: 'flex', gap: 'var(--space-2)', inlineSize: '100%' }}
                        >
                          <TextField
                            label={t(locale, 'schedule.calendar.attend.reason')}
                            name={`attend-reason-${key}`}
                            onChange={(event) => setReason(event.target.value)}
                            value={reason}
                          />
                          <Button
                            data-testid="attend-send"
                            disabled={busy !== null}
                            onClick={() =>
                              run(
                                key,
                                () =>
                                  onReport(session.id, child.id, reason.trim() === '' ? null : reason.trim()),
                                t(locale, 'schedule.calendar.attend.notComingSaved'),
                              )
                            }
                            variant="primary"
                          >
                            {t(locale, 'schedule.calendar.attend.send')}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  )
                })
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}
