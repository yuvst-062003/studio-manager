// The confirmation §5.15's three destructive presses go through — retire a group, mark
// students not returning, reprice a plan.
//
// It is `features/schedule/ImpactDialog.tsx`'s pattern, generalised over its body: the same
// `role="dialog" aria-modal="true"` wrapper, the same heading-then-body-then-two-buttons
// shape, the same "cancel is secondary and comes first" ordering. It is deliberately NOT a
// `Dialog` primitive: a primitive is a shared contract that wants its own artboard.
//
// **The focus trap is not optional and is not local.** `aria-modal="true"` tells assistive
// technology the rest of the page is unavailable, and the browser does nothing to make that
// true — so without a trap this dialog told a screen-reader user the wizard behind it was
// inert while a keyboard user could Tab straight back into it and keep editing the table the
// dialog was asking about. `useModalDialog` (W6, @studio/ui) moves focus in, traps Tab,
// closes on Escape and restores focus to the button that opened it.
//
// **The body says what will happen, not how many rows are selected.** A manager pressing
// "retire" has already seen the count on the table behind them; what they have not seen is
// that retiring keeps the sessions that already happened.
import type { CSSProperties, ReactNode } from 'react'
import { Button, useModalDialog } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

const dialogStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '34rem',
  inlineSize: '100%',
  padding: 'var(--space-5)',
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--surface)',
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-3)',
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
}

export function ConfirmDialog({
  locale,
  titleId,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
  testId,
}: {
  locale: Locale
  /** Unique per call site: two dialogs on one screen sharing an id name neither of them. */
  titleId: string
  title: string
  body: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  testId: string
}) {
  // Always open: this component is rendered only while its dialog is showing, so the
  // caller's conditional IS the open state.
  const dialogRef = useModalDialog(true, onCancel)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid={testId}
      ref={dialogRef}
      style={dialogStyle}
      tabIndex={-1}
    >
      <h2 id={titleId}>{title}</h2>
      <div>{body}</div>
      <div style={actionsStyle}>
        <Button variant="secondary" onClick={onCancel} data-testid={`${testId}-cancel`}>
          {t(locale, 'schedule.rollover.dialog.cancel')}
        </Button>
        <Button
          variant="destructive"
          onClick={onConfirm}
          disabled={busy}
          data-testid={`${testId}-confirm`}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  )
}
