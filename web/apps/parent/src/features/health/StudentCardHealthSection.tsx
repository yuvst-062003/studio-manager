// 2c's מסמכים row 1 (P2) — M4's quarter: the declaration's STATUS and nothing else.
// The contents never render anywhere a screen can reach (§5.5); `health_status` is
// already on the StudentSummary the container holds, so this section fetches nothing.
import { StatusChip, registerSlot } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

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
  const chip = CHIP[student.health_status] ?? CHIP.missing!
  return (
    <section aria-labelledby={`health-${student.id}`} data-testid="student-card-health">
      <h2 id={`health-${student.id}`}>{t(locale, 'health.declaration.title')}</h2>
      <StatusChip label={t(locale, chip.key)} status={chip.status} />
    </section>
  )
}

/** Order 60: 2c's documents row sits between the strip (40) and the money rows (70). */
export function registerHealthSections(): void {
  registerSlot<{ student: { id: string; health_status: string }; locale: Locale }>(
    'student-card',
    { key: 'health-status', order: 60, render: StudentCardHealthSection },
  )
}
