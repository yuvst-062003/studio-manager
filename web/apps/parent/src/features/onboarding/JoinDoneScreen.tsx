// Step 4's richer done-state. Every child listed with a checkmark, identical visual
// weight regardless of method -- no colored status chip distinguishing them, since a
// chip that reads "pending" for standing order is exactly the "lesser" treatment the
// spec rules out. Card, cash/cheque and standing order are each a completed DECISION,
// just described differently: card says paid, cash/cheque names the concrete moment
// (amount, who, when), standing order says the club confirms it once the mandate
// clears.
//
// **This is also where the deferred health flush fires** -- `onEnterApp` is the one
// call site (wired by `JoinFlow.tsx`) that submits every kid's held-in-draft health
// declaration, back to back, before the actual navigation into the app.
import type { CSSProperties } from 'react'
import { Alert, Button, Card, MoneyDisplay } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-4)',
}

const rowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  paddingBlock: 'var(--space-2)',
}

export type JoinDoneChildRow = {
  studentId: string
  displayName: string
  method: 'card' | 'cash' | 'cheque' | 'standing_order'
  amountAgorot: number
}

export type JoinDoneScreenProps = {
  locale: Locale
  rows: readonly JoinDoneChildRow[]
  onEnterApp: () => void
  flushing: boolean
  flushError: string | null
}

function methodNote(locale: Locale, row: JoinDoneChildRow): string {
  if (row.method === 'card') return t(locale, 'billing.order.status.paid')
  if (row.method === 'standing_order') return t(locale, 'people.join.done.standingPending')
  return t(locale, 'people.join.done.handMoment')
}

export function JoinDoneScreen({ locale, rows, onEnterApp, flushing, flushError }: JoinDoneScreenProps) {
  return (
    <div data-testid="join-done-screen" style={pageStyle}>
      <Card>
        <h1>{t(locale, 'people.join.done.title')}</h1>
        {rows.length === 0 ? (
          <p>{t(locale, 'people.join.done.nothingOwed')}</p>
        ) : (
          rows.map((row) => (
            <div data-testid={`join-done-row-${row.studentId}`} key={row.studentId} style={rowStyle}>
              <span aria-hidden>✓</span>
              <strong style={{ flex: '1 1 0', minInlineSize: 0 }}>
                <bdi>{row.displayName}</bdi>
              </strong>
              {row.method !== 'card' && row.amountAgorot > 0 ? (
                <MoneyDisplay agorot={row.amountAgorot} label={row.displayName} />
              ) : null}
              <span>{methodNote(locale, row)}</span>
            </div>
          ))
        )}
      </Card>

      {flushError ? (
        <Alert iconLabel={t(locale, 'people.join.done.title')} live tone="danger">
          {flushError}
        </Alert>
      ) : null}

      <Button
        data-testid="join-done-enter"
        disabled={flushing}
        onClick={onEnterApp}
        variant="primary"
      >
        {flushing ? t(locale, 'reports.privacy.gate.working') : t(locale, 'people.join.toApp')}
      </Button>
    </div>
  )
}
