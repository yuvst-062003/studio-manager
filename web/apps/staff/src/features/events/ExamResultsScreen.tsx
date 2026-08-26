// Artboard 9d, frame 2 — רישום תוצאות.
//
// **Finding 1: the artboard has no way to record a result.** Its rows carry no pointer and
// no handler; it is a static picture of already-computed results, so it shows the
// destination and not the mechanism. Tap-to-cycle is the natural interaction — 1c and 9f
// already cycle a roster row for attendance — and it is what this screen does.
//
// **Finding 3: `ExamResultMark`, never `AttendanceMark`.** Same three shapes, different
// domain. See ExamResultMark.tsx.
//
// **Finding 4: ship `events.exam.passPromotesHint`.** It is better than the drawn caption
// because it scopes the consequence to a PASS and names the promotion, where the caption
// reads as if saving updates "the belt" generally. And a bulk write to belt rows gets the
// confirmation the artboard does not draw.
//
// **Finding 2, refused: no makeup sitting.** Two places on the artboard depend on one and
// §5.9 has no column for it. A second exam is a second `event`; nothing links them.
//
// **Nothing says a parent will be told.** §5.9 step 4 is M8's, and the key deliberately
// says nothing about notifying — which the audit noticed about the drawn caption too.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, Card, EmptyState, useModalDialog } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { BeltPair } from './BeltPair'
import { ExamResultMark, nextResult } from './ExamResultMark'
import type { ExamResult } from './ExamResultMark'
import type { CandidateOut, EventOut, StaffEventsClient } from './client'

const pageStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }

const rowStyle: CSSProperties = {
  alignItems: 'center',
  background: 'var(--surface)',
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  display: 'flex',
  gap: 'var(--space-3)',
  inlineSize: '100%',
  paddingBlock: 'var(--space-2)',
  paddingInline: 'var(--space-3)',
  textAlign: 'start',
}

const nameStyle: CSSProperties = {
  color: 'var(--fg)',
  fontSize: 'var(--text-body)',
  fontWeight: 'var(--weight-medium)',
}

const hintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const tilesStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-2)',
  gridTemplateColumns: 'repeat(3, 1fr)',
}

const dialogStyle: CSSProperties = {
  background: 'var(--surface)',
  border: 'var(--border-width-strong) solid var(--border-strong)',
  borderRadius: 'var(--radius-lg)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  padding: 'var(--space-4)',
}

export function ExamResultsScreen({
  client,
  eventId,
  locale,
}: {
  client: StaffEventsClient
  eventId: string
  locale: Locale
}) {
  const [exam, setExam] = useState<EventOut | null>(null)
  const [candidates, setCandidates] = useState<CandidateOut[]>([])
  const [loaded, setLoaded] = useState(false)
  const [marks, setMarks] = useState<Record<string, ExamResult>>({})
  const [confirming, setConfirming] = useState(false)
  // Moves focus in on open, traps Tab, closes on Escape, and restores focus to the button
  // that opened it. Escape matters most here: it is what a coach presses first.
  const dialogRef = useModalDialog(confirming, () => setConfirming(false))
  const [saved, setSaved] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    Promise.all([client.read(eventId), client.eligibility(eventId)])
      .then(([fresh, page]) => {
        if (!live) return
        setExam(fresh)
        setCandidates(page.items)
        setLoaded(true)
      })
      .catch(() => live && setLoaded(true))
    return () => {
      live = false
    }
  }, [client, eventId])

  const resultFor = (studentId: string): ExamResult => marks[studentId] ?? 'pending'

  const cycle = (studentId: string) =>
    setMarks((current) => ({ ...current, [studentId]: nextResult(resultFor(studentId)) }))

  const decided = candidates.filter((row) => resultFor(row.student_id) !== 'pending')

  const save = async () => {
    const results = decided
      // A pass needs somewhere to go. A candidate at the top of the ladder cannot be
      // promoted, and the server would refuse the award anyway.
      .filter((row) => resultFor(row.student_id) === 'fail' || row.next_rank !== null)
      .map((row) => ({
        student_id: row.student_id,
        belt_rank_id: (row.next_rank ?? row.current_rank)!.id,
        result: resultFor(row.student_id) as 'pass' | 'fail',
        note: null,
      }))
    if (results.length === 0) return
    setConfirming(false)
    try {
      await client.recordResults(eventId, results)
      setSaved(true)
    } catch {
      setFailed(true)
    }
  }

  if (!exam) return <p style={hintStyle}>{t(locale, 'events.list.loading')}</p>

  const passed = decided.filter((row) => resultFor(row.student_id) === 'pass').length
  const failedCount = decided.filter((row) => resultFor(row.student_id) === 'fail').length

  return (
    <div style={pageStyle}>
      <header>
        <h2 style={{ margin: 0 }}>{exam.title}</h2>
        <p style={hintStyle}>{t(locale, 'events.exam.record')}</p>
      </header>

      {failed ? (
        <Alert iconLabel={t(locale, 'events.form.errorTitle')} live tone="danger">
          {t(locale, 'events.form.errorTitle')}
        </Alert>
      ) : null}
      {saved ? (
        <Alert iconLabel={t(locale, 'events.exam.recorded')} live tone="paid">
          {t(locale, 'events.exam.recorded')}
        </Alert>
      ) : null}

      <div style={tilesStyle}>
        <Card>
          <p style={hintStyle}>{t(locale, 'events.exam.result.pass')}</p>
          <p style={nameStyle}>{passed}</p>
        </Card>
        <Card>
          <p style={hintStyle}>{t(locale, 'events.exam.result.fail')}</p>
          <p style={nameStyle}>{failedCount}</p>
        </Card>
        <Card>
          <p style={hintStyle}>{t(locale, 'events.exam.result.pending')}</p>
          <p style={nameStyle}>{candidates.length - decided.length}</p>
        </Card>
      </div>

      {loaded && candidates.length === 0 ? (
        <EmptyState title={t(locale, 'events.exam.empty')} />
      ) : (
        candidates.map((row) => {
          const result = resultFor(row.student_id)
          return (
            <button
              aria-label={row.student_display_name}
              key={row.student_id}
              onClick={() => cycle(row.student_id)}
              style={rowStyle}
              type="button"
            >
              <ExamResultMark locale={locale} result={result} />
              <span style={nameStyle}>{row.student_display_name}</span>
              {/* On a FAIL the transition collapses to the unchanged rank: one swatch, no
                  arrow. The artboard's best idea — "no change" shown rather than said. An
                  unmarked row still previews what a pass WOULD grant, which is also right:
                  it shows the consequence before anyone decides. */}
              <BeltPair
                current={row.current_rank}
                locale={locale}
                next={result === 'fail' ? null : row.next_rank}
              />
            </button>
          )
        })
      )}

      {/* The key, not the drawn caption: it scopes the consequence to a PASS and names the
          promotion, where the caption reads as if saving updates "the belt" generally. */}
      <p style={hintStyle}>{t(locale, 'events.exam.passPromotesHint')}</p>

      {confirming ? (
        <div
          aria-label={t(locale, 'events.exam.save')}
          // `aria-modal` and the trap arrive together, deliberately. The attribute alone told
          // a screen reader the rest of the screen was unavailable while Tab still walked
          // straight out of this dialog and back into the roster behind it — and what this
          // one confirms is an irreversible bulk write that promotes every passing student.
          aria-modal="true"
          ref={dialogRef}
          role="alertdialog"
          style={dialogStyle}
          tabIndex={-1}
        >
          <p style={{ margin: 0 }}>{t(locale, 'events.exam.passPromotesHint')}</p>
          <span style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button onClick={() => void save()} variant="primary">
              {t(locale, 'events.exam.save')}
            </Button>
            <Button onClick={() => setConfirming(false)} variant="secondary">
              {t(locale, 'events.form.cancel')}
            </Button>
          </span>
        </div>
      ) : (
        <p style={{ margin: 0 }}>
          <Button
            disabled={decided.length === 0}
            onClick={() => setConfirming(true)}
            variant="primary"
          >
            {t(locale, 'events.exam.save')}
          </Button>
        </p>
      )}
    </div>
  )
}
