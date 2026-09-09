// חנות המועדון — the class headings, and the rule about when they appear.
//
// A family whose children are in judo AND karate was shown one merged list, and both classes
// may sell a `חגורה`. Nothing on the row said which was which, so the parent picked one of
// two identical lines and found out which they had bought when it arrived.
//
// The heading appears ONLY when there is something to tell apart. A family with one child in
// one class would otherwise get a single heading over the whole list, which says nothing they
// did not know and costs a line of a phone screen — so the ungrouped path is asserted here
// just as deliberately as the grouped one.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ShopScreen } from './ShopScreen'
import type { ShopProduct } from './types'

const JUDO = { classId: 'c-judo', classLabel: 'ג׳ודו' }
const KARATE = { classId: 'c-karate', classLabel: 'קראטה' }

function product(id: string, name: string, klass: typeof JUDO): ShopProduct {
  return {
    id,
    name,
    description: null,
    priceAgorot: 5_000,
    imageUrl: null,
    sizes: [],
    ...klass,
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

describe('ShopScreen — class headings', () => {
  it('names each class when the family has two', () => {
    renderShop([
      product('p1', 'חגורה', JUDO),
      product('p2', 'חגורה', KARATE),
      product('p3', 'גי', JUDO),
    ])
    expect(screen.getByTestId(`shop-class-heading-${JUDO.classId}`)).toHaveTextContent('ג׳ודו')
    expect(screen.getByTestId(`shop-class-heading-${KARATE.classId}`)).toHaveTextContent('קראטה')
    // Every item still reachable — grouping must not drop one.
    for (const id of ['p1', 'p2', 'p3']) {
      expect(screen.getByTestId(`shop-product-${id}`)).toBeInTheDocument()
    }
  })

  it('draws no heading at all for a family with one class', () => {
    renderShop([product('p1', 'חגורה', JUDO), product('p2', 'גי', JUDO)])
    expect(screen.queryByTestId(`shop-class-heading-${JUDO.classId}`)).not.toBeInTheDocument()
    expect(screen.getByTestId('shop-product-p1')).toBeInTheDocument()
    expect(screen.getByTestId('shop-product-p2')).toBeInTheDocument()
  })

  it('gives each class heading a section it actually labels', () => {
    // The heading is an `h2` tied to its section by aria-labelledby, so a screen reader
    // announces which class a group of items belongs to rather than reading them as one run.
    renderShop([product('p1', 'חגורה', JUDO), product('p2', 'חגורה', KARATE)])
    const judo = screen.getByTestId(`shop-class-heading-${JUDO.classId}`)
    expect(judo.tagName).toBe('H2')
    expect(screen.getByRole('region', { name: 'ג׳ודו' })).toContainElement(
      screen.getByTestId('shop-product-p1'),
    )
  })
})
