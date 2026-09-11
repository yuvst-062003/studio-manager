import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTLE_POLL_CEILING_MS, SETTLE_POLL_MS, useSettledOrder } from './useSettledOrder'
import type { PaymentOrderOut } from './billingClient'

const order = (status: string) => ({ status }) as PaymentOrderOut

/** One poll plus the microtask its promise resolves in. */
async function tick(times = 1) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      vi.advanceTimersByTime(SETTLE_POLL_MS)
      await Promise.resolve()
    })
  }
}

describe('useSettledOrder', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('asks once on mount, before any interval has elapsed', async () => {
    // A reopened checkout may already be paid. Waiting a full interval to notice would
    // put the family back in front of uPay for money that has already been taken.
    const onSettled = vi.fn()
    const orderStatus = vi
      .fn<(ref: string) => Promise<PaymentOrderOut>>()
      .mockResolvedValue(order('paid'))
    renderHook(() => useSettledOrder({ publicRef: 'ref-1', orderStatus, onSettled }))

    await act(async () => {
      await Promise.resolve()
    })
    expect(onSettled).toHaveBeenCalledWith('ref-1', order('paid'))
  })

  it('reports the ref once the order stops being pending', async () => {
    const onSettled = vi.fn()
    const orderStatus = vi
      .fn<(ref: string) => Promise<PaymentOrderOut>>()
      .mockResolvedValueOnce(order('pending'))
      .mockResolvedValueOnce(order('paid'))
    renderHook(() => useSettledOrder({ publicRef: 'ref-1', orderStatus, onSettled }))

    await act(async () => {
      await Promise.resolve()
    })
    expect(onSettled).not.toHaveBeenCalled()

    await tick()
    expect(onSettled).toHaveBeenCalledWith('ref-1', order('paid'))
  })

  it('stops polling once it has reported, so a settled order is reported once', async () => {
    const onSettled = vi.fn()
    const orderStatus = vi
      .fn<(ref: string) => Promise<PaymentOrderOut>>()
      .mockResolvedValue(order('paid'))
    renderHook(() => useSettledOrder({ publicRef: 'ref-1', orderStatus, onSettled }))

    // The mount poll's answer is let through BEFORE any interval elapses, which is the
    // real sequence: the response arrives inside the three seconds, not after them.
    await act(async () => {
      await Promise.resolve()
    })
    await tick(4)
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(orderStatus).toHaveBeenCalledTimes(1)  // the mount poll, and no more
  })

  it('reports a resolution that is not success, because the frame is done either way', async () => {
    // `amount_mismatch` means real money arrived at the wrong amount and a human must
    // look. The parent must not be left watching a blank frame while that happens.
    const onSettled = vi.fn()
    const orderStatus = vi
      .fn<(ref: string) => Promise<PaymentOrderOut>>()
      .mockResolvedValue(order('amount_mismatch'))
    renderHook(() => useSettledOrder({ publicRef: 'ref-1', orderStatus, onSettled }))

    await act(async () => {
      await Promise.resolve()
    })
    expect(onSettled).toHaveBeenCalledWith('ref-1', order('amount_mismatch'))
  })

  it('survives a failed poll — a dropped request is not a failed payment', async () => {
    const onSettled = vi.fn()
    const orderStatus = vi
      .fn<(ref: string) => Promise<PaymentOrderOut>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(order('paid'))
    renderHook(() => useSettledOrder({ publicRef: 'ref-1', orderStatus, onSettled }))

    await tick(1)
    expect(onSettled).toHaveBeenCalledWith('ref-1', order('paid'))
  })

  it('does not restart its interval when the callback identity changes', async () => {
    // Every caller passes an inline arrow. If the effect depended on it, each render
    // would clear the pending interval and the poll would never fire at all.
    const onSettled = vi.fn()
    const orderStatus = vi
      .fn<(ref: string) => Promise<PaymentOrderOut>>()
      .mockResolvedValue(order('pending'))
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) =>
        useSettledOrder({ publicRef: 'ref-1', orderStatus, onSettled: cb }),
      { initialProps: { cb: onSettled } },
    )

    await act(async () => {
      vi.advanceTimersByTime(SETTLE_POLL_MS / 2)
    })
    rerender({ cb: vi.fn() })
    await act(async () => {
      vi.advanceTimersByTime(SETTLE_POLL_MS / 2 + 1)
      await Promise.resolve()
    })
    // The mount poll plus exactly one interval poll. A restart would have re-mounted the
    // effect and asked a third time.
    expect(orderStatus).toHaveBeenCalledTimes(2)
  })

  it('gives up after the ceiling, so an abandoned tab does not poll forever', async () => {
    const onSettled = vi.fn()
    const orderStatus = vi
      .fn<(ref: string) => Promise<PaymentOrderOut>>()
      .mockResolvedValue(order('pending'))
    renderHook(() => useSettledOrder({ publicRef: 'ref-1', orderStatus, onSettled }))

    await act(async () => {
      vi.advanceTimersByTime(SETTLE_POLL_CEILING_MS + SETTLE_POLL_MS)
      await Promise.resolve()
    })
    const afterCeiling = orderStatus.mock.calls.length
    await tick(3)
    expect(orderStatus).toHaveBeenCalledTimes(afterCeiling)
    expect(onSettled).not.toHaveBeenCalled()
  })

  it('keeps waiting on an answer it does not recognise, instead of closing the window', async () => {
    // A negative test (`!== 'pending'`) would treat an error body, a renamed field or a
    // cached 200 as a finished payment and shut the card page the instant it opened.
    const onSettled = vi.fn()
    const orderStatus = vi
      .fn<(ref: string) => Promise<PaymentOrderOut>>()
      .mockResolvedValue({} as PaymentOrderOut)
    renderHook(() => useSettledOrder({ publicRef: 'ref-1', orderStatus, onSettled }))

    await act(async () => {
      await Promise.resolve()
    })
    await tick(2)
    expect(orderStatus).toHaveBeenCalled()
    expect(onSettled).not.toHaveBeenCalled()
  })

  it('polls nothing when there is no order to poll', async () => {
    const orderStatus = vi.fn<(ref: string) => Promise<PaymentOrderOut>>()
    renderHook(() =>
      useSettledOrder({ publicRef: null, orderStatus, onSettled: vi.fn() }),
    )

    await tick(3)
    expect(orderStatus).not.toHaveBeenCalled()
  })
})
