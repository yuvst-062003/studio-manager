// Step 5 — ציוד ומדים. What this class sells.
//
// `product.class_id` NULL means UNASSIGNED, not club-wide: the parent shop hides those and
// the dashboard is where a manager gives one a class. So a product created here always names
// this class.
//
// **No stock, no low-stock badge, no "184 units".** `Product` refuses inventory by an
// explicit product decision recorded in its own docstring — "inventory is a different
// product" — and §4 rule 1. The prototype draws stock; drawing it here would mean inventing
// a number at render time.
//
// **One price, not two.** The prototype pairs `regularPrice` with `discountPrice`; D8 took
// the discount box out — the club charges the real price and uses the existing adjust action,
// which records a reason. `mandatoryInCart` has no column and is not drawn.
//
// Sizes are the manager's own list in their own order, and **empty means the item has no
// sizes** — a חגורה. There is no `has_sizes` flag beside it, because two fields describing
// one fact drift, and `has_sizes=true, sizes=[]` renders a parent a size picker with nothing
// in it.
import { useEffect, useState } from 'react'
import { Button, EmptyState, MoneyDisplay, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { ClassStepProps } from '../ClassWizard'
import type { WizardProduct } from '../client'

function toAgorot(shekels: string): number {
  return Math.round(Number(shekels) * 100)
}

export function ItemsStep({ locale, client, classId, onSaved }: ClassStepProps) {
  const [items, setItems] = useState<WizardProduct[] | null>(null)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [sizes, setSizes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!classId) return
    let live = true
    void client
      .listProducts()
      .then((rows) => live && setItems(rows.filter((row) => row.class_id === classId)))
      .catch(() => live && setError(t(locale, 'common.loadFailed.body')))
    return () => {
      live = false
    }
  }, [classId, client, locale])

  const add = async () => {
    if (!classId) return
    setBusy(true)
    setError(null)
    try {
      const created = await client.createProduct({
        name: name.trim(),
        description: null,
        price_agorot: toAgorot(price),
        // Comma-separated in one box rather than a repeater: a size list is short, and the
        // manager's own ORDER is what gets stored, which typing preserves and a set of
        // checkboxes would not.
        sizes: sizes
          .split(',')
          .map((size) => size.trim())
          .filter((size) => size !== ''),
        class_id: classId,
      })
      setItems((current) => [...(current ?? []), created])
      setName('')
      setPrice('')
      setSizes('')
    } catch {
      setError(t(locale, 'schedule.wizard.items.failed'))
    } finally {
      setBusy(false)
    }
  }

  if (!classId) return <p>{t(locale, 'schedule.wizard.needsClass')}</p>

  return (
    <div className="wizard-step">
      <p className="wizard-step__lead">{t(locale, 'schedule.wizard.items.lead')}</p>

      {items && items.length === 0 ? (
        <EmptyState title={t(locale, 'schedule.wizard.items.empty')} />
      ) : null}

      <ul className="wizard-list" data-testid="wizard-items">
        {(items ?? []).map((item) => (
          <li className="wizard-list__item" data-testid={`wizard-item-${item.id}`} key={item.id}>
            <span className="wizard-list__name">{item.name}</span>
            <span className="wizard-list__meta">
              {item.sizes.length > 0
                ? item.sizes.join(' · ')
                : t(locale, 'schedule.wizard.items.noSizes')}
            </span>
            <MoneyDisplay agorot={item.price_agorot} />
          </li>
        ))}
      </ul>

      <fieldset className="wizard-step__box">
        <legend>{t(locale, 'schedule.wizard.items.addTitle')}</legend>
        <div className="wizard-step__row">
          <TextField
            data-testid="wizard-item-name"
            label={t(locale, 'schedule.wizard.items.name')}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          <TextField
            data-testid="wizard-item-price"
            label={t(locale, 'schedule.wizard.items.price')}
            onChange={(event) => setPrice(event.target.value)}
            type="number"
            value={price}
          />
          <TextField
            data-testid="wizard-item-sizes"
            hint={t(locale, 'schedule.wizard.items.sizesHint')}
            label={t(locale, 'schedule.wizard.items.sizes')}
            onChange={(event) => setSizes(event.target.value)}
            value={sizes}
          />
          <Button
            data-testid="wizard-item-add"
            disabled={busy || name.trim() === '' || price === ''}
            onClick={() => void add()}
            variant="secondary"
          >
            {t(locale, 'schedule.wizard.items.add')}
          </Button>
        </div>
      </fieldset>

      {error ? (
        <p className="wizard-step__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="wizard-step__actions">
        {/* A club can run a season without ever selling a גי. */}
        <Button data-testid="wizard-items-next" onClick={() => onSaved()}>
          {(items ?? []).length > 0
            ? t(locale, 'schedule.wizard.next')
            : t(locale, 'schedule.wizard.skipAndNext')}
        </Button>
      </div>
    </div>
  )
}
