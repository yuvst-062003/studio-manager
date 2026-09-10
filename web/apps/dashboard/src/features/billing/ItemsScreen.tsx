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
  Icon,
  MoneyDisplay,
  PageHeader,
  StatusChip,
} from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { BLANK_ITEM, ItemForm, draftFrom, sizesLabel, toInput, validateItem } from './ItemForm'
import type { ItemDraft, ItemErrors } from './ItemForm'
import type { DashboardBillingClient, ProductOut } from './billingClient'
import { groupByClass } from './byClass'

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-5)',
}

const hintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

/** A class heading over its own items. Quiet: it separates, it does not shout. */
const classHeadingStyle: CSSProperties = {
  fontSize: 'var(--text-caption)',
  fontWeight: 700,
  color: 'var(--text-muted)',
  marginBlock: 'var(--space-4) var(--space-2)',
}

/** The unfiled heading DOES shout — those rows are invisible to every parent. */
const warnHeadingStyle: CSSProperties = {
  fontSize: 'var(--text-caption)',
  fontWeight: 700,
  color: 'var(--danger)',
  marginBlock: 'var(--space-4) var(--space-2)',
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
  // Grouped for display. `classes` is what the item form's picker offers, so both halves of
  // this screen agree about which classes exist and in what order.
  const { unfiled, groups: grouped } = groupByClass(visible, classes)

  /** One item row. Extracted so the grouped and ungrouped layouts render the same card
   *  rather than two copies that drift apart. */
  /**
   * One item, as the prototype's catalogue draws it: **the photo leads**, then the name and
   * price, then what sizes it comes in, then the controls. The screen it replaces stacked
   * every item as a full-width row with the photo last, which is the opposite order to the
   * one a manager shopping their own catalogue reads in.
   *
   * Two things the prototype puts on this card are NOT here, both already in §4: a stock
   * count (rule 1 — `Product` refuses inventory by an explicit decision in its own
   * docstring, so any number here would be invented at render time) and a
   * mandatory-in-cart badge, which has no column.
   */
  const productCard = (product: ProductOut) => (
    <li className="item-card" data-testid={`item-card-${product.id}`} key={product.id}>
      {/* The photo the parent app's shop renders. Uploading is a SECOND step after the item
          exists, because the object is keyed by the product's own id — there is nothing to
          upload against until the row has been created. */}
      <div className="item-card__photo">
        {/* The square IS the control. It used to be a read-only box reading "אין תמונה —
            יוצג ריבוע ברירת מחדל", with the actual upload sitting three controls away in
            the action row as the browser's own grey English "Choose File" button. The owner
            asked for the obvious shape on 2026-09-10: press the empty square, with a
            picture icon in it.

            A `<label>` and not a `<button>`: the label already forwards the press to the
            file input it wraps, so the native file dialog opens with no click handler, and
            the input stays keyboard-reachable and screen-reader-announced. The input
            carries the accessible name naming WHICH product, so a grid full of items is
            navigable rather than twelve identical "add a photo"s. */}
        <label
          className="item-card__photo-drop"
          aria-label={`${
            product.image_url
              ? t(locale, 'billing.product.photoReplace')
              : t(locale, 'billing.product.photoAdd')
          } ${product.name}`}
        >
          {product.image_url ? (
            <ProductThumb productId={product.id} src={product.image_url} />
          ) : (
            <span className="item-card__photo-empty">
              <Icon name="image" size={26} />
              {t(locale, 'billing.product.photoAdd')}
            </span>
          )}
          <input
            accept="image/png,image/jpeg,image/webp"
            className="item-card__photo-input"
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
        {!product.is_active ? (
          <span className="item-card__retired">
            <StatusChip label={t(locale, 'billing.product.retired')} status="cancelled" />
          </span>
        ) : null}
      </div>

      <div className="item-card__body">
        <div className="item-card__head">
          <span className="item-card__name">{product.name}</span>
          <span className="item-card__price">
            <MoneyDisplay
              agorot={product.price_agorot}
              label={t(locale, 'billing.product.price')}
            />
          </span>
        </div>
        <p className="item-card__sizes">
          {t(locale, 'billing.product.sizes')}: {sizesLabel(product, locale)}
        </p>
      </div>

      <div className="item-card__actions">
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

      {photoError[product.id] ? (
        <p className="item-card__error" role="alert">
          {photoError[product.id]}
        </p>
      ) : null}
    </li>
  )

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
        <>
          {/* **Unfiled items are broken, not a category.** `class_id` NULL means the item
              is in NOBODY's shop — the parent app filters on it — so this is a warning with
              the rows attached, above the classes, and never a group named "—". Until this
              existed a manager's item could be invisible to every family with nothing on
              screen saying so. */}
          {unfiled.length > 0 && classes.length > 0 ? (
            <section aria-labelledby="items-unfiled" data-testid="items-unfiled">
              <h2 id="items-unfiled" style={warnHeadingStyle}>
                ⚠ {t(locale, 'billing.byClass.unfiled')}
              </h2>
              <p style={hintStyle}>{t(locale, 'billing.byClass.unfiledItems')}</p>
              <ul className="items-grid">{unfiled.map((product) => productCard(product))}</ul>
            </section>
          ) : null}

          {/* A club with no classes yet — the setup wizard's own state — gets one plain
              list. A heading over every row, or a warning nobody can act on, would both be
              noise there. */}
          {classes.length === 0
            ? <ul className="items-grid">{visible.map((product) => productCard(product))}</ul>
            : grouped.map((group) => (
                <section
                  key={group.classId}
                  aria-labelledby={`items-class-${group.classId}`}
                  data-testid={`items-class-${group.classId}`}
                >
                  <h2 id={`items-class-${group.classId}`} style={classHeadingStyle}>
                    <bdi>{group.className}</bdi>
                  </h2>
                  <ul className="items-grid">
                    {group.rows.map((product) => productCard(product))}
                  </ul>
                </section>
              ))}
        </>
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
  // Sized and cropped by `.item-card__photo`, which holds a fixed ratio so a portrait and
  // a landscape shot leave the grid's rows aligned.
  return <img alt="" data-testid={`product-thumb-${productId}`} src={url} />
}
