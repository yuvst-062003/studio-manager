// פריטים למכירה — §4.3's catalogue, on a screen, for the first time.
//
// **`product` has had a full CRUD API since W4 and no manager screen at all.**
// `billingClient.products()` was written, exported and called by nothing; the only way a
// club's גי ever reached the catalogue was a POST by hand. `11a`'s coach handover sheet and
// `12e`'s parent shop both read a list nobody had a way to fill.
//
// **Retire, never delete** (§11.4's shape, applied to a catalogue). A charge raised for a
// גי names that product; deleting the row would leave a family's history pointing at
// nothing. `is_active` is the whole of it, and the screen says so rather than leaving a
// manager hunting for a delete button that is deliberately absent.
//
// **Retired items are hidden by default and one toggle away.** A club that stopped selling
// gloves does not want them in the list, and a club that starts again must not have to
// create a second row with the same name — which is exactly what a screen with no way back
// would make them do.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  MoneyDisplay,
  PageHeader,
  StatusChip,
} from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { BLANK_ITEM, ItemForm, draftFrom, sizesLabel, toInput, validateItem } from './ItemForm'
import type { ItemDraft, ItemErrors } from './ItemForm'
import type { DashboardBillingClient, ProductOut } from './billingClient'

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-5)',
}

const rowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
}

const nameStyle: CSSProperties = {
  flex: '1 1 auto',
  fontWeight: 'var(--weight-medium)',
  minInlineSize: 0,
}

const hintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

/** The sizes as a row reads them. Empty is a real answer — a חגורה — and it is said in
 *  words rather than left blank, because a blank cell reads as "nobody filled this in". */
// `sizesLabel` moved beside the form (2026-08-30); re-exported for this lane's importers.
export { sizesLabel }

export function ItemsScreen({
  client,
  locale,
  onChanged,
  products,
}: {
  client: DashboardBillingClient
  locale: Locale
  onChanged: () => void
  products: readonly ProductOut[]
}) {
  const [draft, setDraft] = useState<ItemDraft>(BLANK_ITEM)
  const [editing, setEditing] = useState<string | null>(null)
  const [errors, setErrors] = useState<ItemErrors>({})
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [showRetired, setShowRetired] = useState(false)

  const visible = showRetired ? products : products.filter((row) => row.is_active)

  const save = async () => {
    const found = validateItem(draft, locale)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setBusy(true)
    setFailed(false)
    try {
      if (editing) await client.updateProduct(editing, toInput(draft))
      else await client.createProduct(toInput(draft))
      setDraft(BLANK_ITEM)
      setEditing(null)
      onChanged()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const setActive = async (product: ProductOut, isActive: boolean) => {
    setFailed(false)
    try {
      // Only `isActive`. A retire that also re-sent the name and price would overwrite an
      // edit made in another tab with whatever this row happened to be holding.
      await client.updateProduct(product.id, { isActive })
      onChanged()
    } catch {
      setFailed(true)
    }
  }

  return (
    <div style={columnStyle} data-testid="items-screen">
      <PageHeader
        subtitle={t(locale, 'billing.product.subtitle')}
        title={t(locale, 'billing.product.title')}
      />

      {failed ? (
        <Card>
          <p role="alert" style={hintStyle}>
            {t(locale, 'common.error.generic')}
          </p>
        </Card>
      ) : null}

      <ItemForm
        busy={busy}
        draft={draft}
        errors={errors}
        locale={locale}
        onCancel={
          editing
            ? () => {
                setEditing(null)
                setDraft(BLANK_ITEM)
                setErrors({})
              }
            : undefined
        }
        onChange={setDraft}
        onSubmit={() => void save()}
        submitLabel={editing ? t(locale, 'billing.product.save') : t(locale, 'billing.product.add')}
      />

      <Checkbox
        checked={showRetired}
        label={t(locale, 'billing.product.showRetired')}
        onChange={(e) => setShowRetired(e.target.checked)}
      />

      {visible.length === 0 ? (
        <EmptyState title={t(locale, 'billing.product.empty')} />
      ) : (
        visible.map((product) => (
          <Card key={product.id}>
            <div style={rowStyle}>
              <span style={nameStyle}>{product.name}</span>
              {!product.is_active ? (
                <StatusChip label={t(locale, 'billing.product.retired')} status="cancelled" />
              ) : null}
              <MoneyDisplay
                agorot={product.price_agorot}
                label={t(locale, 'billing.product.price')}
              />
              <Button
                aria-label={`${t(locale, 'billing.product.edit')} ${product.name}`}
                onClick={() => {
                  setEditing(product.id)
                  setDraft(draftFrom(product))
                  setErrors({})
                }}
                variant="secondary"
              >
                {t(locale, 'billing.product.edit')}
              </Button>
              <Button
                aria-label={`${
                  product.is_active
                    ? t(locale, 'billing.product.retire')
                    : t(locale, 'billing.product.revive')
                } ${product.name}`}
                onClick={() => void setActive(product, !product.is_active)}
                variant="ghost"
              >
                {product.is_active
                  ? t(locale, 'billing.product.retire')
                  : t(locale, 'billing.product.revive')}
              </Button>
            </div>
            <p style={hintStyle}>
              {t(locale, 'billing.product.sizes')}: {sizesLabel(product, locale)}
            </p>
          </Card>
        ))
      )}

      {/* The no-stock and no-delete rules used to be spelled out here in two hint lines;
          the owner asked for them gone (2026-08-30) — the screen's own shape already
          shows both. */}
    </div>
  )
}
