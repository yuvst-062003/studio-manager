// The phase machine, factored out of `useTimerEngine` so it can be tested with no timers,
// no React and no clock — a pure function of "where we are" and "what the preset says" to
// "where we go next". Ported from `handleNextPhase` in
// `~/Downloads/staff-app/src/components/TimerView.tsx`, transition for transition.
import type { TimerPhase, TimerSettings } from './types'

export type PhaseState = {
  phase: TimerPhase
  round: number
  set: number
}

/** Where a workout starts. The prototype skips a zero-length prep straight to work
 *  (`applyTemplate`: `template.prepTime > 0 ? 'prep' : 'work'`), and `adjustParam('prep', …)`
 *  makes the same call when a coach dials prep down to zero while parked on it. */
export function initialPhaseState(settings: TimerSettings): PhaseState {
  return { phase: settings.prepTime > 0 ? 'prep' : 'work', round: 1, set: 1 }
}

/** Seconds the given phase runs for. `finished` has none — there is nothing left to
 *  count down. */
export function phaseDurationSeconds(phase: TimerPhase, settings: TimerSettings): number {
  switch (phase) {
    case 'prep':
      return settings.prepTime
    case 'work':
      return settings.workTime
    case 'rest':
      return settings.restTime
    case 'setRest':
      return settings.breakBetweenSets
    case 'finished':
      return 0
  }
}

/**
 * One step of the machine: prep -> work -> rest -> (repeat for `rounds`) -> setRest ->
 * (repeat for `sets`) -> finished. `finished` is absorbing — calling this again once the
 * workout is over returns the same state, matching the prototype's `handleNextPhase`,
 * which does nothing once `currentPhase === 'finished'`.
 *
 * Used both for the automatic transition when a phase's clock runs out and for the
 * "skip to next" button — the prototype reuses `handleNextPhase` for exactly that reason,
 * and this port keeps the transition itself in one place for the same reason.
 */
export function advancePhase(state: PhaseState, settings: TimerSettings): PhaseState {
  const { phase, round, set } = state
  if (phase === 'prep') {
    return { phase: 'work', round, set }
  }
  if (phase === 'work') {
    if (round < settings.rounds) return { phase: 'rest', round, set }
    if (set < settings.sets) return { phase: 'setRest', round, set }
    return { phase: 'finished', round, set }
  }
  if (phase === 'rest') {
    return { phase: 'work', round: round + 1, set }
  }
  if (phase === 'setRest') {
    return { phase: 'work', round: 1, set: set + 1 }
  }
  return state
}

/**
 * "Total time remaining" for the whole workout, not just the current phase — the header's
 * and the hero card's own read-out. Ported from `calculateTotalRemaining`.
 */
export function totalRemainingSeconds(
  state: PhaseState,
  secondsLeft: number,
  settings: TimerSettings,
): number {
  let remaining = secondsLeft
  if (state.phase === 'prep') {
    remaining += settings.workTime + (settings.rounds > 1 ? settings.restTime : 0)
  } else if (state.phase === 'work') {
    remaining += state.round < settings.rounds ? settings.restTime : 0
  }

  const remainingRoundsInSet = settings.rounds - state.round
  remaining += remainingRoundsInSet * (settings.workTime + settings.restTime)

  const remainingSets = settings.sets - state.set
  const fullSetDuration =
    settings.rounds * settings.workTime + (settings.rounds - 1) * settings.restTime
  remaining += remainingSets * (fullSetDuration + settings.breakBetweenSets)

  return Math.max(0, remaining)
}
