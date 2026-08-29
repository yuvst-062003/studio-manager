// The `student-card` payment strip — M6's slot fill into `2c`, which is M3's container.
//
// One line: what this child's family owes, and a way through to `1b`. Deliberately small --
// the student card is a summary, and §5.10's ledger is a screen of its own.
//
// **Parent app only.** §3.2 gives a coach no financial read, and invariant 3 enforces that
// against the router tag; this component simply does not exist in the staff app, which is
// the same shape of guarantee `HealthGate` relies on for §5.5's parent-only block.
import type { CSSProperties } from 'react'
import { Button, MoneyDisplay } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

// A label, an amount and a button on one line. Laid out rather than left to flow: the three
// were adjacent inline elements with nothing between them, so the strip rendered as
// "סה״כ חוב1,250₪" with the button jammed against it.
const stripStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
}

//: The button sits at the far end of the line, not against the amount.
const spacerStyle: CSSProperties = { marginInlineStart: 'auto' }

export type PaymentStripProps = {
  locale: Locale
  balanceAgorot: number
  onOpenPayments: () => void
}

export function PaymentStrip({ locale, balanceAgorot, onOpenPayments }: PaymentStripProps) {
  if (balanceAgorot <= 0) {
    // Nothing owed, or the family is in credit. D2 keeps the debt alert for `1a`; a strip
    // announcing a zero balance is noise on a card about a child.
    return null
  }
  return (
    <div data-testid="payment-strip" style={stripStyle}>
      <span>{t(locale, 'billing.openDebts.total')}</span>
      <MoneyDisplay agorot={balanceAgorot} tone="debt" label={t(locale, 'billing.openDebts.total')} />
      <span style={spacerStyle}>
        <Button variant="secondary" onClick={onOpenPayments}>
          {t(locale, 'billing.card.pay')}
        </Button>
      </span>
    </div>
  )
}
