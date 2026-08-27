// The parent's plan screen — what 300 / 400 / 550 ₪ actually buys this child.
//
// **Three sections, and the order is the argument.** What is always included, what may be
// chosen this week, and what a different plan would change. A parent who opens this screen
// is asking one of those three questions.
//
// **Nothing is hidden.** §5.1: a plan that would not raise this student's week is shown
// with its reason, because a Group 1 parent who hears "400" from another parent in the hall
// and finds nothing in the app phones the manager — and because the plan turns itself on
// the moment the child moves up a group. The same rule applies one level down: a session
// that cannot be marked says WHY rather than being quietly disabled.
//
// **Money never mirrors.** Every amount goes through `MoneyDisplay`, which wraps it in
// `<bdi>`. The RTL hazard here is the FIX and not the bug: a `direction: ltr` wrapper or a
// transform would flip `300₪` to `₪300`.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, Card, EmptyState, MoneyDisplay, StatusChip } from '@studio/ui'
import { formatDateInStudioZone, formatTimeInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { BookableSession, PlanOption, TrainingPlanView } from './trainingPlanClient'

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-4)',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  flexWrap: 'wrap',
  paddingBlock: 'var(--space-2)',
}

const mutedStyle: CSSProperties = { color: 'var(--text-muted)' }

export type TrainingPlanScreenProps = {
  locale: Locale
  view: TrainingPlanView
  onMark: (sessionId: string) => Promise<void>
  onRelease: (bookingId: string) => Promise<void>
  onRequestPlan: (planId: string) => Promise<void>
  onCancelChange: (changeId: string) => Promise<void>
}

export function TrainingPlanScreen({
  locale,
  view,
  onMark,
  onRelease,
  onRequestPlan,
  onCancelChange,
}: TrainingPlanScreenProps) {
  const [inFlight, setInFlight] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function run(action: () => Promise<void>) {
    if (inFlight) return
    setInFlight(true)
    setError(null)
    action()
      .catch(() => setError(t(locale, 'common.error.generic')))
      .finally(() => setInFlight(false))
  }

  return (
    <div style={columnStyle} data-testid="training-plan">
      <header>
        <h1>{t(locale, 'schedule.plan.title')}</h1>
        {view.current_plan ? (
          <p style={rowStyle}>
            <span>{view.current_plan.name}</span>
            <MoneyDisplay
              agorot={view.current_plan.monthly_amount_agorot}
              label={view.current_plan.name}
            />
            <span style={mutedStyle}>{t(locale, 'schedule.plan.monthly')}</span>
          </p>
        ) : null}
      </header>

      {error ? (
        <Alert tone="danger" live iconLabel={t(locale, 'schedule.plan.title')}>
          {error}
        </Alert>
      ) : null}

      {view.scheduled_change ? (
        // A change is a ROW, not an edit — which is what makes this banner, and the way
        // out of it, possible at all.
        <Card>
          <div data-testid="plan-scheduled-change">
            <h2>{t(locale, 'schedule.plan.scheduledChange')}</h2>
            <p>
              {t(locale, 'schedule.plan.effectiveOn').replace(
                '{{date}}',
                view.scheduled_change.effective_on,
              )}
            </p>
            <Button
              variant="secondary"
              data-testid="plan-cancel-change"
              disabled={inFlight}
              onClick={() => run(() => onCancelChange(view.scheduled_change!.id))}
            >
              {t(locale, 'schedule.plan.cancelChange')}
            </Button>
          </div>
        </Card>
      ) : null}

      {/* -- what the plan includes whatever else happens --------------------- */}
      <section aria-labelledby="plan-included">
        <h2 id="plan-included">{t(locale, 'schedule.plan.alwaysIncluded')}</h2>
        <Card>
          <div data-testid="plan-always-included">
            {view.base_sessions.map((row) => (
              <div key={row.session_id} style={rowStyle}>
                <span>{formatDateInStudioZone(row.starts_at, locale)}</span>
                <span>{formatTimeInStudioZone(row.starts_at, locale)}</span>
                <span>{row.group_name}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* -- what may be chosen this week ------------------------------------- */}
      <section aria-labelledby="plan-extras">
        <h2 id="plan-extras">{t(locale, 'schedule.plan.thisWeeksExtra')}</h2>
        <p data-testid="plan-credits">
          {view.credits_remaining === null
            ? t(locale, 'schedule.plan.unlimited')
            : t(locale, 'schedule.plan.remaining').replace(
                '{{count}}',
                String(view.credits_remaining),
              )}
        </p>
        {view.this_weeks_extras.length === 0 ? (
          <EmptyState title={t(locale, 'schedule.plan.noExtras')} />
        ) : (
          <Card>
            {view.this_weeks_extras.map((row) => (
              <ExtraRow
                key={row.session_id}
                locale={locale}
                row={row}
                inFlight={inFlight}
                onMark={() => run(() => onMark(row.session_id))}
                onRelease={() => run(() => onRelease(row.booking_id!))}
              />
            ))}
          </Card>
        )}
        {view.credits_remaining !== null ? (
          <p style={mutedStyle}>{t(locale, 'schedule.plan.chooseOne')}</p>
        ) : null}
      </section>

      {/* -- what a different plan would change ------------------------------- */}
      <section aria-labelledby="plan-options">
        <h2 id="plan-options">{t(locale, 'schedule.plan.switch')}</h2>
        {view.plans.map((plan) => (
          <PlanRow
            key={plan.id}
            locale={locale}
            plan={plan}
            inFlight={inFlight}
            onChoose={() => run(() => onRequestPlan(plan.id))}
          />
        ))}
      </section>
    </div>
  )
}

function ExtraRow({
  locale,
  row,
  inFlight,
  onMark,
  onRelease,
}: {
  locale: Locale
  row: BookableSession
  inFlight: boolean
  onMark: () => void
  onRelease: () => void
}) {
  const marked = row.booking_id !== null
  return (
    <div style={rowStyle} data-testid="plan-extra-row">
      <span>{formatDateInStudioZone(row.starts_at, locale)}</span>
      <span>{formatTimeInStudioZone(row.starts_at, locale)}</span>
      <span style={{ flex: 1, minInlineSize: 0 }}>
        <bdi>{row.group_name}</bdi>
      </span>
      {marked ? (
        <>
          <StatusChip status="planned" label={t(locale, 'schedule.plan.marked')} />
          {/* §3.2 — free until the session starts. `is_markable` is false once it has,
              which is what takes the release control away rather than a second flag. */}
          {row.is_markable && !row.reason ? (
            <Button
              variant="secondary"
              data-testid="plan-release"
              disabled={inFlight}
              onClick={onRelease}
            >
              {t(locale, 'schedule.plan.release')}
            </Button>
          ) : null}
        </>
      ) : row.is_markable ? (
        <Button variant="primary" data-testid="plan-mark" disabled={inFlight} onClick={onMark}>
          {t(locale, 'schedule.plan.mark')}
        </Button>
      ) : (
        // Never a disabled button with no explanation: that is the support call this
        // screen exists to prevent, and the reason usually names an upgrade.
        <span data-testid="plan-reason" style={mutedStyle}>
          {t(locale, `schedule.plan.reason.${row.reason ?? 'no_plan'}`)}
        </span>
      )}
    </div>
  )
}

function PlanRow({
  locale,
  plan,
  inFlight,
  onChoose,
}: {
  locale: Locale
  plan: PlanOption
  inFlight: boolean
  onChoose: () => void
}) {
  return (
    <Card>
      <div style={rowStyle} data-testid={`plan-option-${plan.id}`}>
        <strong style={{ flex: 1, minInlineSize: 0 }}>
          <bdi>{plan.name}</bdi>
        </strong>
        <MoneyDisplay agorot={plan.monthly_amount_agorot} label={plan.name} />
        <span style={mutedStyle}>
          {plan.weekly_extra_allowance === null
            ? t(locale, 'schedule.plan.unlimited')
            : t(locale, 'schedule.plan.remaining').replace(
                '{{count}}',
                String(plan.weekly_extra_allowance),
              )}
        </span>
        {plan.is_current ? (
          <StatusChip status="planned" label={t(locale, 'schedule.plan.current')} />
        ) : plan.is_offered ? (
          <Button
            variant="secondary"
            data-testid="plan-choose"
            disabled={inFlight}
            onClick={onChoose}
          >
            {t(locale, 'schedule.plan.upgrade')}
          </Button>
        ) : (
          // §5.1 — shown with its reason, never hidden. It turns itself on when the child
          // moves up a group.
          <span style={mutedStyle}>{t(locale, 'schedule.plan.notOffered')}</span>
        )}
      </div>
    </Card>
  )
}
