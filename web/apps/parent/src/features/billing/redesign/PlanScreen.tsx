// המסלול — the plan screen, redesigned. Replaces `TrainingPlanScreen.tsx`, deleted in the
// same commit rather than left beside it (spec §11).
//
// ── What the old screen was, and what it is now ───────────────────────────────────────
//
// B5 — two-thirds of it was a timetable. תמיד כלול listed this week's base sessions and
// האימון הנוסף שלי השבוע listed the markable extras, so the plan itself — the thing the
// screen is named after and the thing the club sells — was one line at the top, above the
// fold only by luck. The app shows a week in two other places (home's schedule and
// לוח הילד), and the plan card's own cadence line says the same thing in five words.
//
// תמיד כלול is gone. The MARKING stays: it is the only way to spend an allowance, and
// deleting it without a new home for it would remove a working feature. It shrank instead
// — B7's freestanding נותרו 0 paragraph and full-width dashed empty state became a counter
// beside the heading and one muted line.
//
// B6 — the heading is the CHILD's. The route has always been per child; the title said
// "my plan", so a family with two children had two identical screens.
//
// B4/A1 — it has a way back now, and it is the shared `ScreenHeader` rather than a fourth
// hand-rolled chevron.
import { useState } from 'react'
import { Alert, StatusChip } from '@studio/ui'
import { formatDateInStudioZone, formatTimeInStudioZone, fill } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { ScreenHeader } from '../../shell/ScreenHeader'
import { PlanCard, directionOf } from './PlanCard'
import { PlanMoney } from './PlanMoney'
import type { MoneyContext, PaymentMethod } from './PlanMoney'
import type { BookableSession, PlanOption, TrainingPlanView } from '../trainingPlanClient'

export type PlanScreenProps = {
  locale: Locale
  view: TrainingPlanView
  /** `student.payment_method`, or `null` for a family who has never been asked. */
  method: PaymentMethod | null
  /** The money reads, taken AFTER a change is recorded. `null` until then. */
  money: MoneyContext | null
  busy: boolean
  /** The month a change lands, from the server's clock — never the device's. */
  nextEffectiveOn: string
  onMark: (sessionId: string) => void
  onRelease: (bookingId: string) => void
  onCancelChange: (changeId: string) => void
  /** Records the change and reads the money context. Resolves once both are done. */
  onChoosePlan: (plan: PlanOption) => void
  onPickMethod: (next: PaymentMethod) => void
  onPayCard: () => void
  onPromise: (method: 'cash' | 'cheque', prepayMonths: number) => void
  onCloseMoney: () => void
  error: string | null
}

/** The month name the effect lines and the banner print. The date is the SERVER's. */
function monthOf(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleDateString(locale === 'he' ? 'he-IL' : locale, { month: 'long' })
}

export function PlanScreen({
  locale,
  view,
  method,
  money,
  busy,
  nextEffectiveOn,
  onMark,
  onRelease,
  onCancelChange,
  onChoosePlan,
  onPickMethod,
  onPayCard,
  onPromise,
  onCloseMoney,
  error,
}: PlanScreenProps) {
  // Which plan's money step is open. One at a time: two open confirm steps would be two
  // changes a parent could send by accident.
  const [chosen, setChosen] = useState<PlanOption | null>(null)
  /**
   * What the plan being LEFT costs, captured at the moment of choosing.
   *
   * `view.current_plan` is re-read after the change, and an UPGRADE has already moved
   * `price_plan_id` by then — so it is the new plan. The standing-order step names the
   * amount the family must stop paying, and that number only exists before the write.
   */
  const [leavingAgorot, setLeavingAgorot] = useState<number | null>(null)

  const current = view.current_plan
  const currentAgorot = current?.monthly_amount_agorot ?? null
  const others = view.plans.filter((plan) => !plan.is_current)
  const spent = view.this_weeks_extras.filter((row) => row.booking_id !== null).length
  const allowance = current?.weekly_extra_allowance ?? null

  return (
    <div data-testid="training-plan">
      <ScreenHeader
        locale={locale}
        title={fill(t(locale, 'schedule.plan.titleFor'), { name: view.student_name })}
        testId="plan-header"
      />

      <div className="px-4 py-4 space-y-5">
        {error ? (
          <Alert tone="danger" live iconLabel={t(locale, 'schedule.plan.title')}>
            {error}
          </Alert>
        ) : null}

        {/* A change is a ROW and not an edit, which is what makes this banner and the way
            out of it possible at all. B3 — it now names both plans: the client cannot look
            up a CLOSED plan's name, so the server sends them. */}
        {view.scheduled_change ? (
          <section
            data-testid="plan-scheduled-change"
            className="rounded-3xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4 text-start"
          >
            <h2 className="text-sm font-bold text-amber-900 dark:text-amber-200">
              {t(locale, 'schedule.plan.scheduledChange')}
            </h2>
            <p className="text-xs text-amber-800 dark:text-amber-300/90 mt-1">
              <bdi>
                {fill(t(locale, 'schedule.plan.changeFromTo'), {
                  from: view.scheduled_change.from_plan_name ?? '—',
                  to: view.scheduled_change.to_plan_name,
                })}
              </bdi>
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-300/90">
              {t(locale, 'schedule.plan.effectiveOn').replace(
                '{{date}}',
                formatDateInStudioZone(view.scheduled_change.effective_on, locale),
              )}
            </p>
            <button
              type="button"
              data-testid="plan-cancel-change"
              disabled={busy}
              onClick={() => onCancelChange(view.scheduled_change!.id)}
              className="mt-2.5 rounded-xl px-4 py-2 text-xs font-bold bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-500/40 text-amber-900 dark:text-amber-200 cursor-pointer"
            >
              {t(locale, 'schedule.plan.cancelChange')}
            </button>
          </section>
        ) : null}

        {/* -- the plan they are on ------------------------------------------------- */}
        {current ? (
          <section aria-labelledby="plan-current" className="space-y-2">
            <h2
              id="plan-current"
              className="text-xs font-bold text-slate-500 dark:text-slate-400 text-start"
            >
              {t(locale, 'schedule.plan.currentHeading')}
            </h2>
            <PlanCard
              plan={current}
              locale={locale}
              currentAgorot={currentAgorot}
              // **The money step has to follow the plan that was chosen, even here.**
              //
              // An UPGRADE moves `student.price_plan_id` at request time — that is the
              // §15 decision, access before payment. So the moment the request lands, the
              // plan the parent picked stops being an option and becomes the current one:
              // it leaves the list below and arrives in this card. Rendered only there,
              // the money step vanished at exactly the moment it was needed, and the
              // parent was left with a plan they had not paid for, a standing order still
              // charging the old amount, and nothing on screen about either.
              footer={
                chosen?.id === current.id ? (
                  <PlanMoney
                    plan={current}
                    locale={locale}
                    method={method}
                    context={money}
                    busy={busy}
                    previousAgorot={leavingAgorot}
                    onPickMethod={onPickMethod}
                    onPayCard={onPayCard}
                    onPromise={onPromise}
                    onDone={() => {
                      setChosen(null)
                      onCloseMoney()
                    }}
                  />
                ) : null
              }
            />
          </section>
        ) : null}

        {/* -- what may be marked this week ----------------------------------------- */}
        <section aria-labelledby="plan-extras" className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2
              id="plan-extras"
              className="text-xs font-bold text-slate-500 dark:text-slate-400 text-start"
            >
              {t(locale, 'schedule.plan.thisWeeksExtra')}
            </h2>
            {/* The counter, in place of a paragraph of its own. `null` allowance is "no
                weekly limit" — a third state, said as a word rather than a big number. */}
            <span data-testid="plan-credits" className="text-[11px] font-bold text-slate-400">
              {allowance === null
                ? t(locale, 'schedule.plan.unlimited')
                : fill(t(locale, 'schedule.plan.extrasCount'), {
                    used: String(spent),
                    total: String(allowance),
                  })}
            </span>
          </div>
          {view.this_weeks_extras.length === 0 ? (
            <p data-testid="plan-no-extras" className="text-xs text-slate-400 dark:text-slate-500 text-start">
              {t(locale, 'schedule.plan.noExtrasShort')}
            </p>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {view.this_weeks_extras.map((row) => (
                <ExtraRow
                  key={row.session_id}
                  locale={locale}
                  row={row}
                  busy={busy}
                  onMark={() => onMark(row.session_id)}
                  onRelease={() => onRelease(row.booking_id!)}
                />
              ))}
            </div>
          )}
        </section>

        {/* -- what a different plan would change ------------------------------------ */}
        <section aria-labelledby="plan-options" className="space-y-3">
          <h2
            id="plan-options"
            className="text-xs font-bold text-slate-500 dark:text-slate-400 text-start"
          >
            {t(locale, 'schedule.plan.otherPlans')}
          </h2>
          {others.map((plan) => {
            const open = chosen?.id === plan.id
            const direction = directionOf(plan, currentAgorot)
            return (
              <PlanCard
                key={plan.id}
                plan={plan}
                locale={locale}
                currentAgorot={currentAgorot}
                disabled={busy}
                onChoose={() => {
                  setChosen(plan)
                  // Before the write, while `current` still means the plan being left.
                  setLeavingAgorot(currentAgorot)
                  onChoosePlan(plan)
                }}
                footer={
                  open ? (
                    <>
                      {/* The consequence, stated before the parent commits — B3 and C4.
                          An upgrade opens the sessions now and costs nothing extra this
                          month, because there is no proration and the club carries the
                          difference deliberately. A downgrade changes nothing until the
                          first, and the sessions already marked are kept. */}
                      <p
                        data-testid={`plan-effect-${direction}`}
                        className="mt-3 text-[11px] text-slate-600 dark:text-slate-300 text-start"
                      >
                        {fill(
                          t(
                            locale,
                            direction === 'downgrade'
                              ? 'schedule.plan.downgradeEffect'
                              : 'schedule.plan.upgradeEffect',
                          ),
                          { month: monthOf(nextEffectiveOn, locale) },
                        )}
                      </p>
                      <PlanMoney
                        plan={plan}
                        locale={locale}
                        method={method}
                        context={money}
                        busy={busy}
                        previousAgorot={leavingAgorot}
                        onPickMethod={onPickMethod}
                        onPayCard={onPayCard}
                        onPromise={onPromise}
                        onDone={() => {
                          setChosen(null)
                          onCloseMoney()
                        }}
                      />
                    </>
                  ) : null
                }
              />
            )
          })}
        </section>
      </div>
    </div>
  )
}

function ExtraRow({
  locale,
  row,
  busy,
  onMark,
  onRelease,
}: {
  locale: Locale
  row: BookableSession
  busy: boolean
  onMark: () => void
  onRelease: () => void
}) {
  const marked = row.booking_id !== null
  return (
    <div className="flex items-center gap-2 px-4 py-3" data-testid="plan-extra-row">
      <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
        {formatDateInStudioZone(row.starts_at, locale)} · {formatTimeInStudioZone(row.starts_at, locale)}
      </span>
      <span className="flex-1 min-w-0 text-sm font-semibold text-slate-900 dark:text-slate-50 truncate">
        <bdi>{row.group_name}</bdi>
      </span>
      {marked ? (
        <>
          <StatusChip status="planned" label={t(locale, 'schedule.plan.marked')} />
          {/* §3.2 — free until the session starts. `is_markable` is false once it has,
              which is what takes the release control away rather than a second flag. */}
          {row.is_markable && !row.reason ? (
            <button
              type="button"
              data-testid="plan-release"
              disabled={busy}
              onClick={onRelease}
              className="text-[11px] font-bold text-slate-500 dark:text-slate-400 cursor-pointer shrink-0"
            >
              {t(locale, 'schedule.plan.release')}
            </button>
          ) : null}
        </>
      ) : row.is_markable ? (
        <button
          type="button"
          data-testid="plan-mark"
          disabled={busy}
          onClick={onMark}
          className="rounded-lg px-3 py-1.5 text-[11px] font-bold bg-[#0056c5] text-white cursor-pointer shrink-0 disabled:opacity-50"
        >
          {t(locale, 'schedule.plan.mark')}
        </button>
      ) : (
        // Never a disabled button with no explanation: that is the support call this
        // screen exists to prevent, and the reason usually names an upgrade.
        <span data-testid="plan-reason" className="text-[11px] text-slate-400 shrink-0">
          {t(locale, `schedule.plan.reason.${row.reason ?? 'no_plan'}`)}
        </span>
      )}
    </div>
  )
}
