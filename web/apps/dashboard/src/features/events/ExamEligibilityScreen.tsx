// Artboard 4d — מבחן חגורה · זכאות וקידום.
//
// **Finding 2 decides the screen's shape.** The canvas conflates eligibility with the
// promotion decision: eligible rows arrive pre-checked and one button confirms promotion
// for whoever is ticked, with no exam RESULT entering anywhere. §5.9 makes a pass the thing
// that writes the belt row and updates the cache, in one transaction. So this screen
// records a pass for the selected candidates — `POST /events/{id}/exam-results` — and the
// promotion is what a pass does. There is no path here that awards a belt without a result.
//
// **Finding 1, refused.** The canvas gates a promotion on four things and §5.9 names one.
// Rank and tenure are the spec's; attendance, outstanding debt and a missing health
// declaration are the artboard's, and none of the three has a column. The debt gate would
// also put M6's balance on a screen §3.2 lets a lead coach open, which is the hard rule
// rather than a preference.
//
// **Finding 5, fixed.** A blocked row's checkbox is indistinguishable from an ineligible
// one on the canvas. There is one kind of ineligible left — no rank above the one held —
// and that row's checkbox is disabled and says why.
//
// **Finding 6, fixed.** No confirmation and no result state, on a screen that writes belt
// rows in bulk. `events.belt.groupPromoteHint` exists, is not drawn, and says exactly what
// the dialog needs to say.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, Checkbox, EmptyState, LoadFailed, StatusChip, useModalDialog } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { BeltTransition } from './BeltTransition'
import type { CandidateOut, DashboardEventsClient, EventOut } from './client'

const pageStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }

const scrollerStyle: CSSProperties = { overflowX: 'auto' }

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

const hintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
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

const actionsStyle: CSSProperties = { display: 'flex', gap: 'var(--space-2)' }

// Off-screen but IN the accessibility tree. Never `display: none`, which would remove the
// header from the tree along with the pixels — the same reasoning ThemeControl's off-screen
// radio records. Inline rather than a shared class because `packages/ui`'s stylesheet is
// not this lane's to add a utility to.
const offScreenStyle: CSSProperties = {
  blockSize: '1px',
  clipPath: 'inset(50%)',
  inlineSize: '1px',
  overflow: 'hidden',
  position: 'absolute',
  whiteSpace: 'nowrap',
}

export function ExamEligibilityScreen({
  client,
  eventId,
  locale,
}: {
  client: DashboardEventsClient
  eventId: string
  locale: Locale
}) {
  const [exam, setExam] = useState<EventOut | null>(null)
  const [candidates, setCandidates] = useState<CandidateOut[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const dialogRef = useModalDialog(confirming, () => setConfirming(false))
  const [promoted, setPromoted] = useState(false)
  const [failed, setFailed] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    Promise.all([client.read(eventId), client.eligibility(eventId)])
      .then(([fresh, page]) => {
        if (!live) return
        setExam(fresh)
        setCandidates(page.items)
        setLoaded(true)
      })
      // F1a — a failed load used to set `loaded` and render the loading line forever:
      // a dead end wearing a spinner. It says so and retries now.
      .catch(() => live && setLoadFailed(true))
    return () => {
      live = false
    }
  }, [client, eventId, attempt])

  const toggle = (studentId: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })

  const promote = async () => {
    const results = candidates
      .filter((candidate) => selected.has(candidate.student_id) && candidate.next_rank)
      .map((candidate) => ({
        student_id: candidate.student_id,
        // The rank being awarded is the NEXT one, never the current one. Sending the
        // current rank would record a pass that promotes nobody and trip
        // uq_student_belt_student_rank on a child who already holds it.
        belt_rank_id: candidate.next_rank!.id,
        result: 'pass' as const,
        note: null,
      }))
    if (results.length === 0) return
    setConfirming(false)
    try {
      // ONE call. §5.9 step 3 is one transaction, and a per-candidate call would leave a
      // half-promoted roster if the fourth failed.
      await client.recordResults(eventId, results)
      setPromoted(true)
      setSelected(new Set())
    } catch {
      setFailed(true)
    }
  }

  if (loadFailed) {
    return (
      <LoadFailed
        locale={locale}
        onRetry={() => {
          setLoadFailed(false)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }
  if (!exam) return <p style={hintStyle}>{t(locale, 'events.list.loading')}</p>

  return (
    <div style={pageStyle}>
      <header>
        <h2 style={{ margin: 0 }}>{exam.title}</h2>
        {/* `events.exam.eligibleHint` — the current rank and the time held in it. The one
            statement of the criteria §5.9 actually has. */}
        <p style={hintStyle}>{t(locale, 'events.exam.eligibleHint')}</p>
      </header>

      {failed ? (
        <Alert iconLabel={t(locale, 'events.form.errorTitle')} live tone="danger">
          {t(locale, 'events.form.errorTitle')}
        </Alert>
      ) : null}

      {promoted ? (
        <Alert iconLabel={t(locale, 'events.exam.promoted')} live tone="paid">
          {t(locale, 'events.exam.promoted')}
        </Alert>
      ) : null}

      {loaded && candidates.length === 0 ? (
        <EmptyState title={t(locale, 'events.exam.empty')} />
      ) : (
        <div style={scrollerStyle}>
          <table style={tableStyle}>
            <caption style={hintStyle}>{t(locale, 'events.exam.candidates')}</caption>
            <thead>
              <tr>
                {/* The select column is unlabelled on 4d, so its header is too — but it
                    still needs to exist, or the row's cells shift under the wrong headers
                    for anyone navigating the table by column. */}
                <th scope="col" style={headStyle}>
                  <span style={offScreenStyle}>{t(locale, 'events.exam.candidates')}</span>
                </th>
                <th scope="col" style={headStyle}>
                  {t(locale, 'people.student.one')}
                </th>
                <th scope="col" style={headStyle}>
                  {t(locale, 'events.belt.current')}
                </th>
                <th scope="col" style={headStyle}>
                  {t(locale, 'events.exam.tenureAtRank')}
                </th>
                <th scope="col" style={headStyle}>
                  {t(locale, 'events.exam.readiness')}
                </th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => (
                <tr key={candidate.student_id}>
                  <td style={cellStyle}>
                    <Checkbox
                      checked={selected.has(candidate.student_id)}
                      // 4d finding 5 — an ineligible candidate is not selectable, and the
                      // chip beside it says why rather than leaving a dead control.
                      disabled={!candidate.eligible}
                      label={candidate.student_display_name}
                      onChange={() => toggle(candidate.student_id)}
                    />
                  </td>
                  {/* The name ALONE. A chip in this cell joins the row header's
                      accessible name, so a screen reader announces "רן בר טרם זכאי" as the
                      row's identity — and the readiness column below is where that belongs
                      on 4d anyway. */}
                  <th scope="row" style={cellStyle}>
                    {candidate.student_display_name}
                  </th>
                  <td style={cellStyle}>
                    <BeltTransition
                      current={candidate.current_rank}
                      locale={locale}
                      next={candidate.next_rank}
                    />
                  </td>
                  <td style={cellStyle}>
                    {/* `null` is not zero: a child with no rank has no tenure in one, and
                        zero months would read as "awarded today". */}
                    {candidate.months_at_rank ?? '—'}
                  </td>
                  <td style={cellStyle}>
                    {candidate.eligible ? (
                      <StatusChip label={t(locale, 'events.exam.ready')} status="paid" />
                    ) : (
                      <StatusChip
                        label={t(locale, 'events.exam.notEligible')}
                        status="unmarked"
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirming ? (
        <div
          aria-label={t(locale, 'events.exam.confirmPromotion')}
          // The attribute and the trap arrive together. On its own `aria-modal` told a
          // screen reader the eligibility table was unavailable while Tab still walked
          // back into it — on the screen that performs an irreversible bulk promotion.
          aria-modal="true"
          ref={dialogRef}
          role="alertdialog"
          style={dialogStyle}
          tabIndex={-1}
        >
          {/* The key exists and the canvas never draws it — on the screen that performs an
              effectively irreversible bulk write. */}
          <p style={{ margin: 0 }}>{t(locale, 'events.belt.groupPromoteHint')}</p>
          <p style={hintStyle}>{t(locale, 'events.exam.passPromotesHint')}</p>
          <span style={actionsStyle}>
            <Button onClick={() => void promote()} variant="primary">
              {t(locale, 'events.exam.confirmPromotion')}
            </Button>
            <Button onClick={() => setConfirming(false)} variant="secondary">
              {t(locale, 'events.form.cancel')}
            </Button>
          </span>
        </div>
      ) : (
        <p style={{ margin: 0 }}>
          <Button
            disabled={selected.size === 0}
            onClick={() => setConfirming(true)}
            variant="primary"
          >
            {t(locale, 'events.exam.confirmPromotion')} · {selected.size}
          </Button>
        </p>
      )}
    </div>
  )
}
