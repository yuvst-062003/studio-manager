import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  PAYMENT_OVERLAY_FRAME_NAME,
  PAYMENT_OVERLAY_MESSAGE_TYPE,
  PaymentOverlay,
} from './PaymentOverlay'

describe('PaymentOverlay', () => {
  it('renders an iframe pointed at the given url, and calls onComplete on a matching postMessage', () => {
    const onComplete = vi.fn()
    render(
      <PaymentOverlay
        locale="he"
        request={{ kind: 'link', url: 'https://app.upay.co.il/mandate/abc' }}
        onComplete={onComplete}
        onClose={vi.fn()}
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
      />,
    )
    await user.click(screen.getByTestId('payment-overlay-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onComplete).not.toHaveBeenCalled()
  })
})
