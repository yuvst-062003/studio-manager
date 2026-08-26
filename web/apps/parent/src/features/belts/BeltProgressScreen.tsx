// Artboard 12d — התקדמות חגורה ומבחנים, the parent's belt view.
//
// **The canvas draws eleven belt fills and rings two of them**, both in a translucent tint
// rather than D7's solid foreground: the white segment and the white half of a bi-colour
// one. Yellow is bare, the header accent is bare, all four history bars are bare — and the
// CURRENT segment is bare, which is the one segment the whole screen exists to show. Every
// bar here is a `BeltBar`, which rings unconditionally.
//
// **Finding 4: the fill fades and the ring does not.** A future rung is dimmed to say "not
// yet"; the ring is a contrast obligation (SC 1.4.11), not decoration, so it stays at full
// strength. `segmentFill` puts the alpha in the fill alone.
//
// **Finding 3: the current rank is marked by more than height.** The canvas distinguishes
// it by height alone — no ring, no marker, no label — and a difference that is only a size
// is not available to a screen reader at all. `aria-current` says it.
//
// **Explicitly not `ProgressBar`.** A belt ladder is a discrete ranked sequence, not a
// continuous fill, and this is exactly the screen where someone would reach for it.
//
// **Finding 2, refused.** The canvas states "92% נוכחות" to a PARENT as a fact about their
// child. §5.9 computes eligibility from the current rank and time held; attendance has no
// column, and this is the fifth artboard to add it and the first to state it to a family.
//
// **Finding 1, cut.** The footer claims a promotion enqueues a physical belt for delivery.
// Three artboards describe that flow and none of them has a model or a notification kind.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { BeltBar, Card, EmptyState } from '@studio/ui'
import { formatDateInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { segmentFill, segmentStates } from './client'
import type { LadderRankOut, ParentBeltsClient, StudentBeltOut } from './client'

const pageStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }

const stripStyle: CSSProperties = {
  alignItems: 'flex-end',
  display: 'flex',
  gap: 'var(--space-1)',
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

const hintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const historyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  listStyle: 'none',
  margin: 0,
  paddingInlineStart: 0,
}

const historyRowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 'var(--space-2)',
}

export function BeltProgressScreen({
  classId,
  client,
  locale,
  studentId,
}: {
  classId: string
  client: ParentBeltsClient
  locale: Locale
  studentId: string
}) {
  const [ladder, setLadder] = useState<LadderRankOut[]>([])
  const [awards, setAwards] = useState<StudentBeltOut[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let live = true
    Promise.all([client.ladder(classId), client.studentBelts(studentId)])
      .then(([ladderPage, awardPage]) => {
        if (!live) return
        setLadder(ladderPage.items)
        setAwards(awardPage.items)
        setLoaded(true)
      })
      .catch(() => live && setLoaded(true))
    return () => {
      live = false
    }
  }, [classId, client, studentId])

  const states = segmentStates(ladder, awards)

  return (
    <div style={pageStyle}>
      <h2 style={{ margin: 0 }}>{t(locale, 'events.belt.progress')}</h2>

      {loaded && awards.length === 0 ? (
        <EmptyState title={t(locale, 'events.belt.none')} />
      ) : null}

      <Card caption={t(locale, 'events.belt.progressCaption')}>
        {/* The ladder runs by `dir`: rung 1 at the reading start in he, and at the other
            start in en. The array is NOT reversed and no gradient direction is hard-coded
            (D10) — flex under `dir` does the whole job. */}
        {/* Named, because the history list below renders a bar for the same ranks: without
            a name on each list, "the לבנה bar" is ambiguous to a screen reader in exactly the
            way it was ambiguous to the test. */}
        <ul aria-label={t(locale, 'events.belt.progress')} style={stripStyle}>
          {ladder.map((rank) => {
            const state = states.get(rank.id) ?? 'future'
            return (
              <li
                // More than height, so the current rank is available to a screen reader.
                aria-current={state === 'current' ? 'step' : undefined}
                key={rank.id}
                style={{ blockSize: state === 'current' ? '56px' : '42px', display: 'flex' }}
              >
                <BeltBar
                  colorHex={segmentFill(rank.color_hex, state)}
                  label={rank.name}
                  secondaryColorHex={
                    rank.secondary_color_hex
                      ? segmentFill(rank.secondary_color_hex, state)
                      : undefined
                  }
                />
              </li>
            )
          })}
        </ul>
      </Card>

      {/* The HISTORY, which is not the same list as "previous exams": a promotion can
          happen outside an exam, and `belt.awardOutsideExam` exists because it does. */}
      {awards.length > 0 ? (
        <Card>
          <ul aria-label={t(locale, 'events.belt.history')} style={historyStyle}>
            {awards.map((award) => (
              <li key={award.id} style={historyRowStyle}>
                <BeltBar
                  colorHex={award.color_hex}
                  label={award.belt_rank_name}
                  secondaryColorHex={award.secondary_color_hex ?? undefined}
                />
                <span>{award.belt_rank_name}</span>
                <span style={hintStyle}>
                  {t(locale, 'events.belt.awardedOn')}{' '}
                  {formatDateInStudioZone(award.awarded_on, locale)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* The one statement of the criteria §5.9 actually has. */}
      <p style={hintStyle}>{t(locale, 'events.exam.eligibleHint')}</p>
    </div>
  )
}
