// 2c's חגורה section (P2) — M7's quarter of the card, the one every wave left for
// someone else. Current belt with its D7-ringed bar, the award date, and the past
// promotions beneath. The full progression stays on 12d, one tap away.
import { useEffect, useMemo, useState } from 'react'
import { apiFetch, formatDateInStudioZone } from '@studio/core'
import { BeltBar, registerSlot } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { makeParentBeltsClient } from './client'
import type { StudentBeltOut } from './client'

export function StudentCardBeltSection({
  student,
  locale,
}: {
  student: { id: string; first_name: string; last_name: string }
  locale: Locale
}) {
  const client = useMemo(() => makeParentBeltsClient(apiFetch), [])
  const [awards, setAwards] = useState<StudentBeltOut[] | null>(null)

  useEffect(() => {
    let live = true
    client
      .studentBelts(student.id)
      .then((page) => live && setAwards([...page.items].sort((a, b) => (a.awarded_on < b.awarded_on ? 1 : -1))))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client, student.id])

  if (awards === null || awards.length === 0) return null
  const current = awards[0]!

  return (
    <section aria-labelledby={`belt-${student.id}`} data-testid="student-card-belt">
      <h2 id={`belt-${student.id}`}>{t(locale, 'events.belt.title')}</h2>
      <BeltBar colorHex={current.color_hex} label={current.belt_rank_name} />
      <p>
        <bdi>{current.belt_rank_name}</bdi> · {formatDateInStudioZone(`${current.awarded_on}T12:00:00Z`, locale)}
        {' · '}
        {/* 12d's first real entry point — the progression screen was routed and linked
            from nothing. */}
        <a data-testid="belt-progress-link" href={`#/belts/${student.id}/${current.class_id}`}>
          {t(locale, 'events.belt.progressLink')}
        </a>
      </p>
      {awards.length > 1 ? (
        <ol data-testid="belt-history">
          {awards.slice(1).map((award) => (
            <li key={award.belt_rank_id + award.awarded_on}>
              <bdi>{award.belt_rank_name}</bdi> ·{' '}
              {formatDateInStudioZone(`${award.awarded_on}T12:00:00Z`, locale)}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}

/** One file plus one line — seam 4's shape. Order 20: the belt is 2c's first section
 *  after the header, between M3's details (10) and enrollments (30). */
export function registerBeltSections(): void {
  registerSlot<{ student: { id: string; first_name: string; last_name: string }; locale: Locale }>(
    'student-card',
    { key: 'belts-current', order: 20, render: StudentCardBeltSection },
  )
}
