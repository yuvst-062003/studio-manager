// 2c's money row — M6's student-card slot entry, the one the audit found "left for someone
// else" by every wave (P2).
//
// ── What changed on 2026-09-01, and why it is a correction and not a restyle ────────────
//
// This section used to render the HOUSEHOLD balance through `PaymentStrip`, with a comment
// arguing the case: "§6.3 — debt is per household, not per child", so the strip "says so by
// rendering the same figure on every child's card."
//
// It does not say so. A family with three children opens three cards and reads `240₪` on
// each, and nothing on any of them distinguishes "this is the family's total, shown here"
// from "this child owes 240₪" — so the honest reading of three cards is 720₪. The card is
// titled with one child's name; every number on it is read as that child's.
//
// `ChargeOut` carries `student_id`, so the per-child figure is not an invention: it is the
// sum of this child's own open charges. The HOUSEHOLD total keeps its home on `1b`, where
// the row's chevron goes, and where a total is labelled as one.
//
// **A charge covered elsewhere is not owed here.** `is_covered_elsewhere` marks a charge
// another payer has taken on; counting it would bill a parent twice on screen for money
// they do not owe.
import { useEffect, useMemo, useState } from 'react'
import { apiFetch, formatDateInStudioZone } from '@studio/core'
import { DetailRow, MoneyDisplay, registerSlot } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { makeParentBillingClient } from './PaymentsSection'
import type { ChargeOut } from './billingClient'

/** What this child still owes, in agorot, and the soonest date it falls due. */
export function oweFor(
  charges: readonly ChargeOut[],
  studentId: string,
): { agorot: number; dueOn: string | null } {
  const mine = charges.filter(
    (charge) => charge.student_id === studentId && !charge.is_covered_elsewhere,
  )
  return {
    // `amount - allocated`, never `amount`: a charge half-covered by a payment is half
    // owed, and the ledger already knows by how much.
    agorot: mine.reduce(
      (sum, charge) => sum + (charge.amount_agorot - (charge.allocated_agorot ?? 0)),
      0,
    ),
    // The soonest due date across what is left — the one a parent needs, not the newest.
    dueOn: mine
      .map((charge) => charge.due_date)
      .filter((due): due is string => Boolean(due))
      .sort()[0] ?? null,
  }
}

export function StudentCardBillingSection({
  student,
  locale,
}: {
  student: { id: string }
  locale: Locale
}) {
  const client = useMemo(() => makeParentBillingClient(apiFetch), [])
  const [charges, setCharges] = useState<readonly ChargeOut[] | null>(null)

  useEffect(() => {
    let live = true
    client
      .openCharges('')
      .then((items) => live && setCharges(items))
      // A failed read renders as NOTHING, never as a reassuring zero — P8's rule: a wrong
      // number about money is worse than an error.
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client])

  if (charges === null) return null
  const { agorot, dueOn } = oweFor(charges, student.id)
  // Nothing owed for this child renders no row at all. D2 keeps the debt alert for `1a`,
  // and a row announcing a zero is noise on a card about a child.
  if (agorot <= 0) return null

  return (
    <DetailRow
      href="#/payments"
      label={t(locale, 'billing.card.owedRow')}
      testId="student-card-billing"
      tone="debt"
    >
      {/* Never concatenated into a sentence — `MoneyDisplay` isolates the run so the
          shekel sign and the digits cannot be reordered by the bidi algorithm. */}
      <MoneyDisplay agorot={agorot} tone="debt" label={t(locale, 'billing.card.owedRow')} />
      {/* The due date on its own line, the way the belt row carries its earlier grades and
          the health row its expiry. On one line with the amount it wrapped mid-date —
          "לתשלום עד 10 / בספטמבר 2026" — which is the money row of all rows to keep legible. */}
      {dueOn ? (
        <span
          data-testid="billing-due"
          style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}
        >
          {t(locale, 'billing.card.dueBy')}{' '}
          {formatDateInStudioZone(`${dueOn}T12:00:00Z`, locale)}
        </span>
      ) : null}
    </DetailRow>
  )
}

/** One file plus one line — the seam-4 shape every other section uses. Order 70: after the
 *  health row (60), directly above the training plan (75) the money buys. */
export function registerBillingSections(): void {
  registerSlot<{ student: { id: string }; locale: Locale }>('student-card', {
    key: 'billing-strip',
    order: 70,
    render: StudentCardBillingSection,
  })
}
