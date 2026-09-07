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
import { useCallback, useEffect, useMemo, useRef } from 'react'

type TimerSound = {
  /** Create the context on first call, resume it if a background/backgrounding
   *  transition suspended it. Idempotent — safe to call on every play/pause tap. */
  ensureAudio: () => void
  playPipBeep: () => void
  playPhaseBuzzer: (isWork: boolean) => void
  playFinish: () => void
}

/**
 * Make the timer audible with the iPhone's ring/silent switch set to SILENT.
 *
 * **This is the bug a coach actually reports as "there is no sound".** Web Audio on iOS
 * defaults to the `auto` session type, which the hardware mute switch silences — and a
 * phone that lives in a kitbag beside a mat is on silent. Nothing in the app is wrong;
 * the OS is doing what it was told. `playback` is the type that says "this is content the
 * user asked for", and it plays through the switch.
 *
 * Safari 17+ only, and guarded rather than feature-detected against a list: every other
 * browser simply has no `audioSession`, where the mute switch does not exist as a concept
 * and there is nothing to opt out of.
 */
function claimPlaybackAudioSession(): void {
  try {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession
    if (session) session.type = 'playback'
  } catch {
    // Setting it is best-effort. A browser that rejects the value still plays through the
    // ordinary path; it just obeys the mute switch, which is where it started.
  }
}

export function useTimerSound(enabled: boolean): TimerSound {
  const ctxRef = useRef<AudioContext | null>(null)

  const ensureAudio = useCallback(() => {
    try {
      if (!ctxRef.current) {
        claimPlaybackAudioSession()
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

  /**
   * Come back from a lock screen or another app, and the rest of the workout is audible.
   *
   * **The module header promised this and nothing implemented it.** It said a coach who
   * "glances at another app mid-round and comes back would hear nothing for the rest of the
   * workout without the resume in `ensureAudio`" — true, except `ensureAudio` only ever ran
   * from the play button, so a round begun before the glance never got one. iOS suspends
   * the context on background; only a resume brings it back, and there is no tap coming
   * because the timer is already running.
   *
   * `useWakeLock` has re-acquired on this exact event since it was written; this is the
   * same shape for the same reason.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const ctx = ctxRef.current
      // Only resume a context that already exists. Creating one here would be creating it
      // outside a gesture, which is what leaves it suspended in the first place.
      if (ctx && ctx.state === 'suspended') void ctx.resume()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
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
