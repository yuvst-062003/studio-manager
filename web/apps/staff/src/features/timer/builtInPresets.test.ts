import { describe, expect, it } from 'vitest'
import { BUILT_IN_TIMER_PRESETS } from './builtInPresets'

/**
 * The six numbers per preset are domain content — "the part of this screen that took a
 * judo coach to write rather than a designer" (§4.5) — copied from the prototype's
 * `builtInTemplates`. Pinned here as data, independent of any screen or engine test, so a
 * future edit that "simplifies" one of these six-tuples is caught at the source.
 */
describe('the six built-in presets carry the prototype\'s exact numbers', () => {
  it.each([
    ['tabata', { prepTime: 10, workTime: 20, restTime: 10, rounds: 8, sets: 1, breakBetweenSets: 60 }],
    ['randori', { prepTime: 15, workTime: 240, restTime: 60, rounds: 5, sets: 1, breakBetweenSets: 120 }],
    ['warmup', { prepTime: 10, workTime: 45, restTime: 15, rounds: 8, sets: 1, breakBetweenSets: 60 }],
    [
      'randori_session',
      { prepTime: 15, workTime: 180, restTime: 45, rounds: 6, sets: 2, breakBetweenSets: 90 },
    ],
    ['hiit', { prepTime: 10, workTime: 45, restTime: 15, rounds: 6, sets: 2, breakBetweenSets: 90 }],
    ['uchikomi', { prepTime: 10, workTime: 30, restTime: 30, rounds: 10, sets: 1, breakBetweenSets: 60 }],
  ] as const)('%s', (id, expected) => {
    const preset = BUILT_IN_TIMER_PRESETS.find((candidate) => candidate.id === id)
    expect(preset).toBeDefined()
    expect(preset).toMatchObject(expected)
  })

  it('has exactly six presets, one distinct name key each', () => {
    expect(BUILT_IN_TIMER_PRESETS).toHaveLength(6)
    const nameKeys = new Set(BUILT_IN_TIMER_PRESETS.map((preset) => preset.nameKey))
    expect(nameKeys.size).toBe(6)
  })
})
