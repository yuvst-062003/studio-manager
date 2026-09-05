// A render harness for checkpoint 4's design review, NOT a shipped entry.
//
// The fixtures are what THIS product's catalogue can hold — id, name, description, price,
// sizes. There are no images, categories or belt colours in them because there are none in
// the model; see features/billing/redesign/types.ts for why.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@studio/ui'
import { formatAgorot } from '@studio/core'
import { ParentShell } from './features/shell/ParentShell'
import { ShopScreen } from './features/billing/redesign/ShopScreen'
import type { CartLine, CheckoutState, ShopProduct } from './features/billing/redesign/types'
import './tailwind.css'

const PRODUCTS: ShopProduct[] = [
  { id: 'p1', name: 'ג׳ודוגי תחרותי', description: 'בד כבד 750 גרם, תפרים מחוזקים', priceAgorot: 42000, sizes: ['120', '130', '140', '150', '160'] },
  { id: 'p2', name: 'חגורה רשמית', description: 'כותנה סרוגה, תפר כפול', priceAgorot: 6500, sizes: [] },
  { id: 'p3', name: 'ג׳ודוגי מתאמן', description: 'בד 450 גרם, מתאים לאימוני יסוד', priceAgorot: 26000, sizes: ['120', '130', '140'] },
  { id: 'p4', name: 'תיק מועדון', description: null, priceAgorot: 9000, sizes: [] },
  { id: 'p5', name: 'חולצת מועדון', description: 'כותנה, עם סמל רקום', priceAgorot: 7500, sizes: ['S', 'M', 'L'] },
  { id: 'p6', name: 'מגן שיניים', description: 'כולל קופסת נשיאה', priceAgorot: 4500, sizes: [] },
]

function Preview() {
  const params = new URLSearchParams(window.location.search)
  const state = params.get('state')
  const [cart, setCart] = useState<readonly CartLine[]>(
    params.has('cart')
      ? [
          { productId: 'p1', name: 'ג׳ודוגי תחרותי', priceAgorot: 42000, size: '140', quantity: 1, note: 'רקמה: יוסי' },
          { productId: 'p2', name: 'חגורה רשמית', priceAgorot: 6500, size: null, quantity: 2, note: null },
        ]
      : [],
  )
  const [checkout, setCheckout] = useState<CheckoutState>(
    params.has('placed') ? { kind: 'placed', lines: 3, totalAgorot: 55000 } : { kind: 'idle' },
  )

  return (
    <ParentShell activeTab="shop" updatesBadgeCount={2}>
      <ShopScreen
        products={state === 'loading' ? null : state === 'empty' ? [] : PRODUCTS}
        state={state === 'loading' ? 'loading' : state === 'failed' ? 'failed' : 'ready'}
        onRetry={() => {}}
        cart={cart}
        onAddToCart={(line) => setCart((c) => [...c, line])}
        onSetQuantity={(i, q) => setCart((c) => c.map((l, at) => (at === i ? { ...l, quantity: q } : l)))}
        onRemoveLine={(i) => setCart((c) => c.filter((_, at) => at !== i))}
        checkout={checkout}
        onCheckout={() => {
          setCheckout({ kind: 'sending' })
          const total = cart.reduce((sum, line) => sum + line.priceAgorot * line.quantity, 0)
          setTimeout(
            () =>
              setCheckout(
                params.has('fail')
                  ? { kind: 'failed' }
                  : { kind: 'placed', lines: cart.length, totalAgorot: total },
              ),
            500,
          )
        }}
        onCheckoutClose={() => setCheckout({ kind: 'idle' })}
        money={formatAgorot}
      />
    </ParentShell>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <Preview />
    </ThemeProvider>
  </StrictMode>,
)
