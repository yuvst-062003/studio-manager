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
import { useAuthedImage } from '@studio/core'
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

//: The row's photo. Fixed square so a portrait and a landscape shot do not change the
//: card's height — the manager is scanning a list, not viewing a gallery.
const thumbStyle: CSSProperties = {
  blockSize: '3rem',
  inlineSize: '3rem',
  objectFit: 'cover',
  borderRadius: 'var(--radius-sm)',
  border: 'var(--border-width-hairline) solid var(--border)',
  flexShrink: 0,
}

const photoRowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  marginBlockStart: 'var(--space-2)',
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
  classes = [],
}: {
  client: DashboardBillingClient
  locale: Locale
  onChanged: () => void
  products: readonly ProductOut[]
  /** The club's classes, for the picker. An item belongs to exactly one (owner,
   *  2026-09-09), and `validateItem` makes the field mandatory as soon as this list is
   *  non-empty — so a club with no classes yet is not blocked from adding items, and a
   *  club with classes cannot file one under nothing by accident. */
  classes?: readonly { id: string; name: string }[]
}) {
  const [draft, setDraft] = useState<ItemDraft>(BLANK_ITEM)
  const [editing, setEditing] = useState<string | null>(null)
  const [errors, setErrors] = useState<ItemErrors>({})
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [showRetired, setShowRetired] = useState(false)
  //: Which row is mid-upload, and what went wrong on it. Keyed by product id rather than a
  //: single boolean: a manager photographing a catalogue does it row after row, and one
  //: shared flag would grey out every button because one row is busy.
  const [photoBusy, setPhotoBusy] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<Record<string, string>>({})

  const visible = showRetired ? products : products.filter((row) => row.is_active)

  const save = async () => {
    const found = validateItem(draft, locale, classes)
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

  const setPhoto = async (product: ProductOut, file: File | null) => {
    setPhotoBusy(product.id)
    setPhotoError((current) => ({ ...current, [product.id]: '' }))
    try {
      if (file) await client.uploadProductImage(product.id, file)
      else await client.deleteProductImage(product.id)
      onChanged()
    } catch (error: unknown) {
      // The two refusals the route actually returns are worth telling apart: "wrong format"
      // and "too big" send a manager to different fixes, and one generic "failed" sends
      // them back to the same file.
      const status = (error as { status?: number } | null)?.status
      setPhotoError((current) => ({
        ...current,
        [product.id]:
          status === 415
            ? t(locale, 'billing.product.photoUnsupported')
            : status === 413
              ? t(locale, 'billing.product.photoTooLarge')
              : t(locale, 'billing.product.photoFailed'),
      }))
    } finally {
      setPhotoBusy(null)
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
        classes={classes}
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

            {/* The photo the parent app's shop renders. A SECOND step after the item
                exists, because the object is keyed by the product's own id — so there is
                nothing to upload against until the row has been created. */}
            <div style={photoRowStyle}>
              {product.image_url ? (
                <ProductThumb productId={product.id} src={product.image_url} />
              ) : (
                <p style={hintStyle}>{t(locale, 'billing.product.photoNone')}</p>
              )}
              <label
                style={{ fontSize: 'var(--text-caption)' }}
                // The input carries the accessible name; the label names WHICH product, so
                // a screen full of "Add a photo" is navigable.
                aria-label={`${
                  product.image_url
                    ? t(locale, 'billing.product.photoReplace')
                    : t(locale, 'billing.product.photoAdd')
                } ${product.name}`}
              >
                <span>
                  {product.image_url
                    ? t(locale, 'billing.product.photoReplace')
                    : t(locale, 'billing.product.photoAdd')}
                </span>
                <input
                  accept="image/png,image/jpeg,image/webp"
                  data-testid={`product-photo-${product.id}`}
                  disabled={photoBusy !== null}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null
                    // Cleared so choosing the SAME file twice fires `change` again — after a
                    // failed upload a manager retries with the file they already picked.
                    event.target.value = ''
                    if (file) void setPhoto(product, file)
                  }}
                  type="file"
                />
              </label>
              {product.image_url ? (
                <Button
                  aria-label={`${t(locale, 'billing.product.photoRemove')} ${product.name}`}
                  disabled={photoBusy !== null}
                  onClick={() => void setPhoto(product, null)}
                  variant="ghost"
                >
                  {t(locale, 'billing.product.photoRemove')}
                </Button>
              ) : null}
              {photoError[product.id] ? (
                <p role="alert" style={{ ...hintStyle, color: 'var(--danger)' }}>
                  {photoError[product.id]}
                </p>
              ) : null}
            </div>
          </Card>
        ))
      )}

      {/* The no-stock and no-delete rules used to be spelled out here in two hint lines;
          the owner asked for them gone (2026-08-30) — the screen's own shape already
          shows both. */}
    </div>
  )
}

/** The row's photograph, fetched through the session.
 *
 * `image_url` is a RELATIVE path to a route the API guards with the bearer token, and a
 * bare `<img src>` against one fails twice on a deployed build: the browser resolves the
 * path against the DASHBOARD's host — which answers every `/api` path with the SPA shell —
 * and the tag cannot send an Authorization header even when it reaches the right host. So
 * a manager uploaded a photo, the row's buttons changed to "replace" and "remove", and no
 * picture ever appeared. That reads as an upload that did nothing, and is what "the shop
 * cannot upload item images" was.
 *
 * `useAuthedImage` is the fix the studio logo already made on 2026-08-30 (see its own
 * docstring, and `SettingsScreen`/`App.tsx`, which both render the logo through it). Its
 * own component so the hook is per row — a hook cannot be called inside `.map`.
 *
 * It yields null while the bytes are in flight and for a refused fetch, and the tile is
 * simply absent until then. `alt=""`: the item's name is beside it in the same row, and a
 * screen reader reading the name twice is worse than not describing a decorative tile. */
function ProductThumb({ productId, src }: { productId: string; src: string }) {
  const url = useAuthedImage(src)
  if (!url) return null
  return <img alt="" data-testid={`product-thumb-${productId}`} src={url} style={thumbStyle} />
}
