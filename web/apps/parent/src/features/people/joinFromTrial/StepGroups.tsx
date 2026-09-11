// Step 2 of 3 — the base team, and the plan.
//
// **ONE team, not a basket of them** (owner, 2026-09-12: "he has to pick one base team
// anyway"). This was a checkbox list, on the reading that a family ticks however many groups
// they want and the weekly volume across them sets the price. That is not how this club
// sells: `app/models/training_plan.py` — "Base training on Tuesday and Friday is included in
// every plan and is never marked; 400 buys one extra session a week... 550 removes the weekly
// limit". So the base training is ONE group and the PLAN is what buys more, which makes a
// multi-select here a second, contradictory way of asking the same question the plan cards
// below ask properly.
//
// `kind === 'base'` filters the list for the same reason, and `GROUP_KINDS`' own note is the
// authority: "students put THEMSELVES on the competition teams, which is exactly an extra".
// An extra is not something a family joins the club by choosing.
//
// **The price is on the screen now.** What this replaces showed no number at all: one
// sentence promising that "the price is set by how many sessions a week, and appears on the
// payments screen". A family was asked to join a club at a price they would be told later
// (owner, 2026-09-12). `join_from_trial` derived it server-side and took no `price_plan_id`
// on the reasoning that a price a client posts is not a price — while the join wizard's own
// `toRegisterPayload` had always sent one, so the product's main registration door already
// worked the way this one refused to. The server still refuses an id that is not a live plan
// of this studio, so the choice is offered and then checked.
//
// **A club with no published plans still converts.** The picker disappears and the volume
// rule prices the child exactly as before — which is why `price_plan_id` is optional on the
// way out and not a required field with a default.
import { CalendarDays, Users } from 'lucide-react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { PartPlan } from '../../onboarding/wizard/parts/PartPlan'
import type { WizardPlan } from '../../onboarding/wizard/types'
import type { JoinGroupOption } from './joinFromTrialClient'

export function StepGroups({
  locale,
  groups,
  plans,
  trialledGroupId,
  chosenGroupId,
  chosenPlanId,
  showErrors,
  onGroup,
  onPlan,
}: {
  locale: Locale
  groups: readonly JoinGroupOption[]
  plans: readonly WizardPlan[]
  trialledGroupId: string | null
  chosenGroupId: string
  chosenPlanId: string
  showErrors: boolean
  onGroup: (groupId: string) => void
  onPlan: (planId: string) => void
}) {
  // Base groups only. A club that has not classified its groups has them all `base` by
  // default (the column's default), so this narrows nothing for them and everything for a
  // club that runs a competition squad.
  const base = groups.filter((group) => group.kind !== 'extra' && group.kind !== 'private')
  const groupsError =
    showErrors && !chosenGroupId ? t(locale, 'people.joinClub.groupsRequired') : null

  return (
    <div className="flex flex-col gap-4" data-testid="join-step-groups">
      <header className="flex items-start gap-2.5">
        <div className="w-10 h-10 rounded-xl bg-[var(--wz-accent)]/15 text-[var(--wz-accent)] flex items-center justify-center shrink-0">
          <Users className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[19px] font-bold text-[var(--wz-heading)] leading-tight">
            {t(locale, 'people.joinClub.groups.title')}
          </h2>
          <p className="text-[13px] text-[var(--wz-secondary)] leading-relaxed mt-0.5">
            {t(locale, 'people.joinClub.groups.lead')}
          </p>
        </div>
      </header>

      <fieldset className="flex flex-col gap-2.5 border-0 p-0 m-0" data-testid="join-club-groups">
        <legend className="sr-only">{t(locale, 'people.joinClub.chooseGroups')}</legend>
        {base.map((group) => {
          const checked = chosenGroupId === group.id
          return (
            <label
              key={group.id}
              className={`flex items-start gap-3 p-3.5 rounded-2xl cursor-pointer transition-all border-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--wz-accent)] ${
                checked
                  ? 'bg-[var(--wz-surface)] border-[var(--wz-accent)] shadow-md'
                  : 'bg-[var(--wz-surface)] border-[var(--wz-line-strong)]/40 hover:border-[var(--wz-accent)]'
              }`}
            >
              <input
                type="radio"
                name="join-club-group"
                value={group.id}
                checked={checked}
                onChange={() => onGroup(group.id)}
                data-testid={`join-club-group-${group.id}`}
                className="w-5 h-5 mt-0.5 accent-[var(--wz-accent)] shrink-0"
              />
              <span className="flex flex-col gap-1 min-w-0 flex-1">
                <span className="flex items-center gap-2 flex-wrap">
                  <span className="text-[15px] font-bold text-[var(--wz-ink)]">{group.name}</span>
                  {group.id === trialledGroupId ? (
                    <span
                      className="px-2 py-0.5 rounded-md bg-[var(--wz-tint)] text-[var(--wz-accent)] text-[11px] font-semibold"
                      data-testid="join-club-trialled"
                    >
                      {t(locale, 'people.joinClub.trialledHere')}
                    </span>
                  ) : null}
                </span>
                {group.training_weekdays.length > 0 ? (
                  <span className="text-[12px] text-[var(--wz-secondary)] flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5 shrink-0 text-[var(--wz-tertiary)]" />
                    {group.training_weekdays
                      .map((weekday) => t(locale, `schedule.weekday.${weekday}`))
                      .join(' · ')}
                  </span>
                ) : null}
              </span>
            </label>
          )
        })}
        {groupsError ? (
          <p className="text-[11.5px] text-red-600 font-medium" role="alert">
            {groupsError}
          </p>
        ) : null}
      </fieldset>

      {plans.length > 0 ? (
        <PartPlan
          locale={locale}
          plans={plans}
          selectedId={chosenPlanId}
          onSelect={onPlan}
          error={null}
          title={t(locale, 'people.joinClub.plans.title')}
          lead={t(locale, 'people.joinClub.plans.lead')}
        />
      ) : (
        <p
          className="p-3.5 rounded-xl bg-[var(--wz-raised)] border border-[var(--wz-tint)] text-[12.5px] text-[var(--wz-secondary)]"
          data-testid="join-club-no-plans"
        >
          {t(locale, 'people.joinClub.plans.none')}
        </p>
      )}
    </div>
  )
}
