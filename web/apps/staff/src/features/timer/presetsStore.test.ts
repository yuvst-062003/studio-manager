import { memoryStore } from '@studio/core'
import { describe, expect, it } from 'vitest'
import { deleteCustomPreset, loadCustomPresets, saveCustomPreset } from './presetsStore'

describe('presetsStore — a coach\'s own presets, in IndexedDB via the offline store', () => {
  it('starts empty', async () => {
    const store = memoryStore()
    expect(await loadCustomPresets(store)).toEqual([])
  })

  it('a saved preset survives a reload — the store outlives the React tree that wrote it', async () => {
    // `memoryStore()` here plays the part of a real `indexedDbStore()`: the point under
    // test is that the DATA lives in the store, not in component state, so reading it
    // back through a brand-new call — as a reload would, with no React state carried
    // over — returns what was written.
    const store = memoryStore()
    const saved = await saveCustomPreset(
      {
        name: 'שגרת חימום ומתיחות',
        prepTime: 10,
        workTime: 40,
        restTime: 20,
        rounds: 6,
        sets: 1,
        breakBetweenSets: 45,
      },
      store,
    )

    // Simulate "reload": a fresh read through the same store, with nothing held over.
    const reloaded = await loadCustomPresets(store)
    expect(reloaded).toEqual([saved])
    expect(reloaded[0]).toMatchObject({
      name: 'שגרת חימום ומתיחות',
      prepTime: 10,
      workTime: 40,
      restTime: 20,
      rounds: 6,
      sets: 1,
      breakBetweenSets: 45,
      isCustom: true,
    })
  })

  it('keeps multiple presets, oldest first', async () => {
    const store = memoryStore()
    const first = await saveCustomPreset(
      { name: 'א', prepTime: 5, workTime: 20, restTime: 10, rounds: 4, sets: 1, breakBetweenSets: 30 },
      store,
    )
    const second = await saveCustomPreset(
      { name: 'ב', prepTime: 5, workTime: 25, restTime: 10, rounds: 4, sets: 1, breakBetweenSets: 30 },
      store,
    )
    expect(await loadCustomPresets(store)).toEqual([first, second])
  })

  it('deletes one preset without touching the others', async () => {
    const store = memoryStore()
    const first = await saveCustomPreset(
      { name: 'א', prepTime: 5, workTime: 20, restTime: 10, rounds: 4, sets: 1, breakBetweenSets: 30 },
      store,
    )
    const second = await saveCustomPreset(
      { name: 'ב', prepTime: 5, workTime: 25, restTime: 10, rounds: 4, sets: 1, breakBetweenSets: 30 },
      store,
    )

    await deleteCustomPreset(first.id, store)

    expect(await loadCustomPresets(store)).toEqual([second])
  })
})
