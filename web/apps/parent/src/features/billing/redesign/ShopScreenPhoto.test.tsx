// חנות המועדון — a product photo is an AUTHENTICATED image, so it cannot be a bare <img>.
//
// `image_url` is `/api/v1/products/{id}/image`, and that route requires the session bearer
// (`TenantSessionDep`, deliberately open to guardians — see `read_product_image`). A plain
// `<img src>` sends cookies at most, never the Authorization header, so every photo the
// manager uploaded came back 401 and the shop drew the broken-image glyph in its place —
// found on 2026-09-17 the first time a catalogue actually had photos. The dashboard learned
// the same lesson for the studio logo (`useAuthedImage`); the shop goes through the same hook.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ShopScreen } from './ShopScreen'
import type { ShopProduct } from './types'

const authedImage = vi.fn((path: string | null) => (path ? `blob:resolved${path}` : null))

vi.mock('@studio/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@studio/core')>()
  return { ...actual, useAuthedImage: (path: string | null) => authedImage(path) }
})

const PHOTO_PATH = '/api/v1/products/p-gi/image'

function product(overrides: Partial<ShopProduct>): ShopProduct {
  return {
    id: 'p-gi',
    name: "חליפת ג'ודו",
    description: null,
    priceAgorot: 14_900,
    imageUrl: null,
    sizes: [],
    classId: 'c-judo',
    classLabel: 'ג׳ודו',
    ...overrides,
  }
}

function renderShop(products: ShopProduct[]) {
  return render(
    <ShopScreen
      products={products}
      locale="he"
      state="ready"
      onRetry={vi.fn()}
      cart={[]}
      onAddToCart={vi.fn()}
      onSetQuantity={vi.fn()}
      onRemoveLine={vi.fn()}
      checkout={{ kind: 'idle' }}
      onPayByCard={vi.fn()}
      onPayByCash={vi.fn()}
      onCheckout={vi.fn()}
      onCheckoutClose={vi.fn()}
      money={(agorot) => `${agorot / 100}₪`}
      onOpenOrders={vi.fn()}
    />,
  )
}

describe('ShopScreen — product photos', () => {
  it('fetches the photo through the session client, never as a bare <img> at the API path', () => {
    renderShop([product({ imageUrl: PHOTO_PATH })])
    expect(authedImage).toHaveBeenCalledWith(PHOTO_PATH)
    const tile = screen.getByTestId('shop-product-p-gi')
    const img = tile.querySelector('img')
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute('src', `blob:resolved${PHOTO_PATH}`)
    // The raw API path must never reach the tag — that is the request the browser
    // cannot authenticate.
    expect(tile.querySelector(`img[src="${PHOTO_PATH}"]`)).toBeNull()
  })

  it('draws the default tile, not a broken image, while the photo has not resolved', () => {
    authedImage.mockImplementationOnce(() => null)
    renderShop([product({ imageUrl: PHOTO_PATH })])
    const tile = screen.getByTestId('shop-product-p-gi')
    expect(tile.querySelector('img')).toBeNull()
    expect(tile.querySelector('[role="img"]')).not.toBeNull()
  })
})
