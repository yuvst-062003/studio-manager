// The furniture every §5.15 step shares: its layout tokens, its table styling, and the two
// buttons that report its outcome.
//
// **`StepActions` is the only way a step tells the container it is finished.** It renders
// `onDone` and `onSkip` from `RolloverStepProps` and nothing else, which is what keeps
// `types.ts`'s last paragraph true in practice rather than only in a comment: a step cannot
// accidentally grow a third exit, because there is nowhere to put one.
//
// It refuses to render for a derived step. `year` and `generate` answer 409 to a manual
// mark (`_DERIVED_STEPS` in `app/services/schedule/rollover.py`), so offering a "done"
// button on either would be offering a press that fails — the hint is rendered in its place,
// which is the honest version of the same information.
//
// Styling is module-level `CSSProperties` with `var(--space-*)` tokens and **logical
// properties only** (D10): the rail and every table here run right-to-left in `he`, and
// `padding-left` would be wrong in one of the two directions with nothing to catch it.
import type { CSSProperties } from 'react'
import { ActionBar, Button } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { isDerivedStep } from './types'
import type { RolloverStepId, RolloverStepStatus } from './types'

export const stepStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  inlineSize: '100%',
}

export const introStyle: CSSProperties = { color: 'var(--text-secondary)' }

export const noteStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
}

export const errorStyle: CSSProperties = { color: 'var(--danger)' }

export const fieldsetStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-4)',
}

export const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
  alignItems: 'end',
}

export const actionsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
  alignItems: 'center',
}

/** Wide tables scroll inside their own box rather than pushing the page sideways. */
export const scrollStyle: CSSProperties = { overflowX: 'auto' }

export const tableStyle: CSSProperties = { inlineSize: '100%', borderCollapse: 'collapse' }

export const cellStyle: CSSProperties = {
  // `start`, not `left`: a logical value, so the same rule reads correctly in both
  // directions. D10 bans the physical spelling for exactly this case.
  textAlign: 'start',
  paddingBlock: 'var(--space-2)',
  paddingInline: 'var(--space-3)',
  borderBlockEnd: 'var(--border-width-hairline) solid var(--border)',
  verticalAlign: 'top',
}

export const headCellStyle: CSSProperties = {
  ...cellStyle,
  fontWeight: 'var(--weight-semibold)' as CSSProperties['fontWeight'],
  borderBlockEnd: 'var(--border-width-strong) solid var(--border-strong)',
}

export const captionStyle: CSSProperties = {
  textAlign: 'start',
  paddingBlockEnd: 'var(--space-2)',
}

export function StepActions({
  locale,
  stepId,
  status,
  onDone,
  onSkip,
  onReopen,
  onBack,
  skippable = true,
  doneLabel,
}: {
  locale: Locale
  stepId: RolloverStepId
  status: RolloverStepStatus
  onDone: () => void
  onSkip: () => void
  /** F6 — un-answer a step ticked by mistake. Withheld from derived steps. */
  onReopen?: () => void
  /** F6 — the explicit Back beside Done/Skip. */
  onBack?: () => void
  /** §5.15 makes step 7 optional in as many words; the rest are skippable for the same
      reason the server accepts `skipped` at all — a studio that changes nothing still has to
      get past the step. */
  skippable?: boolean
  doneLabel?: string
}) {
  const derived = isDerivedStep(stepId)
  // Was one flat flex row holding up to four buttons AND two sentences, all at the same
  // rank, `gap: var(--space-3)` apart. A manager saw `[המשך]` with "this step is derived
  // from the data" and "step state: done" strung along beside it, and nothing said which
  // of the six things was the way forward.
  //
  // Two changes. Leaving the step goes on the inline-start edge and the one control that
  // moves it forward goes on the inline-end edge, which is `ActionBar`'s whole job. And
  // the two sentences leave the row entirely: **they are not actions**, they describe the
  // step, and mixing description into a control row is what made it unreadable.
  const leaving = [
    onBack ? (
      <Button key="back" variant="ghost" data-testid={`rollover-back-${stepId}`} onClick={onBack}>
        {t(locale, 'schedule.rollover.back')}
      </Button>
    ) : null,
    skippable && !derived ? (
      <Button key="skip" variant="ghost" data-testid={`rollover-skip-${stepId}`} onClick={onSkip}>
        {t(locale, 'schedule.rollover.skipStep')}
      </Button>
    ) : null,
    onReopen && !derived && status !== 'pending' ? (
      <Button
        key="reopen"
        variant="secondary"
        data-testid={`rollover-reopen-${stepId}`}
        onClick={onReopen}
      >
        {t(locale, 'schedule.rollover.reopenStep')}
      </Button>
    ) : null,
  ].filter(Boolean)

  return (
    <div className="rollover-step-actions" data-testid={`rollover-actions-${stepId}`}>
      <ActionBar
        end={
          <Button data-testid={`rollover-done-${stepId}`} onClick={onDone}>
            {doneLabel ??
              t(locale, derived ? 'schedule.rollover.continue' : 'schedule.rollover.markDone')}
          </Button>
        }
        // `undefined` and not an empty fragment when a step offers no way out: a fragment
        // is truthy, and ActionBar would render an empty group and spread to both edges
        // around nothing. Step 1 of a fresh rollover is exactly that case.
        start={leaving.length > 0 ? <>{leaving}</> : undefined}
      />
      <p className="rollover-step-actions__meta" style={noteStyle}>
        {derived ? (
          <span data-testid={`rollover-derived-${stepId}`}>
            {t(locale, 'schedule.rollover.derivedHint')}
          </span>
        ) : null}
        {/* The step's own status, as a word. Colour is never the only carrier (SC 1.4.1). */}
        <span data-testid={`rollover-step-status-${stepId}`}>
          {`${t(locale, 'schedule.rollover.statusLabel')}: ${t(
            locale,
            `schedule.rollover.status.${status}`,
          )}`}
        </span>
      </p>
    </div>
  )
}
