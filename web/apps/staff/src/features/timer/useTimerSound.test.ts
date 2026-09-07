// The audio cues, asserted through the engine that drives them.
//
// `useTimerSound` had no test at all, and "the timer beeps" was the one claim about this
// screen that nothing in the repo checked — the engine's own suite drives phases and
// counters with the sound module left to run silently against jsdom, which has no Web
// Audio at all, so every cue was a no-op that no assertion could tell apart from a working
// one. What is provable in a test runner is that an oscillator is CREATED, CONNECTED and
// STARTED with the right shape at the right moment; whether a speaker moves is a device
// fact and is verified by hand. Everything below is the first half.
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTimerEngine } from './useTimerEngine'

const START = new Date('2026-11-03T12:00:00.000Z').getTime()

type Played = { type: OscillatorType; freq: number; volume: number }

/** A recording stand-in for the Web Audio graph. It answers the same four calls
 *  `useTimerSound` makes — `createOscillator`, `createGain`, `connect`, `start`/`stop` —
 *  and records one row per tone that actually reached `destination`. A tone that is built
 *  but never connected or never started does NOT appear, which is the point: the recording
 *  is of sound produced, not of code executed. */
function installAudio(state: AudioContextState = 'running') {
  const played: Played[] = []
  const resume = vi.fn().mockResolvedValue(undefined)
  let constructed = 0

  class FakeAudioContext {
    currentTime = 0
    state = state
    destination = { id: 'destination' }
    resume = resume

    constructor() {
      constructed += 1
    }

    createGain() {
      return {
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        _volume: 0,
        connect: vi.fn(),
      }
    }

    createOscillator() {
      const node = {
        type: 'sine' as OscillatorType,
        frequency: { setValueAtTime: vi.fn() },
        _gain: null as { gain: { setValueAtTime: (v: number, t: number) => void } } | null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }
      // `setValueAtTime` is where the frequency and the volume actually land, so the
      // recording reads them from the calls rather than from a field the module never sets.
      node.start = vi.fn(() => {
        const freq = node.frequency.setValueAtTime.mock.calls[0]?.[0] as number
        const gainNode = node.connect.mock.calls[0]?.[0] as
          | { gain: { setValueAtTime: { mock: { calls: unknown[][] } } } }
          | undefined
        const volume = (gainNode?.gain.setValueAtTime.mock.calls[0]?.[0] as number) ?? 0
        played.push({ type: node.type, freq, volume })
      })
      return node
    }
  }

  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    writable: true,
    value: FakeAudioContext,
  })
  return { played, resume, contexts: () => constructed }
}

beforeEach(() => {
  // `setTimeout` is faked as well as `setInterval`: a buzzer is TWO tones, and the second
  // one is scheduled 110ms/180ms after the first. Without it the test would assert half a
  // cue and pass with the other half missing.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
  vi.spyOn(Date, 'now').mockReturnValue(START)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  // @ts-expect-error -- test cleanup of a global this suite defines itself.
  delete globalThis.AudioContext
})

describe('the timer actually makes a sound', () => {
  it('opens the audio context on the play tap, which is the only gesture iOS accepts', () => {
    const audio = installAudio()
    const { result } = renderHook(() => useTimerEngine())

    expect(audio.contexts()).toBe(0)
    act(() => result.current.togglePlay())
    expect(audio.contexts()).toBe(1)
  })

  it('resumes a context Safari suspended while the app was in the background', () => {
    const audio = installAudio('suspended')
    const { result } = renderHook(() => useTimerEngine())

    act(() => result.current.togglePlay())

    expect(audio.resume).toHaveBeenCalled()
  })

  it('sounds the work buzzer — two tones, the prototype’s own frequencies', () => {
    const audio = installAudio()
    const { result } = renderHook(() => useTimerEngine())

    act(() => result.current.togglePlay())
    audio.played.length = 0
    act(() => result.current.skip()) // prep -> work
    act(() => vi.advanceTimersByTime(200)) // the second tone's setTimeout

    expect(audio.played).toEqual([
      { type: 'sawtooth', freq: 1350, volume: 0.35 },
      { type: 'sine', freq: 1800, volume: 0.4 },
    ])
  })

  it('sounds a different, lower buzzer for rest, so a coach can tell them apart blind', () => {
    const audio = installAudio()
    const { result } = renderHook(() => useTimerEngine())

    act(() => result.current.togglePlay())
    act(() => result.current.skip()) // -> work
    // Drain the work buzzer's own delayed second tone BEFORE clearing, or it lands in the
    // recording after the reset and this test asserts a cue it did not trigger.
    act(() => vi.advanceTimersByTime(200))
    audio.played.length = 0
    act(() => result.current.skip()) // -> rest
    act(() => vi.advanceTimersByTime(200))

    expect(audio.played).toEqual([
      { type: 'triangle', freq: 720, volume: 0.35 },
      { type: 'triangle', freq: 540, volume: 0.35 },
    ])
  })

  it('pips once a second over the last three seconds of a phase, and not before', () => {
    const audio = installAudio()
    const { result } = renderHook(() => useTimerEngine())

    act(() => result.current.togglePlay()) // tabata: 10s of prep
    audio.played.length = 0

    // 6 seconds gone, 4 left — outside the pip window, so still silent.
    vi.spyOn(Date, 'now').mockReturnValue(START + 6_000)
    act(() => vi.advanceTimersByTime(200))
    expect(audio.played).toEqual([])

    for (const [elapsed, expected] of [
      [7_000, 3],
      [8_000, 2],
      [9_000, 1],
    ] as const) {
      vi.spyOn(Date, 'now').mockReturnValue(START + elapsed)
      act(() => vi.advanceTimersByTime(200))
      expect(result.current.secondsLeft).toBe(expected)
    }

    expect(audio.played).toEqual([
      { type: 'square', freq: 1050, volume: 0.22 },
      { type: 'square', freq: 1050, volume: 0.22 },
      { type: 'square', freq: 1050, volume: 0.22 },
    ])
  })

  it('plays the two-tone finish when the last round ends', () => {
    const audio = installAudio()
    const { result } = renderHook(() => useTimerEngine())

    act(() =>
      result.current.applyPreset({
        id: 'one-round',
        name: 'one round',
        isCustom: true,
        createdAt: '2026-11-03T12:00:00.000Z',
        prepTime: 0,
        workTime: 5,
        restTime: 0,
        rounds: 1,
        sets: 1,
        breakBetweenSets: 0,
      }),
    )
    act(() => result.current.togglePlay())
    audio.played.length = 0
    act(() => result.current.skip()) // the only round ends
    act(() => vi.advanceTimersByTime(300))

    expect(result.current.phase).toBe('finished')
    expect(audio.played).toEqual([
      { type: 'sine', freq: 880, volume: 0.25 },
      { type: 'sine', freq: 1100, volume: 0.25 },
    ])
  })

  it('makes no sound at all once the coach mutes it, context and all', () => {
    const audio = installAudio()
    const { result } = renderHook(() => useTimerEngine())

    act(() => result.current.setSoundEnabled(false))
    act(() => result.current.togglePlay())
    act(() => result.current.skip())
    act(() => vi.advanceTimersByTime(500))

    expect(audio.played).toEqual([])
  })
})
