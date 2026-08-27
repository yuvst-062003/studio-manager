// Dashboard → Settings → Payments: the הוראת קבע link, one per active plan.
//
// **The canonical editor for the one column `price_plan` lets anyone edit in place.** The
// table is versioned and never overwritten -- a charge raised last year must stay
// explicable by the plan that raised it -- and this URL is the deliberate exception,
// because a link explains nothing about a historical charge and a typo in it has to be
// fixable without inventing a price change that never happened.
//
// **Active plans only.** A closed plan's link charges an amount nobody is billed any more,
// so the server refuses to edit one and this screen does not offer to.
//
// **The server owns the rules.** https, and a host on the configured allowlist -- because
// a free-text URL shown to parents as the club's payment page is a phishing page with the
// club's name on it. This file duplicates neither rule: it renders the refusal.
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Card, MoneyDisplay, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { DashboardBillingClient, PricePlanOut } from './billingClient'

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  flexWrap: 'wrap',
  paddingBlock: 'var(--space-3)',
  borderBlockEnd: 'var(--border-width-hairline) solid var(--border)',
}

type RowState = 'idle' | 'saved' | 'failed'

export function StandingOrderLinksPanel({
  locale,
  client,
}: {
  locale: Locale
  client: DashboardBillingClient
}) {
  const [plans, setPlans] = useState<PricePlanOut[] | null>(null)
  const [state, setState] = useState<Record<string, RowState>>({})

  useEffect(() => {
    let alive = true
    client
      .pricePlans()
      .then((rows) => alive && setPlans(rows.filter((plan) => plan.active_to === null)))
      .catch(() => alive && setPlans([]))
    return () => {
      alive = false
    }
  }, [client])

  const save = useCallback(
    (planId: string, raw: string) => {
      // Blank clears the link rather than saving an empty string: the column's NULL is a
      // real state -- "this plan has no link yet" -- and it is what the badge reads.
      const url = raw.trim() === '' ? null : raw.trim()
      setState((prev) => ({ ...prev, [planId]: 'idle' }))
      void client
        .setStandingOrderLink(planId, url)
        .then(() => setState((prev) => ({ ...prev, [planId]: 'saved' })))
        .catch(() => setState((prev) => ({ ...prev, [planId]: 'failed' })))
    },
    [client],
  )

  if (plans === null) return null

  return (
    <section aria-labelledby="standing-order-links-title" data-testid="standing-order-links">
      <h3 id="standing-order-links-title">{t(locale, 'billing.plan.linksTitle')}</h3>
      {/* §3.2 on the screen, where the manager is the only person who can act on it: a
          successor plan is born WITHOUT a link, on purpose, and this is why. */}
      <p>{t(locale, 'billing.plan.linkNeverInherited')}</p>
      <Card>
        {plans.length === 0 ? (
          <p data-testid="standing-order-links-empty">{t(locale, 'billing.plan.linksEmpty')}</p>
        ) : null}
        {plans.map((plan) => (
          <div key={plan.id} style={rowStyle} data-testid="link-editor-row">
            <strong style={{ flex: 1, minInlineSize: 0 }}>
              <bdi>{plan.name}</bdi>
            </strong>
            {/* The amount beside the field, because a uPay link IS an amount: pasting the
                300 ₪ link onto the 550 ₪ plan is the mistake this layout exists to make
                visible before it is made. */}
            <MoneyDisplay agorot={plan.monthly_amount_agorot} label={plan.name} />
            <TextField
              label={t(locale, 'billing.plan.standingOrderLink')}
              hint={t(locale, 'billing.plan.linkHint')}
              inputMode="url"
              data-testid="link-editor-input"
              defaultValue={plan.standing_order_link_url ?? ''}
              // On blur, like every other field on 3f -- the screen's own subtitle
              // promises autosave, and a Save button here would break that promise for one
              // section only.
              onBlur={(event) => save(plan.id, event.target.value)}
            />
            <span role="status" data-testid="link-editor-state">
              {state[plan.id] === 'saved' ? t(locale, 'billing.plan.linkSaved') : null}
            </span>
            {state[plan.id] === 'failed' ? (
              // Said out loud rather than left as a field that kept the text: the server is
              // the only thing that knows the allowlist, and a manager who walks away from
              // a silently-refused paste believes their parents have a link.
              <span data-testid="link-editor-error" style={{ color: 'var(--danger)' }}>
                {t(locale, 'billing.plan.linkRefused')}
              </span>
            ) : null}
          </div>
        ))}
      </Card>
    </section>
  )
}
