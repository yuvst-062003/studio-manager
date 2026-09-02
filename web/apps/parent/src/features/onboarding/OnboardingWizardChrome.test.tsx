import { describe, expect, it } from 'vitest'
import { ONBOARDING_WIZARD_STEPS, ONBOARDING_WIZARD_TOTAL, stepPosition } from './OnboardingWizardChrome'

describe('OnboardingWizardChrome step list', () => {
  it('has exactly 4 steps: welcome, family, health, payment', () => {
    expect(ONBOARDING_WIZARD_STEPS.map((step) => step.key)).toEqual([
      'welcome',
      'family',
      'health',
      'payment',
    ])
    expect(ONBOARDING_WIZARD_TOTAL).toBe(4)
  })

  it('positions each step 1-indexed in order', () => {
    expect(stepPosition('welcome')).toBe(1)
    expect(stepPosition('family')).toBe(2)
    expect(stepPosition('health')).toBe(3)
    expect(stepPosition('payment')).toBe(4)
  })
})
