import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILT_IN_TIMER_PRESETS } from './builtInPresets'
import { useTimerEngine } from './useTimerEngine'

const START = new Date('2026-11-03T12:00:00.000Z').getTime()

function installWakeLock() {
  const sentinel = { release: vi.fn().mockResolvedValue(undefined) }
  const request = vi.fn().mockResolvedValue(sentinel)
  Object.defineProperty(globalThis.navigator, 'wakeLock', {
    configurable: true,
    value: { request },
  })
  return { request, sentinel }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  vi.spyOn(Date, 'now').mockReturnValue(START)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  // @ts-expect-error -- test cleanup of a property this suite defines itself.
  delete globalThis.navigator.wakeLock
})

describe('useTimerEngine — presets', () => {
  it('starts on the default preset (tabata) with its own six numbers', () => {
    const { result } = renderHook(() => useTimerEngine())
    expect(result.current.settings).toEqual({
      prepTime: 10,
      workTime: 20,
      restTime: 10,
      rounds: 8,
      sets: 1,
      breakBetweenSets: 60,
    })
    expect(result.current.activePresetId).toBe('tabata')
    expect(result.current.phase).toBe('prep')
    expect(result.current.secondsLeft).toBe(10)
  })

  it('applying a preset carries all six of its numbers into settings', () => {
    const { result } = renderHook(() => useTimerEngine())
    const randori = BUILT_IN_TIMER_PRESETS.find((p) => p.id === 'randori')!

    act(() => result.current.applyPreset(randori))

    expect(result.current.settings).toEqual({
      prepTime: 15,
      workTime: 240,
      restTime: 60,
      rounds: 5,
      sets: 1,
      breakBetweenSets: 120,
    })
    expect(result.current.activePresetId).toBe('randori')
    // A fresh apply always restarts at the beginning, even if something was running.
    expect(result.current.isRunning).toBe(false)
    expect(result.current.phase).toBe('prep')
    expect(result.current.round).toBe(1)
    expect(result.current.set).toBe(1)
    expect(result.current.secondsLeft).toBe(15)
  })

  it('applying a preset with no prep time starts straight at work', () => {
    const { result } = renderHook(() => useTimerEngine())
    act(() =>
      result.current.applyPreset({
        id: 'no-prep',
        nameKey: 'x',
        descriptionKey: 'x',
        prepTime: 0,
        workTime: 30,
        restTime: 10,
        rounds: 3,
        sets: 1,
        breakBetweenSets: 30,
      }),
    )
    expect(result.current.phase).toBe('work')
    expect(result.current.secondsLeft).toBe(30)
  })
})

describe('useTimerEngine — counters and phase order, driven by skip', () => {
  it('walks round/set through a full 2-round, 2-set workout, ending finished', () => {
    const { result } = renderHook(() => useTimerEngine())
    act(() =>
      result.current.applyPreset({
        id: 'small',
        nameKey: 'x',
        descriptionKey: 'x',
        prepTime: 5,
        workTime: 5,
        restTime: 5,
        rounds: 2,
        sets: 2,
        breakBetweenSets: 5,
      }),
    )

    const seen: { phase: string; round: number; set: number }[] = [
      { phase: result.current.phase, round: result.current.round, set: result.current.set },
    ]
    for (let i = 0; i < 8; i += 1) {
      act(() => result.current.skip())
      seen.push({ phase: result.current.phase, round: result.current.round, set: result.current.set })
    }

    expect(seen).toEqual([
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
    expect(result.current.isRunning).toBe(false)
  })
})

describe('useTimerEngine — transport', () => {
  it('start/pause toggle isRunning', () => {
    const { result } = renderHook(() => useTimerEngine())
    expect(result.current.isRunning).toBe(false)
    act(() => result.current.togglePlay())
    expect(result.current.isRunning).toBe(true)
    act(() => result.current.togglePlay())
    expect(result.current.isRunning).toBe(false)
  })

  it('reset returns to the start of the current preset without changing which preset is active', () => {
    const { result } = renderHook(() => useTimerEngine())
    act(() => result.current.togglePlay())
    // `Date.now` is pinned at `START` by the top-level `beforeEach` — advancing the fake
    // timer queue alone does not move it, so it is moved explicitly here.
    vi.spyOn(Date, 'now').mockReturnValue(START + 3000)
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.secondsLeft).toBeLessThan(10)

    act(() => result.current.reset())
    expect(result.current.isRunning).toBe(false)
    expect(result.current.phase).toBe('prep')
    expect(result.current.round).toBe(1)
    expect(result.current.set).toBe(1)
    expect(result.current.secondsLeft).toBe(10)
    expect(result.current.activePresetId).toBe('tabata')
  })

  it('locks the adjuster dials while running, matching the prototype', () => {
    const { result } = renderHook(() => useTimerEngine())
    act(() => result.current.togglePlay())
    const before = result.current.settings.workTime
    act(() => result.current.adjustSetting('work', 5))
    expect(result.current.settings.workTime).toBe(before)
  })

  it('floors work time at 5s and clears the active preset once a dial is touched', () => {
    const { result } = renderHook(() => useTimerEngine())
    act(() => result.current.adjustSetting('work', -100))
    expect(result.current.settings.workTime).toBe(5)
    expect(result.current.activePresetId).toBeNull()
  })
})

describe('useTimerEngine — the wake lock is wired to the run state', () => {
  it('requests a lock on start and releases it on pause', async () => {
    const { request, sentinel } = installWakeLock()
    const { result } = renderHook(() => useTimerEngine())

    act(() => result.current.togglePlay())
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('screen'))

    act(() => result.current.togglePlay())
    await vi.waitFor(() => expect(sentinel.release).toHaveBeenCalled())
  })
})

describe('useTimerEngine — no drift on a late tick', () => {
  it('reflects the true elapsed wall-clock time, not one tick worth of decrement', () => {
    const { result } = renderHook(() => useTimerEngine())
    act(() => result.current.togglePlay()) // running, prep = 10s, deadline = START + 10_000

    // Only ONE interval firing is triggered (advancing the fake timer queue by exactly
    // one tick period), but the wall clock the callback reads has jumped 3.4s — the
    // shape of a tick that fires late under a throttled/backgrounded tab.
    vi.spyOn(Date, 'now').mockReturnValue(START + 3400)
    act(() => {
      vi.advanceTimersByTime(200)
    })

    // 10s - 3.4s = 6.6s, ceiled to 7 — the exact wall-clock answer. A naive
    // decrement-per-tick timer would instead show 9 (one tick's worth of "-1").
    expect(result.current.secondsLeft).toBe(7)
    expect(result.current.phase).toBe('prep')
  })

  it('carries the overshoot into the next phase rather than resetting the clock at "now"', () => {
    const { result } = renderHook(() => useTimerEngine())
    act(() => result.current.togglePlay()) // prep = 10s ends at START + 10_000; work is 20s

    // 14s have really passed — 4s past the end of prep — in a single late firing.
    vi.spyOn(Date, 'now').mockReturnValue(START + 14_000)
    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(result.current.phase).toBe('work')
    // Work's deadline is prep's own deadline + 20s (START + 30_000), not "now + 20s" —
    // so the 4s overshoot is already spent: 30_000 - 14_000 = 16_000ms left, i.e. 16s.
    expect(result.current.secondsLeft).toBe(16)
  })
})
