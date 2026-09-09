// מחירים לפי חוג — the screen that makes per-class pricing operable.
//
// **Prices could be DEFINED before this and assigned to nobody.** `student_class_price` has
// been read by the billing run since 2026-09-09 and `GET/PUT /students/{id}/class-prices`
// have existed and been tested since the commit after it, but no screen called either — so
// every family kept billing through `student.price_plan_id` and the feature was inert.
//
// Three decisions carry the weight here, and none of them is cosmetic:
//
//   * THE ROWS COME FROM ENROLLMENTS, not from the price rows. A class the child joined and
//     nobody has priced still appears — that is the row a manager has to be able to act on,
//     and the server builds the list that way for exactly this reason.
//   * A CLASS'S DROPDOWN OFFERS THAT CLASS'S OWN PLANS AND NOTHING ELSE. Owner,
//     2026-09-09: "each class can have different payment plans — judo has 3, karate has 2",
//     and then, on seeing club-wide plans offered here: "again, it's per class — a class can
//     have no all-classes plan". So an unfiled plan is NOT offered as a choice for a class,
//     even though the server would accept one. The server refuses a plan whose own
//     `class_id` names a DIFFERENT class, which already rules out the worst case — filing
//     judo's price under karate, real money, wrong, and explicable only by reading two
//     tables side by side. This narrows it the rest of the way, to the club's own rule.
//
//     **The consequence, stated rather than discovered:** every plan created before
//     per-class pricing has no class, so a club that has not yet filed its plans sees an
//     empty picker here. Filing is one dropdown on מחירים ומסלולים, and until it is done the
//     child keeps billing at the fallback — nobody's bill moves, and the row says so.
//   * "NO SPECIFIC PRICE" NAMES THE FALLBACK AMOUNT. An empty row must never read as "pays
//     nothing": it means the child is charged `student.price_plan_id`, and the note says so
//     with the figure in it. When there is no fallback either, the row says THAT instead —
//     which is the only state where nothing is charged, and the only one allowed to look
//     like it.
//
// Saving is one PUT over the whole picture rather than a call per row: a partial save would
// leave a child priced for judo and not karate with nothing on screen saying which half
// landed.
import { useEffect, useMemo, useState } from 'react'
import { apiFetch, formatAgorot } from '@studio/core'
import { Button, Card, SelectField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { makeDashboardBillingClient } from './billingClient'
import type { DashboardBillingClient, PricePlanOut, StudentClassPriceOut } from './billingClient'

type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

export function ClassPricesCard({
  locale,
  studentId,
  client: injectedClient,
}: {
  locale: Locale
  studentId: string
  /** Injectable so this card can be rendered against a stub. It is the only reason the
   *  prop exists: a card that builds its own client from the module-level `apiFetch` is a
   *  card whose rows no test can put on screen, and the rows are the whole feature. */
  client?: DashboardBillingClient
}) {
  const client = useMemo(
    () => injectedClient ?? makeDashboardBillingClient(apiFetch),
    [injectedClient],
  )
  const [rows, setRows] = useState<readonly StudentClassPriceOut[] | null>(null)
  const [plans, setPlans] = useState<readonly PricePlanOut[]>([])
  const [fallbackPlanId, setFallbackPlanId] = useState<string | null>(null)
  /** The manager's unsaved choices, keyed by class id. `null` is a real value — it clears
   *  that class's price — so this cannot be a map of truthy ids. */
  const [draft, setDraft] = useState<Record<string, string | null>>({})
  const [failed, setFailed] = useState(false)
  const [save, setSave] = useState<SaveState>('idle')

  useEffect(() => {
    let live = true
    void Promise.all([client.studentClassPrices(studentId), client.pricePlans()])
      .then(([prices, planList]) => {
        if (!live) return
        setRows(prices.items)
        setFallbackPlanId(prices.fallback_price_plan_id ?? null)
        setPlans(planList)
        setDraft(
          Object.fromEntries(prices.items.map((row) => [row.class_id, row.price_plan_id ?? null])),
        )
        setFailed(false)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [client, studentId])

  /** What the child pays for a class nobody has priced. Resolved from the plan list rather
   *  than asked for separately — the picker already needs every plan, and a second read for
   *  one amount is a second thing that can fail. */
  const fallback = useMemo(
    () => plans.find((plan) => plan.id === fallbackPlanId) ?? null,
    [plans, fallbackPlanId],
  )

  /** The plans a given class may be priced with: its OWN, and no others. A plan with no
   *  class of its own is not offered here — the club's rule is per class, and the server
   *  would refuse any plan belonging to a different one regardless. */
  const plansFor = (classId: string) => plans.filter((plan) => plan.class_id === classId)

  const onSave = () => {
    if (rows === null) return
    setSave('saving')
    void client
      .setStudentClassPrices(
        studentId,
        rows.map((row) => ({ classId: row.class_id, pricePlanId: draft[row.class_id] ?? null })),
      )
      .then((next) => {
        setRows(next.items)
        setFallbackPlanId(next.fallback_price_plan_id ?? null)
        setDraft(
          Object.fromEntries(next.items.map((row) => [row.class_id, row.price_plan_id ?? null])),
        )
        setSave('saved')
      })
      .catch(() => setSave('failed'))
  }

  if (failed) {
    return (
      <Card>
        <h2>{t(locale, 'billing.classPrices.title')}</h2>
        <p data-testid="class-prices-failed">{t(locale, 'billing.classPrices.loadFailed')}</p>
      </Card>
    )
  }
  if (rows === null) return null

  return (
    <Card>
      <h2>{t(locale, 'billing.classPrices.title')}</h2>
      {rows.length === 0 ? (
        <p data-testid="class-prices-empty">{t(locale, 'billing.classPrices.empty')}</p>
      ) : (
        <>
          <p data-testid="class-prices-hint">{t(locale, 'billing.classPrices.hint')}</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map((row) => {
              const chosenId = draft[row.class_id] ?? null
              const chosen = plans.find((plan) => plan.id === chosenId) ?? null
              return (
                <li
                  key={row.class_id}
                  data-testid={`class-price-row-${row.class_id}`}
                  style={{ marginBlockEnd: 'var(--space-4)' }}
                >
                  <SelectField
                    data-testid={`class-price-select-${row.class_id}`}
                    label={t(locale, 'billing.classPrices.planFor').replace('{{class}}', row.class_name)}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        // The empty option is "no specific price", which the PUT sends as
                        // an explicit null so the server DELETES the row rather than
                        // storing a second spelling of "not priced".
                        [row.class_id]: event.target.value === '' ? null : event.target.value,
                      }))
                    }
                    value={chosenId ?? ''}
                  >
                    <option value="">{t(locale, 'billing.classPrices.none')}</option>
                    {plansFor(row.class_id).map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} · {formatAgorot(plan.monthly_amount_agorot)}
                      </option>
                    ))}
                  </SelectField>
                  {chosen === null ? (
                    <p data-testid={`class-price-fallback-${row.class_id}`}>
                      {fallback === null
                        ? t(locale, 'billing.classPrices.noFallback')
                        : t(locale, 'billing.classPrices.fallbackNote').replace(
                            '{{amount}}',
                            formatAgorot(fallback.monthly_amount_agorot),
                          )}
                    </p>
                  ) : (
                    <p data-testid={`class-price-amount-${row.class_id}`}>
                      {formatAgorot(chosen.monthly_amount_agorot)}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
          <Button data-testid="class-prices-save" disabled={save === 'saving'} onClick={onSave}>
            {save === 'saving'
              ? t(locale, 'billing.classPrices.saving')
              : t(locale, 'billing.classPrices.save')}
          </Button>
          {save === 'saved' ? (
            <p data-testid="class-prices-saved" role="status">
              {t(locale, 'billing.classPrices.saved')}
            </p>
          ) : null}
          {save === 'failed' ? (
            <p data-testid="class-prices-save-failed" role="alert">
              {t(locale, 'billing.classPrices.saveFailed')}
            </p>
          ) : null}
        </>
      )}
    </Card>
  )
}
