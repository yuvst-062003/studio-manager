// 2c's בריאות row (P2) — M4's quarter: the declaration's STATUS and when it runs out. The
// contents never render anywhere a screen can reach (§5.5).
//
// **The expiry is new, and it is the point.** The old section rendered a chip and stopped,
// so a parent could see "הצהרה תקינה" and had no way to learn that it lapses in three
// weeks. `GET /students/{id}/health-declaration` is guardian-reachable and returns
// `valid_until` — flags only, never answers — so the fact was already one read away.
//
// **No action on this row, deliberately.** `HealthGate` does not decorate the app when a
// declaration is missing — it replaces it: "`children` is not rendered at all — not hidden,
// not disabled, not behind an overlay." So a child whose declaration is missing has a card
// no parent can reach, and a `מילוי` button here would be a control for a state this screen
// never renders. The two states that DO reach the card are `signed` and, for a child still
// on trial, `trial_signed` — and §5.5 deliberately does not ask a trial family for the full
// form yet. Reporting the state is the whole job; the gate owns the asking.
import { useEffect, useMemo, useState } from 'react'
import { apiFetch, formatDateInStudioZone } from '@studio/core'
import { DetailRow, StatusChip, registerSlot } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { makeHealthClient } from './healthClient'
import type { HealthDeclarationOut } from './healthClient'

const CHIP: Record<string, { status: 'debt' | 'pending' | 'paid'; key: string }> = {
  missing: { status: 'debt', key: 'health.badge.missing' },
  trial_signed: { status: 'pending', key: 'health.badge.trialSigned' },
  signed: { status: 'paid', key: 'health.badge.signed' },
}

export function StudentCardHealthSection({
  student,
  locale,
}: {
  student: { id: string; health_status: string }
  locale: Locale
}) {
  const client = useMemo(() => makeHealthClient(apiFetch), [])
  const [declaration, setDeclaration] = useState<HealthDeclarationOut | null>(null)

  useEffect(() => {
    let live = true
    client
      .declaration(student.id)
      .then((row) => live && setDeclaration(row))
      // A failed read costs the expiry line and nothing else — `health_status` is already
      // on the summary the container holds, so the row still says whether it is signed.
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client, student.id])

  const chip = CHIP[student.health_status] ?? CHIP.missing!
  const validUntil = declaration?.valid_until

  return (
    <DetailRow
      label={t(locale, 'health.card.rowLabel')}
      testId="student-card-health"
    >
      {/* The chip carries the word, never the colour alone (SC 1.4.1). */}
      <StatusChip label={t(locale, chip.key)} status={chip.status} />
      {validUntil ? (
        <span
          data-testid="health-valid-until"
          style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}
        >
          {t(locale, 'health.declaration.validUntil')}{' '}
          {formatDateInStudioZone(`${validUntil}T12:00:00Z`, locale)}
        </span>
      ) : null}
    </DetailRow>
  )
}

/** Order 60: the ledger draws it between attendance (40) and the money row (70). */
export function registerHealthSections(): void {
  registerSlot<{ student: { id: string; health_status: string }; locale: Locale }>(
    'student-card',
    { key: 'health-status', order: 60, render: StudentCardHealthSection },
  )
}
