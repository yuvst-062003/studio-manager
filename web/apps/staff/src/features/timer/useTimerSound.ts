// The Web Audio cues, ported from the prototype's `initAudio`/`playTone`/`playPipBeep`/
// `playPhaseBuzzer` — same oscillator shapes, frequencies and durations, so a coach who
// knows the prototype's beeps hears the same ones here.
//
// **Initialised on the first user gesture and resumed if suspended.** iOS (and Chrome's
// autoplay policy generally) will not let a page make sound until a real tap has happened,
// and it actively SUSPENDS an existing `AudioContext` when the tab is backgrounded — so a
// coach who starts the timer, glances at another app mid-round and comes back would hear
// nothing for the rest of the workout without the resume in `ensureAudio`. `ensureAudio`
// is called from `useTimerEngine`'s `start`, which only ever runs from the play button's
// own click handler — a genuine gesture, not an effect.
import { useCallback, useMemo, useRef } from 'react'

type TimerSound = {
  /** Create the context on first call, resume it if a background/backgrounding
   *  transition suspended it. Idempotent — safe to call on every play/pause tap. */
  ensureAudio: () => void
  playPipBeep: () => void
  playPhaseBuzzer: (isWork: boolean) => void
  playFinish: () => void
}

export function useTimerSound(enabled: boolean): TimerSound {
  const ctxRef = useRef<AudioContext | null>(null)

  const ensureAudio = useCallback(() => {
    try {
      if (!ctxRef.current) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (Ctor) ctxRef.current = new Ctor()
      }
      if (ctxRef.current && ctxRef.current.state === 'suspended') {
        void ctxRef.current.resume()
      }
    } catch {
      // No Web Audio in this environment (or a construction/resume failure) — the timer
      // still runs, silently.
    }
  }, [])

  const playTone = useCallback(
    (freq = 880, duration = 0.15, type: OscillatorType = 'sine', volume = 0.25) => {
      if (!enabled) return
      try {
        ensureAudio()
        const ctx = ctxRef.current
        if (!ctx) return
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = type
        osc.frequency.setValueAtTime(freq, ctx.currentTime)
        gain.gain.setValueAtTime(volume, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + duration)
      } catch {
        // A synth glitch must not interrupt the countdown it is decorating.
      }
    },
    [enabled, ensureAudio],
  )

  const playPipBeep = useCallback(() => playTone(1050, 0.14, 'square', 0.22), [playTone])

  const playPhaseBuzzer = useCallback(
    (isWork: boolean) => {
      if (isWork) {
        playTone(1350, 0.12, 'sawtooth', 0.35)
        setTimeout(() => playTone(1800, 0.35, 'sine', 0.4), 110)
      } else {
        playTone(720, 0.22, 'triangle', 0.35)
        setTimeout(() => playTone(540, 0.4, 'triangle', 0.35), 180)
      }
    },
    [playTone],
  )

  const playFinish = useCallback(() => {
    playTone(880, 0.4)
    setTimeout(() => playTone(1100, 0.6), 250)
  }, [playTone])

  // Memoised so callers that depend on the whole object (`useTimerEngine`'s tick effect)
  // do not re-run every render — only when `enabled` actually changes and the callbacks
  // above are rebuilt.
  return useMemo(
    () => ({ ensureAudio, playPipBeep, playPhaseBuzzer, playFinish }),
    [ensureAudio, playPipBeep, playPhaseBuzzer, playFinish],
  )
}
