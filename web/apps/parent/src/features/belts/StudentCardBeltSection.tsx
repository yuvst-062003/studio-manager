// 2c's חגורה rows (P2) — M7's quarter of the card, the one every wave left for someone
// else. Two entries, two frames: the swatch is the child's MARK and sits before their name;
// the grade, when it was awarded and the way through to `12d` are a ledger row.
//
// Splitting them is the point of the 2026-09-01 redesign. A belt is what a parent came to
// see, so its colour belongs where the child is named — but "כתומה · 14 במרץ 2026" is a
// fact like every other fact, and giving it a heading of its own is what made the old card
// read as eight screens stacked.
//
// The full progression stays on `12d`, one tap away.
import { useEffect, useMemo, useState } from 'react'
import { apiFetch, formatDateInStudioZone } from '@studio/core'
import { BeltBar, DetailRow, registerSlot } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { makeParentBeltsClient } from './client'
import type { StudentBeltOut } from './client'

type BeltProps = {
  student: { id: string; first_name: string; last_name: string }
  locale: Locale
}

/**
 * Every award this child holds, newest first, or `null` before the read lands.
 *
 * Both entries need the same list, and both are mounted at once inside one card. The
 * request is not deduplicated between them — that would need a cache neither lane owns —
 * so the swatch reads `current_belt_color_hex` off the summary the container already holds
 * and only the ROW fetches. One request per card, as before.
 */
function useAwards(studentId: string): StudentBeltOut[] | null {
  const client = useMemo(() => makeParentBeltsClient(apiFetch), [])
  const [awards, setAwards] = useState<StudentBeltOut[] | null>(null)

  useEffect(() => {
    let live = true
    client
      .studentBelts(studentId)
      .then(
        (page) =>
          live &&
          setAwards([...page.items].sort((a, b) => (a.awarded_on < b.awarded_on ? 1 : -1))),
      )
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client, studentId])

  return awards
}

/**
 * The header's belt swatch — the card's one spot of the child's own colour.
 *
 * Reads the summary the container already carries rather than fetching: `StudentSummaryOut`
 * has `current_belt_color_hex` and `current_belt_name`, which is exactly this, and a second
 * request for a colour the payload already holds is a request for nothing.
 *
 * `BeltBar` and never a bare swatch: D7's ring has no prop that turns it off, and a white
 * belt sits at 1.08:1 on the light ground.
 */
export function StudentCardBeltMark({
  student,
}: {
  student: { current_belt_color_hex?: string | null; current_belt_name?: string | null }
}) {
  if (!student.current_belt_color_hex) return null
  return (
    <span data-testid="student-card-belt-mark">
      <BeltBar
        colorHex={student.current_belt_color_hex}
        label={student.current_belt_name ?? ''}
      />
    </span>
  )
}

export function StudentCardBeltSection({ student, locale }: BeltProps) {
  const awards = useAwards(student.id)
  if (awards === null || awards.length === 0) return null
  const current = awards[0]!

  return (
    <DetailRow
      // 12d's first real entry point — the progression screen was routed and linked from
      // nothing at all.
      href={`#/belts/${student.id}/${current.class_id}`}
      label={t(locale, 'events.belt.one')}
      testId="student-card-belt"
    >
      <span>
        <bdi>{current.belt_rank_name}</bdi>
        {' · '}
        {formatDateInStudioZone(`${current.awarded_on}T12:00:00Z`, locale)}
      </span>
      {/* The belts BEFORE this one, which the brief asks for by name. A line each, inside
          the row — the card has one heading and this is not it. */}
      {awards.length > 1 ? (
        <span data-testid="belt-history" style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>
          {awards
            .slice(1)
            .map((award) => award.belt_rank_name)
            .join(' · ')}
        </span>
      ) : null}
    </DetailRow>
  )
}

/** One file plus one line — seam 4's shape. The swatch takes the header's `mark` frame;
 *  the row takes order 20, first in the ledger, because the belt is what a parent opened
 *  the card to see. */
export function registerBeltSections(): void {
  registerSlot<BeltProps & { student: { current_belt_color_hex?: string | null } }>(
    'student-card',
    { key: 'belts-mark', order: 10, region: 'mark', render: StudentCardBeltMark },
  )
  registerSlot<BeltProps>('student-card', {
    key: 'belts-current',
    order: 20,
    render: StudentCardBeltSection,
  })
}
