import { describe, expect, it } from 'vitest'
import { DOOR_STEPS, startingStep, type OnboardingStatus } from './doorSteps'

function status(overrides: Partial<Record<'agreements' | 'students' | 'health' | 'payment', boolean>>): OnboardingStatus {
  const keys = ['agreements', 'students', 'health', 'payment'] as const
  return {
    steps: keys.map((key) => ({ key, complete: overrides[key] ?? false })),
    next: null,
  }
}

describe('DOOR_STEPS', () => {
  it('Doors C and D share the full 4-step list -- "Door C is Door B with one row pre-filled"', () => {
    expect(DOOR_STEPS.invite).toEqual(['welcome', 'family', 'health', 'payment'])
    expect(DOOR_STEPS.addChild).toEqual(['welcome', 'family', 'health', 'payment'])
    expect(DOOR_STEPS.join).toEqual(['welcome', 'family', 'health', 'payment'])
  })
})

describe('startingStep', () => {
  it('opens at welcome with no status at all (still loading, or a first-time family)', () => {
    expect(startingStep('addChild', null)).toBe('welcome')
  })

  it('opens at welcome when agreements are not yet current', () => {
    expect(startingStep('addChild', status({ agreements: false }))).toBe('welcome')
    expect(startingStep('invite', status({ agreements: false }))).toBe('welcome')
  })

  it('Door D skips straight to the students step when agreements are already current', () => {
    expect(startingStep('addChild', status({ agreements: true }))).toBe('family')
  })

  it('Door C skips agreements the same way once the manager-invited parent has agreed', () => {
    expect(startingStep('invite', status({ agreements: true }))).toBe('family')
  })

  it('never skips past students -- that is the reason these doors exist, not a step to test for completeness', () => {
    // Even a status claiming EVERY flag complete must still land on 'family', never
    // jump straight to 'health' or 'payment' -- decision 6's health/payment are scoped
    // to students this run creates, which a family-wide flag cannot pre-answer.
    expect(
      startingStep('addChild', status({ agreements: true, students: true, health: true, payment: true })),
    ).toBe('family')
  })
})
