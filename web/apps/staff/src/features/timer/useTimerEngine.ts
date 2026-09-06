// The runtime: owns the settings, the current phase/round/set, the countdown and the
// transport (start/pause/reset/skip). `timerMachine.ts` is the pure "what happens next";
// this is the part that touches the clock, `setInterval`, sound and the wake lock.
//
// **Drift.** The non-negotiable in §4.5/the port brief: "derive elapsed time from a
// timestamp, not by accumulating `setInterval` ticks." `deadlineRef` holds the epoch ms at
// which the current phase ends; every tick recomputes `secondsLeft` as
// `ceil((deadline - Date.now()) / 1000)`. A tick that fires late — a busy main thread, a
// throttled background timer — costs nothing: the next tick simply reads a larger elapsed
// time off the same fixed deadline. Contrast the prototype's own `setInterval` callback,
// which does `setSecondsLeft((prev) => prev - 1)` once per firing — a timer whose ticks
// come 1% slow loses 36 seconds over an hour and nothing here would ever notice.
//
// On a phase transition the new deadline is `oldDeadline + newPhaseDurationMs`, not
// `now() + newPhaseDurationMs` — so an overshoot on a late tick carries into the next
// phase's countdown instead of being silently donated to whichever phase happened to be
// running when the tick finally fired.
import { useCallback, useEffect, useRef, useState } from 'react'
import { BUILT_IN_TIMER_PRESETS } from './builtInPresets'
import {
  advancePhase,
  initialPhaseState,
  phaseDurationSeconds,
  totalRemainingSeconds as computeTotalRemainingSeconds,
} from './timerMachine'
import type { PhaseState } from './timerMachine'
import { useTimerSound } from './useTimerSound'
import { useWakeLock } from './useWakeLock'
import type { TimerPhase, TimerPreset, TimerSettings } from './types'

/** Five ticks a second. Fine enough that the digital MM:SS and the ring never visibly
 *  stutter; coarse enough not to matter for battery. Correctness does not depend on this
 *  number at all — see the module header — only smoothness does. */
const TICK_MS = 200

export type AdjustableSetting = 'work' | 'rest' | 'rounds' | 'sets' | 'prep' | 'setRest'

const DEFAULT_PRESET = BUILT_IN_TIMER_PRESETS[0]!

type RuntimeState = PhaseState & { secondsLeft: number }

function runtimeFor(phase: PhaseState, settings: TimerSettings): RuntimeState {
  return { ...phase, secondsLeft: phaseDurationSeconds(phase.phase, settings) }
}

/** Exactly the six numbers, stripped of whatever else a `TimerPreset` carries (`id`,
 *  `nameKey`/`descriptionKey`, or a custom preset's `name`/`isCustom`/`createdAt`).
 *  `TimerPreset` is structurally assignable to `TimerSettings` — TypeScript only checks
 *  that the required fields are present, not that no others exist — so a preset object
 *  handed straight to `useState<TimerSettings>` keeps those extra fields at runtime, and
 *  `settings` (which the screen renders and a coach can edit) would silently carry a
 *  frozen copy of the preset's own metadata forever. */
function settingsOf(source: TimerSettings): TimerSettings {
  return {
    prepTime: source.prepTime,
    workTime: source.workTime,
    restTime: source.restTime,
    rounds: source.rounds,
    sets: source.sets,
    breakBetweenSets: source.breakBetweenSets,
  }
}

export type TimerEngine = {
  settings: TimerSettings
  phase: TimerPhase
  round: number
  set: number
  secondsLeft: number
  phaseTotalSeconds: number
  totalRemainingSeconds: number
  isRunning: boolean
  soundEnabled: boolean
  activePresetId: string | null
  setSoundEnabled: (enabled: boolean) => void
  togglePlay: () => void
  reset: () => void
  skip: () => void
  applyPreset: (preset: TimerPreset) => void
  adjustSetting: (setting: AdjustableSetting, delta: number) => void
  /** Mark a preset "active" (the highlighted chip) without touching the running clock or
   *  settings — unlike `applyPreset`, which restarts the workout at that preset's numbers.
   *  Used the moment a coach saves their CURRENT configuration as a new custom preset: the
   *  settings it would "apply" are already the ones running, so applying would only reset
   *  the phase/round/set back to the start for no reason. */
  markActivePreset: (id: string) => void
}

export function useTimerEngine(): TimerEngine {
  const [settings, setSettings] = useState<TimerSettings>(() => settingsOf(DEFAULT_PRESET))
  const [activePresetId, setActivePresetId] = useState<string | null>(DEFAULT_PRESET.id)
  const [runtime, setRuntime] = useState<RuntimeState>(() =>
    runtimeFor(initialPhaseState(DEFAULT_PRESET), DEFAULT_PRESET),
  )
  const [isRunning, setIsRunning] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Read inside the tick loop and the transport actions so neither has to be recreated —
  // or, worse, closed over a stale value — every time settings or runtime state change.
  const settingsRef = useRef(settings)
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])
  const runtimeRef = useRef(runtime)
  useEffect(() => {
    runtimeRef.current = runtime
  }, [runtime])
  /** Epoch ms at which the CURRENT phase ends. `null` only while not running — there is
   *  nothing counting down to lose track of. */
  const deadlineRef = useRef<number | null>(null)

  const sound = useTimerSound(soundEnabled)
  // §4.5's own addition, absent from the prototype: the screen must not sleep mid-round.
  useWakeLock(isRunning)

  useEffect(() => {
    if (!isRunning) return
    const interval = setInterval(() => {
      const now = Date.now()
      let state: PhaseState = runtimeRef.current
      let deadline = deadlineRef.current ?? now + runtimeRef.current.secondsLeft * 1000
      let remainingMs = deadline - now
      const transitions: TimerPhase[] = []

      // A `while`, not an `if`: a large overshoot (the tab was frozen for two phases'
      // worth of time) must walk through every intermediate phase — each with its own
      // buzzer — rather than silently absorbing them into one jump.
      while (remainingMs <= 0 && state.phase !== 'finished') {
        state = advancePhase(state, settingsRef.current)
        transitions.push(state.phase)
        if (state.phase === 'finished') {
          remainingMs = 0
          break
        }
        deadline += phaseDurationSeconds(state.phase, settingsRef.current) * 1000
        remainingMs = deadline - now
      }

      const finished = state.phase === 'finished'
      deadlineRef.current = finished ? null : deadline
      const secondsLeft = finished ? 0 : Math.max(0, Math.ceil(remainingMs / 1000))
      const previousSecondsLeft = runtimeRef.current.secondsLeft
      const next: RuntimeState = { phase: state.phase, round: state.round, set: state.set, secondsLeft }
      runtimeRef.current = next
      setRuntime(next)

      for (const phase of transitions) {
        if (phase === 'finished') sound.playFinish()
        else sound.playPhaseBuzzer(phase === 'work')
      }
      if (finished) setIsRunning(false)

      // The 3-2-1 pips — synced to the same seconds the ring and the digits show, once
      // per second, and only when nothing else already sounded this tick.
      if (
        transitions.length === 0 &&
        secondsLeft !== previousSecondsLeft &&
        secondsLeft >= 1 &&
        secondsLeft <= 3
      ) {
        sound.playPipBeep()
      }
    }, TICK_MS)
    return () => clearInterval(interval)
    // `sound` is memoised on `soundEnabled` alone (see its own module), so this only
    // restarts the interval when the run state or the sound toggle actually changes —
    // never on a settings or runtime update, which would otherwise reset the tick
    // cadence on every second.
  }, [isRunning, sound])

  const start = useCallback(() => {
    // The one legitimate place to touch the AudioContext: a real tap on the play button.
    sound.ensureAudio()
    if (runtimeRef.current.phase === 'finished') {
      const initial = runtimeFor(initialPhaseState(settingsRef.current), settingsRef.current)
      runtimeRef.current = initial
      setRuntime(initial)
      deadlineRef.current = Date.now() + initial.secondsLeft * 1000
    } else {
      deadlineRef.current = Date.now() + runtimeRef.current.secondsLeft * 1000
    }
    setIsRunning(true)
  }, [sound])

  const pause = useCallback(() => {
    setIsRunning(false)
    deadlineRef.current = null
  }, [])

  const togglePlay = useCallback(() => {
    if (isRunning) pause()
    else start()
  }, [isRunning, start, pause])

  const reset = useCallback(() => {
    setIsRunning(false)
    deadlineRef.current = null
    const initial = runtimeFor(initialPhaseState(settingsRef.current), settingsRef.current)
    runtimeRef.current = initial
    setRuntime(initial)
  }, [])

  const skip = useCallback(() => {
    const next = advancePhase(runtimeRef.current, settingsRef.current)
    const finished = next.phase === 'finished'
    const nextRuntime: RuntimeState = {
      ...next,
      secondsLeft: phaseDurationSeconds(next.phase, settingsRef.current),
    }
    runtimeRef.current = nextRuntime
    setRuntime(nextRuntime)
    if (isRunning) {
      deadlineRef.current = finished ? null : Date.now() + nextRuntime.secondsLeft * 1000
    }
    if (finished) {
      setIsRunning(false)
      sound.playFinish()
    } else {
      sound.playPhaseBuzzer(next.phase === 'work')
    }
  }, [isRunning, sound])

  const applyPreset = useCallback((preset: TimerPreset) => {
    const nextSettings = settingsOf(preset)
    settingsRef.current = nextSettings
    setSettings(nextSettings)
    setActivePresetId(preset.id)
    setIsRunning(false)
    deadlineRef.current = null
    const initial = runtimeFor(initialPhaseState(nextSettings), nextSettings)
    runtimeRef.current = initial
    setRuntime(initial)
  }, [])

  const adjustSetting = useCallback(
    (setting: AdjustableSetting, delta: number) => {
      // Matches the prototype's own `adjustParam`: every dial is locked while the clock
      // is actually running, so a coach cannot change the target the countdown is racing
      // to hit while it is mid-race.
      if (isRunning) return
      setActivePresetId(null)
      const prev = settingsRef.current
      const next: TimerSettings = { ...prev }
      if (setting === 'work') next.workTime = Math.max(5, prev.workTime + delta)
      if (setting === 'rest') next.restTime = Math.max(0, prev.restTime + delta)
      if (setting === 'rounds') next.rounds = Math.max(1, prev.rounds + delta)
      if (setting === 'sets') next.sets = Math.max(1, prev.sets + delta)
      if (setting === 'setRest') next.breakBetweenSets = Math.max(10, prev.breakBetweenSets + delta)
      if (setting === 'prep') next.prepTime = Math.max(0, prev.prepTime + delta)
      settingsRef.current = next
      setSettings(next)

      // Prep is the one dial the prototype's `adjustParam` also pushes straight into the
      // CURRENT phase display (`setSecondsLeft`/`setCurrentPhase` alongside
      // `setPrepTime`) rather than leaving for the next apply/reset — because prep is
      // where a coach is parked before a workout starts, and a "10s prep" label that
      // still said the old number until the next reset would read as broken.
      if (setting === 'prep') {
        const phase: TimerPhase = next.prepTime > 0 ? 'prep' : 'work'
        const secondsLeft = next.prepTime > 0 ? next.prepTime : next.workTime
        const nextRuntime: RuntimeState = {
          phase,
          round: runtimeRef.current.round,
          set: runtimeRef.current.set,
          secondsLeft,
        }
        runtimeRef.current = nextRuntime
        setRuntime(nextRuntime)
      }
    },
    [isRunning],
  )

  const markActivePreset = useCallback((id: string) => {
    setActivePresetId(id)
  }, [])

  return {
    settings,
    phase: runtime.phase,
    round: runtime.round,
    set: runtime.set,
    secondsLeft: runtime.secondsLeft,
    phaseTotalSeconds: phaseDurationSeconds(runtime.phase, settings),
    totalRemainingSeconds: computeTotalRemainingSeconds(runtime, runtime.secondsLeft, settings),
    isRunning,
    soundEnabled,
    activePresetId,
    setSoundEnabled,
    togglePlay,
    reset,
    skip,
    applyPreset,
    adjustSetting,
    markActivePreset,
  }
}
