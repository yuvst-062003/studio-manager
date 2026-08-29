// The setup wizard's step 7 — פריטים למכירה.
//
// **Seam 4, from this lane's side, exactly as `PricesWizardStep` does it.** M1 owns the
// wizard container; this file registers one entry into its `setup-wizard` slot and neither
// `SetupWizard.tsx` nor `packages/ui/src/setup-wizard/register.ts` is reopened.
//
// **Unlike `prices`, this step's id had to be ADDED to both contracts** —
// `WIZARD_STEP_ORDER` in `web/packages/ui/src/setup-wizard/types.ts` and `WIZARD_STEPS` in
// `app/services/structure/setup.py` — because §4.3's catalogue never had a step reserved
// for it. The two tuples must agree, and `tests/structure/test_setup_router.py` holds them
// to each other.
//
// **Seventh and last, and it says out loud that it is skippable.** A club that sells
// nothing still finishes its setup: `onSkip` is a real answer here in a way it is not for
// `groups`. Every other step unblocks something — a ladder needs a class, a charge needs a
// plan — and this one unblocks only itself.
//
// **The editor is `ItemForm`, shared with the items screen.** The wizard creates a club's
// first items and the screen edits them forever after; two copies of "does it come in
// sizes" is two places for the size rules to drift.
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { ActionBar, Button, Card, MoneyDisplay, SectionHeader, registerSlot } from '@studio/ui'
import type { WizardStepProps } from '@studio/ui'
import { t } from '@studio/i18n'
import { BLANK_ITEM, ItemForm, toInput, validateItem } from './ItemForm'
import type { ItemDraft, ItemErrors } from './ItemForm'
import { sizesLabel } from './ItemsScreen'
import type { DashboardBillingClient, ProductOut } from './billingClient'

/** `WIZARD_STEP_ORDER` is studio · groups · belts · prices · staff · students · items. */
export const ITEMS_WIZARD_ORDER = 5

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

const rowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
}

const hintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

export function ItemsWizardStep({
  client,
  locale,
  onDone,
  onSkip,
}: WizardStepProps & { client: DashboardBillingClient }) {
  const [items, setItems] = useState<ProductOut[]>([])
  const [draft, setDraft] = useState<ItemDraft>(BLANK_ITEM)
  const [errors, setErrors] = useState<ItemErrors>({})
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    client
      .products()
      .then(setItems)
      // A failed read here is not fatal to the step: the manager can still add an item, and
      // the list below is a confirmation rather than the thing being edited.
      .catch(() => setFailed(true))
  }, [client])

  useEffect(load, [load])

  const add = async () => {
    const found = validateItem(draft, locale)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setBusy(true)
    setFailed(false)
    try {
      await client.createProduct(toInput(draft))
      setDraft(BLANK_ITEM)
      load()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={columnStyle} data-testid="items-wizard-step">
      <SectionHeader title={t(locale, 'billing.product.wizardTitle')} />
      <p style={hintStyle}>{t(locale, 'billing.product.subtitle')}</p>

      {failed ? (
        <p role="alert" style={hintStyle}>
          {t(locale, 'common.error.generic')}
        </p>
      ) : null}

      <ItemForm
        busy={busy}
        draft={draft}
        errors={errors}
        locale={locale}
        onChange={setDraft}
        onSubmit={() => void add()}
        submitLabel={t(locale, 'billing.product.add')}
      />

      {items.map((item) => (
        <Card key={item.id}>
          <div style={rowStyle}>
            <span style={{ flex: '1 1 auto', minInlineSize: 0 }}>{item.name}</span>
            <MoneyDisplay agorot={item.price_agorot} label={t(locale, 'billing.product.price')} />
          </div>
          <p style={hintStyle}>
            {t(locale, 'billing.product.sizes')}: {sizesLabel(item, locale)}
          </p>
        </Card>
      ))}

      {/* The skip is offered as plainly as the finish, and the hint says why. A club with
          nothing to sell that felt obliged to invent an item would be a worse outcome than
          an unfinished step. */}
      <p style={hintStyle}>{t(locale, 'billing.product.wizardHint')}</p>
      {/* Skip on the inline-START edge, finish on the inline-END: `ActionBar`'s own rule is
          that escape hatches go start-side and the thing that moves the task forward goes
          end-side. A lone flex row would put them side by side with nothing saying which
          is which — which is the defect the primitive exists to remove. */}
      <ActionBar
        end={
          <Button onClick={onDone} variant="primary">
            {t(locale, 'billing.product.wizardDone')}
          </Button>
        }
        start={
          <Button onClick={onSkip} variant="secondary">
            {t(locale, 'common.setup.skip')}
          </Button>
        }
      />
    </div>
  )
}

export function registerItemsWizardStep(client: DashboardBillingClient): void {
  registerSlot<WizardStepProps>('setup-wizard', {
    key: 'items',
    order: ITEMS_WIZARD_ORDER,
    render: (props) => <ItemsWizardStep {...props} client={client} />,
  })
}
