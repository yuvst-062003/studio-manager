// Option B's answer to the home screen's one question (owner decision, 2026-09-01):
// what is next, whose is it, and does it need me.
//
// The screen used to be a flat list of near-identical rows where the soonest lesson had
// no more weight than one six days away. This card gives the next one the whole top of
// the screen, and puts the answer to "does anything need me" on it rather than three taps
// away behind `#/absence`.
//
// **Two buttons, not one negative.** Before this, a parent could only say "not coming",
// and saying nothing meant both "we are coming" and "nobody has looked at this" — a coach
// could not tell those apart. `attendance_confirmation` (revision 0020) makes the yes a
// real answer, so the control has two sides and a third, unanswered state it starts in.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { formatTimeInStudioZone } from '@studio/core'
import { Icon } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { IntentError } from './intentClient'
import type { Intent, IntentClient } from './intentClient'

const cardStyle: CSSProperties = {
  background: 'var(--emphasis)',
  color: 'var(--on-emphasis)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

const eyebrowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  fontSize: 'var(--text-micro)',
  fontWeight: 'var(--weight-semibold)',
  letterSpacing: '0.06em',
}

const headlineStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 'var(--space-3)',
}

/** The two sides of the answer. Equal width, so neither reads as the expected one. */
const choicesStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 'var(--space-2)',
}

function choiceStyle(selected: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-1)',
    minBlockSize: '46px',
    borderRadius: 'var(--radius-md)',
    // Selected is a filled chip; unselected is an outline on the card's own fill. The
    // tick below carries the same fact, because D-never-colour-alone applies to a
    // selected state as much as to a status.
    background: selected ? 'var(--surface)' : 'transparent',
    color: selected ? 'var(--emphasis)' : 'var(--on-emphasis)',
    border: selected ? 'none' : '1px solid currentcolor',
    font: 'inherit',
    fontSize: 'var(--text-body)',
    fontWeight: selected ? 'var(--weight-semibold)' : 'var(--weight-regular)',
    cursor: 'pointer',
  }
}

export type NextLesson = {
  sessionId: string
  studentId: string
  studentName: string
  groupName: string
  startsAt: string
  beltColorHex: string | null
}

/**
 * `intent` is the SERVER's answer, passed down. The card owns only the in-flight state,
 * so a refused write leaves the button showing what the club actually knows rather than
 * what the parent hoped — the failure §10.2 calls "worthless if it lands after the
 * lesson", made visible instead of silent.
 */
export function NextLessonCard({
  locale,
  lesson,
  intent,
  client,
  onChanged,
}: {
  locale: Locale
  lesson: NextLesson
  intent: Intent
  client: IntentClient
  onChanged: () => void
}) {
  const [sending, setSending] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  const answer = async (next: 'coming' | 'not_coming') => {
    setSending(true)
    setRefusal(null)
    try {
      if (next === 'coming') {
        await client.confirm(lesson.sessionId, lesson.studentId)
      } else {
        await client.reportAbsence(lesson.sessionId, lesson.studentId)
      }
      onChanged()
    } catch (error) {
      // The code names WHICH refusal, so the parent reads "the lesson has started" rather
      // than a generic failure they cannot act on.
      const code = error instanceof IntentError ? error.code : 'unknown'
      setRefusal(
        code === 'too_late'
          ? t(locale, 'attendance.absence.tooLate')
          : code === 'already_marked'
            ? t(locale, 'attendance.absence.alreadyReported')
            : t(locale, 'attendance.absence.requiresConnection'),
      )
    } finally {
      setSending(false)
    }
  }

  const said =
    intent === 'coming'
      ? t(locale, 'attendance.intent.confirmed')
      : intent === 'not_coming'
        ? t(locale, 'attendance.intent.reported')
        : t(locale, 'attendance.intent.prompt')

  return (
    <section style={cardStyle} data-testid="parent-home-next-lesson" aria-live="polite">
      <div style={eyebrowStyle}>
        <span>{t(locale, 'common.home.nextLesson')}</span>
      </div>

      <div style={headlineStyle}>
        {/* D7 — a belt bar is never fill-only, so the ring is the card's own foreground
            and a white belt stays visible on the brand fill.

            Absent entirely when the child has no belt yet, rather than drawn as an empty
            outline: `/me/students` carries no `belt_color_hex` today, so every family
            would otherwise get a hairline sliver that means nothing. It renders the day
            the payload grows the field, and until then the card is one thing quieter. */}
        {lesson.beltColorHex === null ? null : (
          <span
            aria-hidden="true"
            style={{
              inlineSize: '5px',
              blockSize: '46px',
              borderRadius: 'var(--radius-xs)',
              background: lesson.beltColorHex,
              border: 'var(--belt-ring-width) solid currentcolor',
              flex: 'none',
            }}
          />
        )}
        <div style={{ flex: 1, minInlineSize: 0 }}>
          <div style={{ fontSize: 'var(--text-display)', fontWeight: 'var(--weight-bold)', lineHeight: 'var(--leading-snug)' }}>
            <bdi>{lesson.studentName}</bdi>
          </div>
          <div style={{ fontSize: 'var(--text-label)' }}>
            <bdi>{lesson.groupName}</bdi>
          </div>
        </div>
        <div style={{ fontSize: 'var(--text-display)', fontWeight: 'var(--weight-bold)' }}>
          {formatTimeInStudioZone(lesson.startsAt, locale)}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span style={{ fontSize: 'var(--text-micro)' }}>{said}</span>
        <div style={choicesStyle} role="group" aria-label={t(locale, 'attendance.intent.prompt')}>
          <button
            type="button"
            data-testid="intent-coming"
            aria-pressed={intent === 'coming'}
            disabled={sending}
            style={choiceStyle(intent === 'coming')}
            onClick={() => void answer('coming')}
          >
            {intent === 'coming' ? <Icon name="check" size={15} /> : null}
            {t(locale, 'attendance.intent.coming')}
          </button>
          <button
            type="button"
            data-testid="intent-not-coming"
            aria-pressed={intent === 'not_coming'}
            disabled={sending}
            style={choiceStyle(intent === 'not_coming')}
            onClick={() => void answer('not_coming')}
          >
            {intent === 'not_coming' ? <Icon name="check" size={15} /> : null}
            {t(locale, 'attendance.intent.notComing')}
          </button>
        </div>
        {refusal === null ? (
          <span style={{ fontSize: 'var(--text-micro)' }}>
            {t(locale, 'attendance.intent.changeable')}
          </span>
        ) : (
          <span data-testid="intent-refusal" style={{ fontSize: 'var(--text-micro)', fontWeight: 'var(--weight-semibold)' }}>
            {refusal}
          </span>
        )}
      </div>
    </section>
  )
}
