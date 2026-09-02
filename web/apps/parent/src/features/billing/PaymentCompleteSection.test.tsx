import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PAYMENT_OVERLAY_MESSAGE_TYPE } from './PaymentOverlay'
import { PaymentCompleteSection } from './PaymentCompleteSection'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PaymentCompleteSection, embedded in the payment overlay', () => {
  it('posts the completion message to the parent frame once, when embedded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 'paid' }), { status: 200 })),
    )
    const postMessage = vi.fn()
    const originalTop = window.top
    Object.defineProperty(window, 'top', { value: { postMessage }, configurable: true })

    render(<PaymentCompleteSection locale="he" publicRef="ref-123" />)

    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        { type: PAYMENT_OVERLAY_MESSAGE_TYPE, ref: 'ref-123' },
        window.location.origin,
      ),
    )
    expect(postMessage).toHaveBeenCalledTimes(1)

    Object.defineProperty(window, 'top', { value: originalTop, configurable: true })
  })

  it('renders the normal completion screen, unchanged, when not embedded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ status: 'paid' }), { status: 200 })),
    )
    render(<PaymentCompleteSection locale="he" publicRef="ref-123" />)
    expect(await screen.findByTestId('order-paid')).toBeInTheDocument()
  })
})
