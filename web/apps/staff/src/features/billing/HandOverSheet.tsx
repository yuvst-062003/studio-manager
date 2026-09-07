// Staff artboard `11a` — מסירת פריטים בשיעור.
//
// **Invariant 3 is the design here, not a router tag.** §3.2 gives a coach no financial read
// at all, so the coach picks the ITEM and the server prices it. No amount or currency figure
// appears anywhere on this screen, and the footer says the rule out loud — `11a`'s own spec
// calls that the `9c` approach rather than `2d`'s silent omission.
//
// **▲ D-M6-14 — this screen ships with NO inventory, and the artboard draws three pieces of
// one.** The canvas shows an out-of-stock row (`חסר במלאי — המנהל הזמין`), an
// automatic-inventory switch on by default, and a live decrement helper (`7 → 6`). §5.10 and
// §4.3 both say 'no stock counts, no inventory — that is a different product and it is not
// this one', and `product` carries no column that could hold a count. `12e`'s spec names the
// conflict outright: 'only one of them can be right'. So the switch, the decrement and the
// out-of-stock state are cut, and the footer keeps only the true half of its disclaimer:
// `מחיר הפריט אינו מוצג למאמן`. The other half — 'marking a hand-over updates the manager's
// stock' — describes something this product does not do.
//
// **D-M6-15 — the list is scoped by attendance, which is a cross-lane READ.** The scope
// banner says the items are waiting for students *present in this lesson*, so the filter is
// "pending hand-over AND marked present today". `presentStudents` arrives as a prop from the
// roster this sheet is opened from, so the dependency on M5 is visible at the call site
// rather than buried in a query this lane would own.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { EmptyState } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { AwaitingHandout, HandoutClient, HandoutOption } from './handoutClient'

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-4)',
}

/** The empty-state path keeps `columnStyle`; the sheet proper is Tailwind, in `.tw-scope`
 *  like every other staff screen. `list-style` and the browser's own list padding have to
 *  be turned off explicitly — the scoped Tailwind layer carries no preflight (D10), which
 *  is exactly why it cannot break the older screens that still use the tokens above. */
const RESET_LIST: CSSProperties = { listStyle: 'none', margin: 0, padding: 0 }

export type PresentStudent = { id: string; displayName: string }

export type HandOverSheetProps = {
  locale: Locale
  client: HandoutClient
  options: readonly HandoutOption[]
  /** D-M6-15 — M5's marks for THIS session, passed in rather than queried here. */
  presentStudents: readonly PresentStudent[]
  /** What this lesson's families have ALREADY bought in the shop and not been given
   *  (2026-09-07). Empty for a club that sells nothing online, which is why the whole
   *  section disappears rather than rendering an empty card. */
  awaiting: readonly AwaitingHandout[]
  onHandedOut: (productName: string) => void
}

export function HandOverSheet({
  locale,
  client,
  options,
  presentStudents,
  awaiting,
  onHandedOut,
}: HandOverSheetProps) {
  const [productId, setProductId] = useState<string | null>(null)
  const [studentId, setStudentId] = useState<string | null>(presentStudents[0]?.id ?? null)
  const [inFlight, setInFlight] = useState(false)
  const [handedOut, setHandedOut] = useState(false)
  /** Rows already settled from this sheet, and how. Kept locally rather than by re-fetching:
   *  the answer is known the moment the request returns, and a coach on a mat should not
   *  watch a list reload to learn that the tap they just made worked. `false` means somebody
   *  else got there first (409), which the row says rather than hiding. */
  const [settled, setSettled] = useState<Record<string, boolean>>({})

  /** Only the students actually in front of the coach. The route answers for the whole
   *  roster, because "who is on this roster" is a server fact and "who turned up" is a mark
   *  that may still be changing — narrowing here keeps this sheet's own scope banner
   *  (D-M6-15) true for both lists rather than only the picker below. */
  const presentIds = new Set(presentStudents.map((student) => student.id))
  const waiting = awaiting.filter(
    (row) => presentIds.has(row.student_id) && settled[row.charge_id] === undefined,
  )
  const nameOf = (studentIdToName: string) =>
    presentStudents.find((student) => student.id === studentIdToName)?.displayName ?? ''

  async function settle(row: AwaitingHandout) {
    if (inFlight) return
    setInFlight(true)
    try {
      const ours = await client.markHandedOver(row.charge_id)
      setSettled((current) => ({ ...current, [row.charge_id]: ours }))
      if (ours) onHandedOut(row.product_name)
    } finally {
      setInFlight(false)
    }
  }

  if (options.length === 0) {
    return (
      <div style={columnStyle} data-testid="hand-over">
        <EmptyState title={t(locale, 'billing.product.empty')} />
      </div>
    )
  }

  async function confirm() {
    if (inFlight || !productId || !studentId) return
    setInFlight(true)
    try {
      await client.handOut({ productId, studentId })
      setHandedOut(true)
      onHandedOut(options.find((option) => option.id === productId)?.name ?? '')
    } finally {
      setInFlight(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-8" data-testid="hand-over">
      <h2 className="text-xl font-black text-[var(--fg)]">
        {t(locale, 'billing.product.handOut')}
      </h2>

      {/* The paid-for path FIRST. A coach who reaches the picker below without seeing this
          raises a second charge for a גי the family already bought — which is the bug this
          section exists to remove, and putting it underneath would leave the same trap one
          scroll further down. */}
      {waiting.length > 0 ? (
        <section
          data-testid="awaiting-handout"
          className="rounded-3xl border border-[var(--paid)] bg-[var(--paid-tint)] p-4"
        >
          <h3 className="text-xs font-black text-[var(--paid)]">
            {t(locale, 'billing.product.awaitingTitle')}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--paid)]">
            {t(locale, 'billing.product.awaitingHint')}
          </p>
          <ul className="mt-3 flex flex-col gap-2" style={RESET_LIST}>
            {waiting.map((row) => (
              <li
                key={`${row.charge_id}:${row.student_id}`}
                data-testid="awaiting-row"
                className="flex items-center gap-3 rounded-2xl border border-[var(--paid)] bg-[var(--surface-raised)] p-3"
              >
                <div className="min-w-0 flex-1">
                  <p
                    data-testid="awaiting-student"
                    className="truncate text-sm font-black text-[var(--fg)]"
                  >
                    <bdi>{nameOf(row.student_id)}</bdi>
                  </p>
                  {/* `line_note` carries the size — "גי · 140" — which is the whole reason a
                      coach needs this row: the family was promised a hand-over לאחר וידוא
                      מידה. It carries no price; the shop never put one in it. */}
                  <p data-testid="awaiting-item" className="truncate text-xs text-[var(--text-muted)]">
                    <bdi>{row.line_note ?? row.product_name}</bdi>
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="awaiting-confirm"
                  disabled={inFlight}
                  onClick={() => void settle(row)}
                  className="shrink-0 rounded-xl bg-[var(--paid)] px-4 py-2 text-xs font-bold text-[var(--on-status)] disabled:opacity-50"
                >
                  {t(locale, 'billing.product.awaitingHandOver')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {Object.entries(settled).map(([chargeId, ours]) => (
        <p
          key={chargeId}
          role="status"
          data-testid={ours ? 'awaiting-done' : 'awaiting-taken'}
          className={`rounded-2xl px-3 py-2 text-xs font-bold ${
            ours ? 'bg-[var(--paid-tint)] text-[var(--paid)]' : 'bg-[var(--disabled-surface)] text-[var(--text-secondary)]'
          }`}
        >
          {t(locale, ours ? 'billing.product.awaitingDone' : 'billing.product.awaitingTakenByOther')}
        </p>
      ))}

      {/* Named, now that it is no longer the only path. A coach who scrolled past a waiting
          order needs the difference between the two to be on the screen. */}
      <h3 data-testid="new-charge-title" className="text-sm font-black text-[var(--fg)]">
        {t(locale, 'billing.product.newChargeTitle')}
      </h3>

      <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-sm">
        <h4 className="text-xs font-bold text-[var(--text-muted)]">
          {t(locale, 'billing.product.forWhom')}
        </h4>
        {/* Chips rather than the bare radios this screen shipped with: eighteen `<input
            type=radio>` and their labels ran together into one unreadable paragraph on a
            phone. Still a radio group underneath — `aria-checked` and the roving name are
            what a screen reader reads, and the chip is only how it looks. */}
        <div role="radiogroup" className="mt-2 flex flex-wrap gap-2">
          {presentStudents.map((student) => {
            const chosen = studentId === student.id
            return (
              <button
                key={student.id}
                type="button"
                role="radio"
                aria-checked={chosen}
                data-testid="handout-student"
                onClick={() => setStudentId(student.id)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                  chosen
                    ? 'bg-[var(--emphasis)] text-[var(--on-emphasis)]'
                    : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]'
                }`}
              >
                <bdi>{student.displayName}</bdi>
              </button>
            )
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {options.map((option) => {
            const chosen = productId === option.id
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={chosen}
                data-testid="handout-option"
                onClick={() => setProductId(option.id)}
                className={`rounded-xl px-3 py-2 text-xs font-bold ${
                  chosen
                    ? 'bg-[var(--emphasis)] text-[var(--on-emphasis)]'
                    : 'border border-[var(--emphasis)] bg-[var(--emphasis-tint)] text-[var(--emphasis)]'
                }`}
              >
                {/* The NAME, and nothing else. `HandoutOptionOut` has no money field, which
                    is what makes this safe rather than merely careful. */}
                <bdi>{option.name}</bdi>
              </button>
            )
          })}
        </div>

        <button
          type="button"
          data-testid="hand-over-confirm"
          disabled={inFlight || !productId || !studentId}
          onClick={() => void confirm()}
          className="mt-4 w-full rounded-2xl bg-[var(--emphasis)] py-3 text-sm font-black text-[var(--on-emphasis)] disabled:bg-[var(--border)] disabled:text-[var(--text-muted)]"
        >
          {t(locale, 'billing.product.handOut')}
        </button>
      </section>

      {/* §5.10 on the screen: a coach handing out the last גי would otherwise expect the app
          to know it was the last one. */}
      <p data-testid="no-stock-hint" className="text-xs text-[var(--text-muted)]">
        {t(locale, 'billing.product.noStockHint')}
      </p>

      {/* §3.2 written on the screen — the true half of `11a`'s own disclaimer. */}
      <p data-testid="price-policy" className="text-xs text-[var(--text-muted)]">
        {t(locale, 'billing.product.handOutPolicy')}
      </p>

      {handedOut ? (
        // States THAT a charge was created, never what it was for in money.
        <p
          role="status"
          data-testid="handed-out"
          className="rounded-2xl bg-[var(--emphasis-tint)] px-3 py-2 text-xs font-bold text-[var(--emphasis)]"
        >
          {t(locale, 'billing.product.handedOut')}
        </p>
      ) : null}
    </div>
  )
}
