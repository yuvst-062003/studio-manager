import { describe, expect, it } from 'vitest'
import { memoryStore } from './store'

describe('the offline store port', () => {
  it('round-trips a value', async () => {
    const store = memoryStore()
    await store.put('meta', 'watermark', { at: '2026-11-03T12:00:00Z' })
    expect(await store.get('meta', 'watermark')).toEqual({ at: '2026-11-03T12:00:00Z' })
  })

  it('returns undefined for a key it does not hold', async () => {
    expect(await memoryStore().get('meta', 'nothing')).toBeUndefined()
  })

  it('keeps tables separate', async () => {
    // The eviction rule in cache.ts can only be trusted if a write to `sessions` cannot
    // reach `pending_ops`. That is a property of the port, so it is asserted here.
    const store = memoryStore()
    await store.put('sessions', 'a', 1)
    await store.put('pending_ops', 'a', 2)
    expect(await store.get('sessions', 'a')).toBe(1)
    expect(await store.get('pending_ops', 'a')).toBe(2)
  })

  it('lists rows key-sorted rather than insertion-ordered', async () => {
    // §10.6 evicts "oldest-first", and the cache keys sessions by their start instant.
    // Insertion order is whatever the bootstrap payload happened to contain, so eviction
    // would be arbitrary without this.
    const store = memoryStore()
    await store.put('sessions', 'c', 3)
    await store.put('sessions', 'a', 1)
    await store.put('sessions', 'b', 2)
    expect((await store.all('sessions')).map((row) => row.key)).toEqual(['a', 'b', 'c'])
  })

  it('deletes one key without touching its neighbours', async () => {
    const store = memoryStore()
    await store.put('sessions', 'a', 1)
    await store.put('sessions', 'b', 2)
    await store.delete('sessions', 'a')
    expect((await store.all('sessions')).map((row) => row.key)).toEqual(['b'])
  })

  it('clears one table and leaves the others whole', async () => {
    // The strongest form of the §10.6 exemption: even `clear`, the most destructive call
    // the port has, is confined to the one table it names.
    const store = memoryStore()
    await store.put('sessions', 'a', 1)
    await store.put('pending_ops', 'op', 2)
    await store.clear('sessions')
    expect(await store.all('sessions')).toEqual([])
    expect(await store.all('pending_ops')).toHaveLength(1)
  })

  it('overwrites on a repeated key rather than appending', async () => {
    const store = memoryStore()
    await store.put('pending_ops', 'op', { attempts: 0 })
    await store.put('pending_ops', 'op', { attempts: 1 })
    expect(await store.all('pending_ops')).toHaveLength(1)
    expect(await store.get('pending_ops', 'op')).toEqual({ attempts: 1 })
  })
})
