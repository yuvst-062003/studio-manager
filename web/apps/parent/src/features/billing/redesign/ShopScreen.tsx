// חנות המועדון -- ported from GearScreen.tsx. See types.ts for the full list of the
// prototype's product fields that do not exist on this product (photos, categories, belt
// colour, order-tracker state) and why none of them is guessable from what the API returns.
import { useState } from 'react'
import { CheckCircle2, ChevronLeft, ShieldCheck, ShoppingBag, X } from 'lucide-react'
import { fill } from '@studio/core'
import { t } from '@studio/i18n'
import { resolveLoadFailedText } from '../../shell/loadFailed'
import type { Locale } from '@studio/i18n'
import { useDialog } from '../../onboarding/wizard/useDialog'
import type { CartLine, CheckoutState, ShopProduct } from './types'

const QUANTITY_OPTIONS = Array.from({ length: 10 }, (_, index) => index + 1)

export function ShopScreen({
  products,
  locale,
  state,
  onRetry,
  cart,
  onAddToCart,
  onSetQuantity,
  onRemoveLine,
  checkout,
  onCheckout,
  onCheckoutClose,
  money,
  onOpenOrders,
}: {
  /** `null` while loading. */
  products: readonly ShopProduct[] | null
  locale: Locale
  state: 'ready' | 'loading' | 'failed'
  onRetry: () => void
  cart: readonly CartLine[]
  onAddToCart: (line: CartLine) => void
  /** index into `cart`, and the new quantity (1..10). */
  onSetQuantity: (index: number, quantity: number) => void
  onRemoveLine: (index: number) => void
  checkout: CheckoutState
  onCheckout: () => void
  onCheckoutClose: () => void
  /** Integer agorot -> a formatted string. NEVER divide by 100 in this file. */
  money: (agorot: number) => string
  /** Opens ההזמנות שלי — the shop's own history, which used to sit on פרופיל. */
  onOpenOrders: () => void
}) {
  // Product customiser sheet -- belongs entirely to the sheet, nothing outside it reads it.
  const [selectedProduct, setSelectedProduct] = useState<ShopProduct | null>(null)
  const [modalSize, setModalSize] = useState<string | null>(null)
  const [modalQty, setModalQty] = useState<number>(1)
  const [modalNote, setModalNote] = useState<string>('')

  // Cart sheet.
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false)

  const customiserDialogRef = useDialog(selectedProduct !== null, () => setSelectedProduct(null))
  const cartDialogRef = useDialog(isCartOpen, () => setIsCartOpen(false))

  const cartTotalQty = cart.reduce((sum, line) => sum + line.quantity, 0)
  const cartTotalAgorot = cart.reduce((sum, line) => sum + line.priceAgorot * line.quantity, 0)

  const catalog = products ?? []
  const showCatalog = state === 'ready' && catalog.length > 0

  const openProduct = (product: ShopProduct) => {
    setSelectedProduct(product)
    setModalSize(null)
    setModalQty(1)
    setModalNote('')
  }

  const handleAddToCart = () => {
    if (!selectedProduct) return
    if (selectedProduct.sizes.length > 0 && modalSize === null) return
    const note = modalNote.trim()
    onAddToCart({
      productId: selectedProduct.id,
      name: selectedProduct.name,
      priceAgorot: selectedProduct.priceAgorot,
      size: modalSize,
      quantity: modalQty,
      note: note === '' ? null : note,
    })
    setSelectedProduct(null)
  }

  const sizeMissing = selectedProduct !== null && selectedProduct.sizes.length > 0 && modalSize === null

  return (
    <div data-testid="shop-screen" className="flex flex-col min-h-screen pb-32 bg-[#faf8ff]">
      {/* Top Header Section */}
      <header className="px-5 pt-8 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-black text-[#0A1938] tracking-tight leading-none mb-1.5">
              {t(locale, 'billing.shop.title')}
            </h1>
            <p className="text-[13px] font-medium text-slate-600">{t(locale, 'billing.shop.subtitle')}</p>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-1 bg-[#EEF2FF] text-[#2563EB] px-2.5 py-1.5 rounded-full border border-blue-100 shadow-xs">
              <ShieldCheck className="w-4 h-4 text-[#2563EB]" aria-hidden="true" />
              <span className="text-xs font-bold whitespace-nowrap">{t(locale, 'billing.shop.standardBadge')}</span>
            </div>
            {/* ההזמנות שלי — moved here from פרופיל (owner review, 2026-09-06). It belongs
                beside the catalogue it is a history of, which is also where the prototype's
                own order tracker sits. */}
            <button
              type="button"
              onClick={onOpenOrders}
              data-testid="shop-open-orders"
              className="text-xs font-bold text-[#2563EB] underline underline-offset-2 whitespace-nowrap cursor-pointer"
            >
              {t(locale, 'billing.shop.ordersCta')}
            </button>
          </div>
        </div>
      </header>

      {showCatalog ? (
        <>
          {/* Product Catalog Grid */}
          <main className="px-5 mt-4 flex-1">
            <div className="grid grid-cols-2 gap-3.5" data-testid="shop-grid">
              {catalog.map((product) => (
                <article
                  key={product.id}
                  data-testid={`shop-product-${product.id}`}
                  className="product-item-card bg-white rounded-2xl p-2.5 shadow-xs border border-slate-100 flex flex-col justify-between transition-all hover:shadow-md cursor-pointer active:scale-[0.98]"
                >
                  <div>
                    {/* The manager's photo when there is one, the default tile when there
                        is not — which is the ordinary state of a catalogue nobody has
                        photographed yet, not an error. */}
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt=""
                        loading="lazy"
                        className="relative w-full aspect-square rounded-xl overflow-hidden bg-slate-50 mb-2.5 object-cover"
                      />
                    ) : (
                      <div
                        role="img"
                        aria-label={t(locale, 'billing.shop.noPhoto')}
                        className="relative w-full aspect-square rounded-xl overflow-hidden bg-slate-50 mb-2.5 flex items-center justify-center"
                      >
                        <ShoppingBag className="w-8 h-8 text-slate-300" aria-hidden="true" />
                      </div>
                    )}
                    <h3 className="font-black text-[15px] text-[#0A1938] leading-tight mb-1 line-clamp-1 text-start">
                      {product.name}
                    </h3>
                    {product.description !== null && (
                      <p className="text-xs text-slate-500 line-clamp-1 mb-2.5 text-start">
                        {product.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-1 mt-auto gap-1.5">
                    <button
                      type="button"
                      data-testid={`shop-choose-${product.id}`}
                      onClick={() => openProduct(product)}
                      className="flex items-center gap-1 bg-[#EEF2FF] hover:bg-[#E0E7FE] text-[#2563EB] px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      <span>{t(locale, 'billing.shop.choose')}</span>
                      <span className="text-sm font-black">+</span>
                    </button>
                    <span className="font-extrabold text-[#0A1938] text-base">
                      {money(product.priceAgorot)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </main>

          {/* Delivery Guarantee Note */}
          <section className="px-5 mt-5">
            <div className="bg-[#EEF2FE] border border-blue-100 rounded-2xl p-4 flex items-center gap-3">
              <div className="text-[#2563EB] shrink-0">
                <ShieldCheck className="w-6 h-6" aria-hidden="true" />
              </div>
              <p className="text-xs font-semibold text-[#1e3a8a] leading-relaxed text-start">
                {t(locale, 'billing.shop.deliveryNote')}
              </p>
            </div>
          </section>
        </>
      ) : (
        <main className="px-5 mt-4 flex-1">
          <div
            data-testid={state === 'ready' ? 'shop-empty' : undefined}
            className="bg-white rounded-2xl border border-slate-100 shadow-xs p-6 text-center"
          >
            {state === 'loading' && (
              <p className="text-sm font-semibold text-slate-500" role="status">
                {t(locale, 'billing.shop.loading')}
              </p>
            )}
            {state === 'failed' && (
              <>
                <p className="text-sm font-semibold text-slate-500 mb-3">{resolveLoadFailedText(locale, 'billing.shop.loadFailed')}</p>
                <button
                  type="button"
                  onClick={onRetry}
                  className="bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl cursor-pointer"
                >
                  {t(locale, 'billing.shop.retry')}
                </button>
              </>
            )}
            {state === 'ready' && (
              <>
                <p className="text-sm font-black text-[#0A1938] mb-1">{t(locale, 'billing.shop.empty')}</p>
                <p className="text-xs text-slate-500">{t(locale, 'billing.shop.emptyBody')}</p>
              </>
            )}
          </div>
        </main>
      )}

      {/* Sticky Floating Cart Bar */}
      {cart.length > 0 && (
        <div
          data-testid="shop-cart-bar"
          className="fixed bottom-[64px] w-full max-w-md px-4 z-30 transition-all duration-300"
        >
          <div className="bg-[#05163E] text-white rounded-2xl p-3 shadow-2xl flex items-center justify-between border border-blue-900/60 backdrop-blur-md">
            <div className="flex items-center gap-3 ps-1">
              <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-[#2563EB] text-white shadow-xs">
                <ShoppingBag className="w-5 h-5" aria-hidden="true" />
                <span className="absolute -top-1.5 -start-1.5 bg-[#DC2626] text-white text-[10px] font-black rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center border border-white leading-none">
                  {cartTotalQty}
                </span>
              </div>
              <div className="text-start">
                <div className="text-xs text-slate-300 font-medium">
                  {cartTotalQty === 1 ? t(locale, 'billing.shop.cartBarOneItem') : fill(t(locale, 'billing.shop.cartBarItems'), { count: cartTotalQty })}
                </div>
                <div className="text-base font-black tracking-tight text-white">
                  {money(cartTotalAgorot)}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="bg-[#2563EB] hover:bg-blue-600 active:scale-95 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>{t(locale, 'billing.shop.cartOpen')}</span>
              <span aria-hidden="true" className="text-sm">
                ⬅
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODALS                                                                 */}
      {/* ===================================================================== */}

      {/* Product Customiser Sheet */}
      {selectedProduct && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex flex-col justify-end p-0"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedProduct(null)
          }}
        >
          <div
            ref={customiserDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shop-customiser-title"
            tabIndex={-1}
            data-testid="shop-customiser"
            className="bg-[#FAF8FF] w-full max-w-md mx-auto rounded-t-3xl shadow-2xl flex flex-col max-h-[92vh] border-t border-blue-100 overflow-hidden text-start"
          >
            {/* Sheet Header */}
            <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-slate-200 bg-white">
              <h2 id="shop-customiser-title" className="text-base font-black text-[#0A1938]">
                {t(locale, 'billing.shop.customiseTitle')}
              </h2>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                aria-label={t(locale, 'billing.shop.close')}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-5 overflow-y-auto space-y-4 no-scrollbar flex-1">
              {/* Item Info Box */}
              <div className="flex gap-3.5 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                {selectedProduct.imageUrl ? (
                  <img
                    src={selectedProduct.imageUrl}
                    alt=""
                    className="w-20 h-20 rounded-xl border border-slate-100 shrink-0 bg-slate-50 object-cover"
                  />
                ) : (
                  <div
                    role="img"
                    aria-label={t(locale, 'billing.shop.noPhoto')}
                    className="w-20 h-20 rounded-xl border border-slate-100 shrink-0 bg-slate-50 flex items-center justify-center"
                  >
                    <ShoppingBag className="w-8 h-8 text-slate-300" aria-hidden="true" />
                  </div>
                )}
                <div className="flex flex-col justify-between py-0.5">
                  <div>
                    <h3 className="font-black text-base text-[#0A1938] leading-snug">
                      {selectedProduct.name}
                    </h3>
                    {selectedProduct.description !== null && (
                      <p className="text-xs text-slate-500 mt-1">{selectedProduct.description}</p>
                    )}
                  </div>
                  <div className="text-base font-black text-[#2563EB]">
                    {money(selectedProduct.priceAgorot)}
                  </div>
                </div>
              </div>

              {/* Size Options -- only when the item HAS sizes; a חגורה has none. */}
              {selectedProduct.sizes.length > 0 && (
                <fieldset className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                  <legend className="block text-xs font-bold text-[#0A1938] mb-2 w-full text-start">
                    {t(locale, 'billing.shop.sizeLegend')}
                  </legend>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedProduct.sizes.map((size) => {
                      const isChosen = modalSize === size
                      return (
                        <label
                          key={size}
                          className={`p-2 rounded-xl text-xs transition-all text-center border cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#2563EB] ${
                            isChosen
                              ? 'border-[#2563EB] bg-[#EEF2FF] text-[#2563EB] font-bold shadow-xs'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 font-medium'
                          }`}
                        >
                          <input
                            type="radio"
                            name="shop-size"
                            value={size}
                            checked={isChosen}
                            onChange={() => setModalSize(size)}
                            className="sr-only"
                            data-testid={`shop-size-${size}`}
                          />
                          {size}
                        </label>
                      )
                    })}
                  </div>
                  {modalSize === null && (
                    <p id="shop-size-hint" className="text-[11px] text-slate-500 mt-2">
                      {t(locale, 'billing.shop.sizeRequired')}
                    </p>
                  )}
                </fieldset>
              )}

              {/* Quantity */}
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-3">
                <label htmlFor="shop-quantity" className="text-xs font-bold text-[#0A1938]">
                  {t(locale, 'billing.shop.quantityLabel')}
                </label>
                <select
                  id="shop-quantity"
                  value={modalQty}
                  onChange={(event) => setModalQty(Number(event.target.value))}
                  className="rounded-lg border border-slate-200 bg-[#F0F4FE] text-sm font-bold text-[#0A1938] px-3 py-1.5"
                >
                  {QUANTITY_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              {/* Note */}
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                <label htmlFor="shop-note" className="block text-xs font-bold text-[#0A1938] mb-2">
                  {t(locale, 'billing.shop.noteLabel')}
                </label>
                <textarea
                  id="shop-note"
                  value={modalNote}
                  onChange={(event) => setModalNote(event.target.value)}
                  placeholder={t(locale, 'billing.shop.notePlaceholder')}
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 text-sm p-2.5 text-slate-700 placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none resize-none"
                />
              </div>
            </div>

            {/* Footer CTA */}
            <div className="p-4 bg-white border-t border-slate-200">
              <button
                type="button"
                data-testid="shop-add"
                onClick={handleAddToCart}
                disabled={sizeMissing}
                aria-describedby={sizeMissing ? 'shop-size-hint' : undefined}
                className="w-full bg-[#2563EB] hover:bg-blue-700 active:scale-[0.99] text-white font-bold py-3.5 px-4 rounded-xl shadow-md transition flex items-center justify-between text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{t(locale, 'billing.shop.addToCart')}</span>
                <span className="font-black text-base">
                  {money(selectedProduct.priceAgorot * modalQty)}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cart Sheet */}
      {isCartOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex flex-col justify-end p-0"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsCartOpen(false)
          }}
        >
          <div
            ref={cartDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shop-cart-title"
            tabIndex={-1}
            data-testid="shop-cart"
            className="bg-[#FAF8FF] w-full max-w-md mx-auto rounded-t-3xl shadow-2xl flex flex-col max-h-[90vh] border-t border-blue-100 overflow-hidden text-start"
          >
            {/* Header */}
            <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-slate-200 bg-white">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[#EEF2FF] flex items-center justify-center text-[#2563EB]">
                  <ShoppingBag className="w-4 h-4" aria-hidden="true" />
                </div>
                <h2 id="shop-cart-title" className="text-base font-black text-[#0A1938]">
                  {t(locale, 'billing.shop.cartTitle')}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                aria-label={t(locale, 'billing.shop.close')}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto space-y-4 no-scrollbar flex-1">
              {checkout.kind === 'placed' ? (
                <div data-testid="shop-placed" className="text-center">
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3.5 shadow-inner border border-emerald-100 animate-bounce">
                    <CheckCircle2 className="w-9 h-9" aria-hidden="true" />
                  </div>
                  <h3 className="text-xl font-black text-[#0A1938] mb-1">{t(locale, 'billing.shop.placedTitle')}</h3>
                  <p className="text-xs text-slate-500 mb-4">
                    {fill(t(locale, 'billing.shop.placedBody'), {
                      count: checkout.lines,
                      total: money(checkout.totalAgorot),
                    })}
                  </p>
                  <a href="#/payments" className="block text-center text-sm font-bold text-[#2563EB] mb-3">
                    {t(locale, 'billing.shop.placedPay')}
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      onCheckoutClose()
                      setIsCartOpen(false)
                    }}
                    className="w-full bg-[#05163E] hover:bg-[#0A1938] text-white font-bold py-3.5 rounded-xl text-xs transition shadow-md active:scale-95 cursor-pointer"
                  >
                    {t(locale, 'billing.shop.placedClose')}
                  </button>
                </div>
              ) : cart.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">{t(locale, 'billing.shop.cartEmpty')}</p>
              ) : (
                <>
                  <div className="space-y-2.5">
                    {cart.map((line, index) => (
                      <div
                        key={`${line.productId}-${line.size ?? 'none'}-${index}`}
                        data-testid={`shop-line-${index}`}
                        className="flex items-center justify-between p-2.5 bg-white rounded-2xl border border-slate-100 shadow-xs gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div
                            role="img"
                            aria-label={t(locale, 'billing.shop.noPhoto')}
                            className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 shrink-0 flex items-center justify-center"
                          >
                            <ShoppingBag className="w-5 h-5 text-slate-300" aria-hidden="true" />
                          </div>
                          <div className="truncate">
                            <div className="font-black text-xs text-[#0A1938] truncate">
                              {line.name}
                            </div>
                            {(line.size || line.note) && (
                              <div className="text-[11px] text-[#2563EB] font-semibold truncate">
                                {[line.size, line.note].filter(Boolean).join(' • ')}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <label htmlFor={`shop-line-qty-${index}`} className="sr-only">
                            {t(locale, 'billing.shop.cartQuantity')}
                          </label>
                          <select
                            id={`shop-line-qty-${index}`}
                            value={line.quantity}
                            onChange={(event) => onSetQuantity(index, Number(event.target.value))}
                            className="rounded-lg border border-blue-100 bg-[#F0F4FE] text-xs font-black text-[#0A1938] px-1.5 py-1"
                          >
                            {QUANTITY_OPTIONS.map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                          <span className="font-black text-xs text-[#0A1938] min-w-[40px] text-end">
                            {money(line.priceAgorot * line.quantity)}
                          </span>
                          <button
                            type="button"
                            data-testid={`shop-remove-${index}`}
                            onClick={() => onRemoveLine(index)}
                            aria-label={t(locale, 'billing.shop.cartRemove')}
                            className="text-slate-400 hover:text-red-500 p-1 text-xs cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-[#EEF2FE] rounded-2xl p-3.5 border border-blue-100 flex justify-between items-center text-sm font-black text-[#0A1938]">
                    <span>{t(locale, 'billing.shop.cartTotal')}</span>
                    <span className="text-lg text-[#2563EB]">{money(cartTotalAgorot)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Footer Button */}
            {checkout.kind !== 'placed' && cart.length > 0 && (
              <div className="p-4 bg-white border-t border-slate-200">
                <button
                  type="button"
                  data-testid="shop-checkout"
                  onClick={onCheckout}
                  disabled={checkout.kind === 'sending'}
                  className="w-full bg-[#2563EB] hover:bg-blue-700 active:scale-[0.99] text-white font-bold py-3.5 px-4 rounded-xl shadow-md transition flex items-center justify-center gap-2 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>{checkout.kind === 'sending' ? t(locale, 'billing.shop.checkoutSending') : t(locale, 'billing.shop.checkout')}</span>
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                {checkout.kind === 'failed' && (
                  <p role="alert" className="text-[11px] text-red-600 font-semibold text-center mt-2">
                    {t(locale, 'billing.shop.checkoutFailed')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
