import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  PAYMENT_OVERLAY_FRAME_NAME,
  PAYMENT_OVERLAY_MESSAGE_TYPE,
  PaymentOverlay,
} from './PaymentOverlay'
import { SETTLED_CLOSE_MS } from './PaymentSettled'

describe('PaymentOverlay', () => {
  it('renders an iframe pointed at the given url, and calls onComplete on a matching postMessage', () => {
    const onComplete = vi.fn()
    render(
      <PaymentOverlay
        locale="he"
        request={{ kind: 'link', url: 'https://app.upay.co.il/mandate/abc' }}
        onComplete={onComplete}
        onClose={vi.fn()}
        orderStatus={vi.fn()}
      />,
    )
    const iframe = screen.getByTitle(/./) as HTMLIFrameElement
    expect(iframe.tagName).toBe('IFRAME')
    expect(iframe.name).toBe(PAYMENT_OVERLAY_FRAME_NAME)
    expect(iframe.src).toBe('https://app.upay.co.il/mandate/abc')

    fireEvent(
      window,
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: PAYMENT_OVERLAY_MESSAGE_TYPE, ref: 'ref-123' },
      }),
    )
    expect(onComplete).toHaveBeenCalledWith('ref-123')
  })

  it('ignores a message from a different origin', () => {
    const onComplete = vi.fn()
    render(
      <PaymentOverlay
        locale="he"
        request={{ kind: 'link', url: 'https://app.upay.co.il/mandate/abc' }}
        onComplete={onComplete}
        onClose={vi.fn()}
        orderStatus={vi.fn()}
      />,
    )
    fireEvent(
      window,
      new MessageEvent('message', {
        origin: 'https://evil.example',
        data: { type: PAYMENT_OVERLAY_MESSAGE_TYPE, ref: 'ref-123' },
      }),
    )
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('ignores a same-origin message of a different shape', () => {
    const onComplete = vi.fn()
    render(
      <PaymentOverlay
        locale="he"
        request={{ kind: 'link', url: 'https://app.upay.co.il/mandate/abc' }}
        onComplete={onComplete}
        onClose={vi.fn()}
        orderStatus={vi.fn()}
      />,
    )
    fireEvent(
      window,
      new MessageEvent('message', {
        origin: window.location.origin,
        data: { type: 'something-else' },
      }),
    )
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('close button calls onClose, not onComplete', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onComplete = vi.fn()
    render(
      <PaymentOverlay
        locale="he"
        request={{ kind: 'link', url: 'https://app.upay.co.il/mandate/abc' }}
        onComplete={onComplete}
        onClose={onClose}
        orderStatus={vi.fn()}
      />,
    )
    await user.click(screen.getByTestId('payment-overlay-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onComplete).not.toHaveBeenCalled()
  })
})

describe('PaymentOverlay, when uPay never comes back to our origin', () => {
  const checkout = {
    kind: 'checkout' as const,
    form: { action: 'https://app.upay.co.il/x', fields: {} },
    publicRef: 'ref-9',
  }

  it('shows the outcome from the order row when no postMessage ever arrives', async () => {
    // The bit route (2026-09-11, the first live payment). uPay ends the journey on
    // `app.upay.co.il/API6/bit/return.php`, our return page never loads, no message is
    // ever posted, and before this the overlay sat on a white frame forever.
    const onComplete = vi.fn()
    const orderStatus = vi.fn().mockResolvedValue({ status: 'paid', expected_amount_agorot: 100 })
    render(
      <PaymentOverlay
        locale="he"
        request={checkout}
        onComplete={onComplete}
        onClose={vi.fn()}
        orderStatus={orderStatus}
      />,
    )

    // The iframe is REPLACED by the outcome, and the overlay's own chrome goes with it:
    // a success is a full-bleed branded moment, not a framed page with an X on it.
    const settled = await screen.findByTestId('payment-settled')
    expect(settled).toHaveAttribute('data-status', 'paid')
    expect(screen.queryByTitle(/./)).toBeNull()
    expect(screen.queryByTestId('payment-overlay-close')).toBeNull()
    expect(orderStatus).toHaveBeenCalledWith('ref-9')
  })

  it('plays for a couple of seconds and then leaves, with nobody pressing anything', async () => {
    const onComplete = vi.fn()
    render(
      <PaymentOverlay
        locale="he"
        request={checkout}
        onComplete={onComplete}
        onClose={vi.fn()}
        orderStatus={vi.fn().mockResolvedValue({ status: 'paid', expected_amount_agorot: 100 })}
      />,
    )

    await screen.findByTestId('payment-settled')
    expect(onComplete).not.toHaveBeenCalled()
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('ref-9'), {
      timeout: SETTLED_CLOSE_MS * 3,
    })
  })

  it('an amount mismatch is told, held, and never reported as a completed payment', async () => {
    // §5.10: real money arrived at the wrong amount, a manager is alerted and the charges
    // are NOT settled. Reporting completion here would advance the join wizard to "done"
    // and tell a family they are square when they are not.
    const onComplete = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <PaymentOverlay
        locale="he"
        request={checkout}
        onComplete={onComplete}
        onClose={onClose}
        orderStatus={vi.fn().mockResolvedValue({ status: 'amount_mismatch', expected_amount_agorot: 100 })}
      />,
    )

    const settled = await screen.findByTestId('payment-settled')
    expect(settled).toHaveAttribute('data-status', 'amount_mismatch')

    // It waits. A success closes itself; this one has to be read.
    await new Promise((resolve) => setTimeout(resolve, SETTLED_CLOSE_MS + 50))
    expect(onClose).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('payment-settled-dismiss'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('does not poll a mandate link, which has no order behind it', async () => {
    const orderStatus = vi.fn()
    render(
      <PaymentOverlay
        locale="he"
        request={{ kind: 'link', url: 'https://app.upay.co.il/mandate/abc' }}
        onComplete={vi.fn()}
        onClose={vi.fn()}
        orderStatus={orderStatus}
      />,
    )

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(orderStatus).not.toHaveBeenCalled()
  })
})
