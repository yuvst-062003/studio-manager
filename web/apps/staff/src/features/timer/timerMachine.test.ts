import { describe, expect, it } from 'vitest'
import { advancePhase, initialPhaseState, phaseDurationSeconds, totalRemainingSeconds } from './timerMachine'
import type { TimerSettings } from './types'

const TABATA: TimerSettings = {
  prepTime: 10,
  workTime: 20,
  restTime: 10,
  rounds: 8,
  sets: 1,
  breakBetweenSets: 60,
}

describe('initialPhaseState', () => {
  it('starts at prep when prepTime is positive', () => {
    expect(initialPhaseState(TABATA)).toEqual({ phase: 'prep', round: 1, set: 1 })
  })

  it('skips straight to work when prepTime is zero', () => {
    expect(initialPhaseState({ ...TABATA, prepTime: 0 })).toEqual({
      phase: 'work',
      round: 1,
      set: 1,
    })
  })
})

describe('advancePhase — the full cycle, including the set break', () => {
  it('walks prep -> work -> rest -> work -> ... -> setRest -> work -> ... -> finished', () => {
    // 2 rounds, 2 sets — small enough to write out by hand, large enough to exercise
    // every transition kind exactly once: a mid-set round rollover (rest), the set
    // break itself (setRest), and the round reset that follows it.
    const settings: TimerSettings = { ...TABATA, rounds: 2, sets: 2 }
    const steps: { phase: string; round: number; set: number }[] = []
    let state = initialPhaseState(settings)
    steps.push(state)
    // prep -> work(1,1) -> rest(1,1) -> work(2,1) -> setRest(2,1) -> work(1,2) ->
    // rest(1,2) -> work(2,2) -> finished
    for (let i = 0; i < 8; i += 1) {
      state = advancePhase(state, settings)
      steps.push(state)
    }

    expect(steps).toEqual([
      { phase: 'prep', round: 1, set: 1 },
      { phase: 'work', round: 1, set: 1 },
      { phase: 'rest', round: 1, set: 1 },
      { phase: 'work', round: 2, set: 1 },
      { phase: 'setRest', round: 2, set: 1 },
      { phase: 'work', round: 1, set: 2 },
      { phase: 'rest', round: 1, set: 2 },
      { phase: 'work', round: 2, set: 2 },
      { phase: 'finished', round: 2, set: 2 },
    ])
  })

  it('goes straight from the last work round to finished when there is only one set', () => {
    const settings: TimerSettings = { ...TABATA, rounds: 2, sets: 1 }
    let state = initialPhaseState(settings)
    state = advancePhase(state, settings) // work(1,1)
    state = advancePhase(state, settings) // rest(1,1)
    state = advancePhase(state, settings) // work(2,1)
    state = advancePhase(state, settings) // last round, one set -> finished directly
    expect(state).toEqual({ phase: 'finished', round: 2, set: 1 })
  })

  it('is absorbing at finished — advancing again changes nothing', () => {
    const settings = TABATA
    const finished = { phase: 'finished' as const, round: 8, set: 1 }
    expect(advancePhase(finished, settings)).toEqual(finished)
  })

  it('skips prep entirely when prepTime is zero, starting straight at work', () => {
    const settings: TimerSettings = { ...TABATA, prepTime: 0 }
    expect(initialPhaseState(settings)).toEqual({ phase: 'work', round: 1, set: 1 })
  })
})

describe('phaseDurationSeconds', () => {
  it.each([
    ['prep', TABATA.prepTime],
    ['work', TABATA.workTime],
    ['rest', TABATA.restTime],
    ['setRest', TABATA.breakBetweenSets],
    ['finished', 0],
  ] as const)('%s -> %d seconds', (phase, seconds) => {
    expect(phaseDurationSeconds(phase, TABATA)).toBe(seconds)
  })
})

describe('totalRemainingSeconds', () => {
  // Ported verbatim from the prototype's own `calculateTotalRemaining` — including its
  // approximations. It is a header/hero-card ESTIMATE, not the phase countdown (which is
  // exact), and the prototype's own formula both adds a "next round" bonus during prep
  // AND counts the upcoming round via `remainingRoundsInSet`, and charges a
  // `breakBetweenSets` for a remaining set even when that set is the last one and has no
  // break after it. These tests pin the formula's actual output, not a corrected one —
  // faithfully porting the number a coach already sees in the source app.
  it('at the very start of prep, double-counts round 1 the way the prototype does', () => {
    const settings: TimerSettings = { ...TABATA, rounds: 2, sets: 1, prepTime: 10 }
    const state = { phase: 'prep' as const, round: 1, set: 1 }
    // secondsLeft(10) + prep's own "next round" bonus (work 20 + rest 10, since
    // rounds > 1) + remainingRoundsInSet(2-1=1) * (work 20 + rest 10) = 10+30+30 = 70.
    expect(totalRemainingSeconds(state, settings.prepTime, settings)).toBe(70)
  })

  it('counts down exactly on the last round of a single-set workout', () => {
    const settings: TimerSettings = { ...TABATA, rounds: 2, sets: 1 }
    // Sitting at the start of round 2's work phase, the last round of the last set:
    // no rest bonus (round === rounds), no rounds or sets left to add. Just the 20s left.
    const state = { phase: 'work' as const, round: 2, set: 1 }
    expect(totalRemainingSeconds(state, settings.workTime, settings)).toBe(20)
  })

  it('charges a full remaining set plus a break, even for the final set', () => {
    const settings: TimerSettings = { ...TABATA, rounds: 2, sets: 2, breakBetweenSets: 60 }
    // At the set break itself, with the whole second (and final) set still to come.
    const state = { phase: 'setRest' as const, round: 2, set: 1 }
    const fullSetDuration = settings.rounds * settings.workTime + (settings.rounds - 1) * settings.restTime // 50
    // secondsLeft(60) + remainingSets(1) * (fullSetDuration(50) + breakBetweenSets(60))
    expect(totalRemainingSeconds(state, settings.breakBetweenSets, settings)).toBe(
      settings.breakBetweenSets + fullSetDuration + settings.breakBetweenSets,
    )
  })

  it('never goes negative', () => {
    const state = { phase: 'finished' as const, round: 8, set: 1 }
    expect(totalRemainingSeconds(state, 0, TABATA)).toBe(0)
  })
})
