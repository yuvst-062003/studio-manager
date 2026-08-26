// pass · fail · not yet examined.
//
// **A sibling of `AttendanceMark`, never a reuse of it.** 9d finding 3: the two are
// structurally identical — a filled check, a filled cross, a dashed dot — and semantically
// a different domain. `AttendanceState` is present | absent | notified | unmarked; an exam
// result is pass | fail | pending. Reusing the attendance-named component would make an
// exam result a kind of attendance, and the day one enum grows a member the other would
// inherit it.
//
// The audit's other option was to generalise the icon shape underneath both. That belongs
// in `@studio/ui`, which is not this lane's to restructure, so this is the sibling it names
// as the alternative — and the gap is reported.
//
// The state is never carried by colour alone (SC 1.4.1): each mark has an accessible name
// and a distinct glyph, and `data-result` is what the stylesheet keys on.
import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export type ExamResult = 'pass' | 'fail' | 'pending'

/** The cycle 1c and 9f use for attendance, over this domain's three states. */
export function nextResult(current: ExamResult): ExamResult {
  if (current === 'pending') return 'pass'
  if (current === 'pass') return 'fail'
  return 'pending'
}

const GLYPH: Record<ExamResult, string> = { pass: '✓', fail: '✕', pending: '·' }

const TONE: Record<ExamResult, string> = {
  pass: 'var(--paid)',
  fail: 'var(--danger)',
  pending: 'var(--pending)',
}

export function ExamResultMark({ result, locale }: { result: ExamResult; locale: Locale }) {
  const style: CSSProperties = {
    alignItems: 'center',
    blockSize: '42px',
    borderRadius: 'var(--radius-pill)',
    color: result === 'pending' ? TONE[result] : 'var(--on-fg)',
    display: 'inline-flex',
    flex: 'none',
    inlineSize: '42px',
    justifyContent: 'center',
    // Dashed for "not yet", filled for a decision — the same distinction 1c draws between
    // notified and unmarked, and the one 7c uses inside `--pending`.
    background: result === 'pending' ? 'transparent' : TONE[result],
    border:
      result === 'pending'
        ? `var(--border-width-strong) dashed ${TONE[result]}`
        : 'var(--border-width-strong) solid transparent',
  }
  return (
    <span
      aria-label={t(locale, `events.exam.result.${result}`)}
      className="studio-exam-mark"
      data-result={result}
      role="img"
      style={style}
    >
      {GLYPH[result]}
    </span>
  )
}
