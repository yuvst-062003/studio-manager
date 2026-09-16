import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PaymentSettled, SETTLED_ENTER_MS } from './PaymentSettled'
import { SCENE_TOTAL_MS } from './PayingScene'
import type { PaymentOrderOut } from './billingClient'

const order = (status: PaymentOrderOut['status']): PaymentOrderOut => ({
  id: 'order-1',
  public_ref: 'ref-1',
  payer_person_id: 'person-1',
  status,
  expected_amount_agorot: 34_900,
  max_payments: 1,
  prepay_months: 0,
  paid_at: status === 'paid' ? '2026-09-17T00:00:00Z' : null,
  expires_at: '2026-09-18T00:00:00Z',
})

describe('PaymentSettled', () => {
  it('a paid order plays the tap-to-pay scene, and the scene ends on a check', () => {
    render(<PaymentSettled locale="he" order={order('paid')} onDismiss={vi.fn()} />)
    const scene = screen.getByTestId('paying-scene')
    expect(scene.querySelector('[data-testid="paying-terminal"]')).not.toBeNull()
    expect(scene.querySelector('[data-testid="paying-card"]')).not.toBeNull()
    expect(scene.querySelector('[data-testid="paying-check"]')).not.toBeNull()
  })

  it('a declined order shows no scene — it has to be read, not watched', () => {
    render(<PaymentSettled locale="he" order={order('failed')} onDismiss={vi.fn()} />)
    expect(screen.queryByTestId('paying-scene')).toBeNull()
    expect(screen.getByTestId('settled-failed')).toBeTruthy()
  })

  it('the words wait for the scene: the entry is at least as long as the three beats', () => {
    expect(SETTLED_ENTER_MS).toBeGreaterThanOrEqual(SCENE_TOTAL_MS)
  })
})
