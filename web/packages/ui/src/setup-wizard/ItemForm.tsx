// §4.3's catalogue — 'גי, חגורה, כפפות, דמי ביטוח' — as one editor, used by the items
// screen AND by the wizard's step 7.
//
// **One form, two mounts, deliberately.** The wizard creates a club's first items and the
// screen edits them forever after; two copies of "name, price, does it come in sizes" is
// two places for the size rules to drift, and the size rules are the whole point of the
// feature. `PricesWizardStep` and `PricePlansScreen` each hand-roll their own plan form and
// that pair has already drifted — this one does not repeat it.
//
// **`hasSizes` is UI state and is never sent.** The server has one column, `sizes`, and its
// emptiness IS "this item has no sizes". A boolean on the wire beside the list would let
// `hasSizes = true, sizes = []` exist, which renders a parent a size picker with nothing in
// it. Here the toggle only decides whether the list is shown; `submit` sends `[]` whenever
// it is off, whatever was typed before.
//
// **The sizes keep the manager's order.** A גי runs 100, 110, 120 and gloves run S, M, L —
// sorting either would be wrong, alphabetically `100` precedes `90` and `L` precedes `M`.
// The list is append-and-remove, and reordering is deliberately not offered: the manager
// types them in the order they want and removing one is how a mistake is fixed.
//
// **G2 at the boundary where a human types money.** A manager types 180; the wire carries
// 18000. `agorotFromShekels` is this lane's one conversion and hand-rolling `Number(x)*100`
// here is where a price becomes a float.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { agorotFromShekels } from '@studio/core'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'
import { Switch } from '../primitives/Switch'
import { TextField } from '../primitives/TextField'
import type { WizardProduct, WizardProductInput } from './step-clients'

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

const rowStyle: CSSProperties = {
  alignItems: 'flex-end',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
}

const hintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const chipRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

const chipStyle: CSSProperties = {
  alignItems: 'center',
  background: 'color-mix(in srgb, var(--fg) 8%, transparent)',
  borderRadius: 'var(--radius-pill)',
  display: 'flex',
  gap: 'var(--space-1)',
  fontSize: 'var(--text-caption)',
  paddingBlock: '2px',
  paddingInline: 'var(--space-2)',
}

export type ItemDraft = {
  name: string
  /** Shekels, as typed. Converted once, in `toInput`. */
  price: string
  hasSizes: boolean
  sizes: string[]
}

export type ItemErrors = Partial<Record<'name' | 'price' | 'sizes', string>>

export const BLANK_ITEM: ItemDraft = { name: '', price: '', hasSizes: false, sizes: [] }

/** An existing product, back into the shape the form edits. `hasSizes` is DERIVED from the
 *  list, which is the whole reason the server does not carry it. */
export function draftFrom(product: WizardProduct): ItemDraft {
  const sizes = product.sizes ?? []
  return {
    name: product.name,
    price: String(product.price_agorot / 100),
    hasSizes: sizes.length > 0,
    sizes: [...sizes],
  }
}

/**
 * What the form refuses, in one exported place so the rules are testable without a render.
 *
 * The third rule is the one that only exists because of the toggle: sizes turned ON with an
 * empty list is a product whose parent-facing picker would have nothing in it. The server
 * cannot catch this — `sizes: []` is a perfectly legal sizeless item there — so it has to
 * be caught where the toggle lives.
 */
export function validateItem(draft: ItemDraft, locale: Locale): ItemErrors {
  const errors: ItemErrors = {}
  if (!draft.name.trim()) errors.name = t(locale, 'billing.product.required')
  if (!draft.price.trim() || agorotFromShekels(draft.price) <= 0) {
    errors.price = t(locale, 'billing.product.required')
  }
  if (draft.hasSizes && draft.sizes.length === 0) {
    errors.sizes = t(locale, 'billing.product.sizesRequired')
  }
  return errors
}

/** "One size" vs the list, one place (lived in ItemsScreen; moved beside the form 2026-08-30). */
export function sizesLabel(product: WizardProduct, locale: Locale): string {
  const sizes = product.sizes ?? []
  return sizes.length === 0 ? t(locale, 'billing.product.sizesNone') : sizes.join(' · ')
}

/** The wire shape. `sizes` is `[]` whenever the toggle is off — see the module docstring. */
export function toInput(draft: ItemDraft): WizardProductInput {
  return {
    name: draft.name.trim(),
    priceAgorot: agorotFromShekels(draft.price),
    sizes: draft.hasSizes ? draft.sizes : [],
  }
}

export function ItemForm({
  busy = false,
  draft,
  errors,
  locale,
  onCancel,
  onChange,
  onSubmit,
  submitLabel,
}: {
  busy?: boolean
  draft: ItemDraft
  errors: ItemErrors
  locale: Locale
  /** Absent on the wizard, where there is nothing to cancel back to. */
  onCancel?: () => void
  onChange: (next: ItemDraft) => void
  onSubmit: () => void
  submitLabel: string
}) {
  const [pending, setPending] = useState('')
  const [duplicate, setDuplicate] = useState(false)

  const addSize = () => {
    const label = pending.trim()
    if (!label) return
    if (draft.sizes.includes(label)) {
      // Said out loud rather than silently de-duplicated. The server would drop it either
      // way, and a manager who typed 110 twice needs to know the second one did nothing.
      setDuplicate(true)
      return
    }
    setDuplicate(false)
    setPending('')
    onChange({ ...draft, sizes: [...draft.sizes, label] })
  }

  return (
    <Card>
      <div style={columnStyle}>
        <div style={rowStyle}>
          <TextField
            error={errors.name}
            label={t(locale, 'billing.product.name')}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            value={draft.name}
          />
          <TextField
            error={errors.price}
            // `inputMode`, not `type="number"`: a numeric keypad on a phone without the
            // spinner, and without a browser silently reformatting a half-typed price.
            inputMode="decimal"
            label={t(locale, 'billing.product.price')}
            onChange={(e) => onChange({ ...draft, price: e.target.value })}
            value={draft.price}
          />
        </div>

        <Switch
          checked={draft.hasSizes}
          label={t(locale, 'billing.product.hasSizes')}
          onCheckedChange={(next) => onChange({ ...draft, hasSizes: next })}
          stateLabels={{
            on: t(locale, 'billing.product.hasSizes'),
            off: t(locale, 'billing.product.sizesNone'),
          }}
        />
        <p style={hintStyle}>{t(locale, 'billing.product.hasSizesHint')}</p>

        {draft.hasSizes ? (
          <>
            <p style={hintStyle}>{t(locale, 'billing.product.sizesHint')}</p>
            {draft.sizes.length > 0 ? (
              <ul style={chipRowStyle}>
                {draft.sizes.map((size) => (
                  <li key={size} style={chipStyle}>
                    <bdi>{size}</bdi>
                    <Button
                      // The size is in the accessible name: a column of buttons all called
                      // "הסרת מידה" is a column a screen reader cannot choose from.
                      aria-label={`${t(locale, 'billing.product.sizeRemove')} ${size}`}
                      onClick={() =>
                        onChange({ ...draft, sizes: draft.sizes.filter((one) => one !== size) })
                      }
                      variant="ghost"
                    >
                      ×
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div style={rowStyle}>
              <TextField
                error={duplicate ? t(locale, 'billing.product.sizeDuplicate') : errors.sizes}
                label={t(locale, 'billing.product.sizeNew')}
                onChange={(e) => {
                  setDuplicate(false)
                  setPending(e.target.value)
                }}
                onKeyDown={(e) => {
                  // Enter adds the size; it must not submit the item. Typing 100 ⏎ 110 ⏎ is
                  // how a list of six sizes actually gets entered, and a form submit on the
                  // first Enter would save a product with one size in it.
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addSize()
                  }
                }}
                value={pending}
              />
              <Button onClick={addSize} variant="secondary">
                {t(locale, 'billing.product.sizeAdd')}
              </Button>
            </div>
          </>
        ) : null}

        <div style={rowStyle}>
          <Button disabled={busy} onClick={onSubmit} variant="primary">
            {submitLabel}
          </Button>
          {onCancel ? (
            <Button onClick={onCancel} variant="secondary">
              {t(locale, 'billing.product.cancel')}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
