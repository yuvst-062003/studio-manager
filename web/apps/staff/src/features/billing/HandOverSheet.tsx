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
import { Button, Card, EmptyState } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { HandoutClient, HandoutOption } from './handoutClient'

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-4)',
}

export type PresentStudent = { id: string; displayName: string }

export type HandOverSheetProps = {
  locale: Locale
  client: HandoutClient
  options: readonly HandoutOption[]
  /** D-M6-15 — M5's marks for THIS session, passed in rather than queried here. */
  presentStudents: readonly PresentStudent[]
  onHandedOut: (productName: string) => void
}

export function HandOverSheet({
  locale,
  client,
  options,
  presentStudents,
  onHandedOut,
}: HandOverSheetProps) {
  const [productId, setProductId] = useState<string | null>(null)
  const [studentId, setStudentId] = useState<string | null>(presentStudents[0]?.id ?? null)
  const [inFlight, setInFlight] = useState(false)
  const [handedOut, setHandedOut] = useState(false)

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
    <div style={columnStyle} data-testid="hand-over">
      <h2>{t(locale, 'billing.product.handOut')}</h2>

      <Card caption={t(locale, 'billing.product.forWhom')}>
        {presentStudents.map((student) => (
          <label key={student.id}>
            <input
              type="radio"
              name="hand-over-student"
              checked={studentId === student.id}
              onChange={() => setStudentId(student.id)}
            />
            {student.displayName}
          </label>
        ))}
      </Card>

      <Card>
        {options.map((option) => (
          <Button
            key={option.id}
            variant={productId === option.id ? 'primary' : 'secondary'}
            data-testid="handout-option"
            onClick={() => setProductId(option.id)}
          >
            {/* The NAME, and nothing else. `HandoutOptionOut` has no money field, which is
                what makes this safe rather than merely careful. */}
            {option.name}
          </Button>
        ))}
      </Card>

      {/* §5.10 on the screen: a coach handing out the last גי would otherwise expect the app
          to know it was the last one. */}
      <p data-testid="no-stock-hint">{t(locale, 'billing.product.noStockHint')}</p>

      {/* §3.2 written on the screen — the true half of `11a`'s own disclaimer. */}
      <p data-testid="price-policy">{t(locale, 'billing.product.handOutPolicy')}</p>

      <Button
        variant="primary"
        data-testid="hand-over-confirm"
        disabled={inFlight || !productId || !studentId}
        onClick={confirm}
      >
        {t(locale, 'billing.product.handOut')}
      </Button>

      {handedOut ? (
        // States THAT a charge was created, never what it was for in money.
        <p data-testid="handed-out">{t(locale, 'billing.product.handedOut')}</p>
      ) : null}
    </div>
  )
}
