import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PERSISTENCE_STORAGE_KEY,
  readPersistenceResult,
  requestPersistentStorage,
} from './persistentStorage'

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

describe('requestPersistentStorage (§10.6 — pending_ops is never reclaimed)', () => {
  it('reports unsupported without throwing when the API is absent', async () => {
    vi.stubGlobal('navigator', {})
    const result = await requestPersistentStorage()
    expect(result).toMatchObject({ supported: false, persisted: false })
  })

  it('does not re-request when already persisted', async () => {
    const persist = vi.fn()
    vi.stubGlobal('navigator', { storage: { persisted: async () => true, persist } })
    const result = await requestPersistentStorage()
    expect(result).toMatchObject({ supported: true, persisted: true, alreadyPersisted: true })
    expect(persist).not.toHaveBeenCalled()
  })

  it('requests persistence and records a refusal rather than swallowing it', async () => {
    vi.stubGlobal('navigator', {
      storage: { persisted: async () => false, persist: async () => false },
    })
    const result = await requestPersistentStorage()
    expect(result).toMatchObject({ supported: true, persisted: false, alreadyPersisted: false })
  })

  it('records the result where M8 install reporting can read it', async () => {
    vi.stubGlobal('navigator', {
      storage: { persisted: async () => false, persist: async () => true },
    })
    await requestPersistentStorage()
    const stored = readPersistenceResult()
    expect(stored?.persisted).toBe(true)
    expect(stored?.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(localStorage.getItem(PERSISTENCE_STORAGE_KEY)).not.toBeNull()
  })
})
