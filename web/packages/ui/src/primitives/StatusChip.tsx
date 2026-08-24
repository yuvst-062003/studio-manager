export type ChipStatus = 'debt' | 'paid' | 'pending' | 'cancelled' | 'unmarked' | 'planned'

/**
 * Artboard 4h, card תגיות מצב. Six statuses.
 *
 * The label is always text, never conveyed by colour alone (SC 1.4.1) — and it is a prop,
 * because "חוב" on a roster and "חוב של 320₪" on a household row are the same status with
 * different copy.
 *
 * 4h draws the בוטל chip in #7a766d. D8 retired that grey outright at 4.16:1, so this
 * uses --cancelled instead. D8 postdates the artboard; G11 is a global constraint.
 */
export function StatusChip({ status, label }: { status: ChipStatus; label: string }) {
  return (
    <span className="studio-chip" data-status={status}>
      {label}
    </span>
  )
}
