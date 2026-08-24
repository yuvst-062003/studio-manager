export type PersistenceResult = {
  supported: boolean
  persisted: boolean
  alreadyPersisted: boolean
  checkedAt: string
}

export const PERSISTENCE_STORAGE_KEY = 'studio.storage.persistence'

/**
 * §10.6 requires that pending_ops is never reclaimed. A home-screen web app on iOS
 * is exempt from Safari's 7-day script-storage cap but may still be evicted under
 * storage pressure — a guarantee only a native container would have given, and §6.5
 * accepts that as managed rather than engineered around.
 *
 * The result is recorded rather than merely awaited: M8 reports install state beside
 * push delivery, and a refusal here is the signal the office needs.
 */
export async function requestPersistentStorage(): Promise<PersistenceResult> {
  const storage = globalThis.navigator?.storage
  const checkedAt = new Date().toISOString()

  if (!storage?.persist || !storage.persisted) {
    return record({ supported: false, persisted: false, alreadyPersisted: false, checkedAt })
  }

  const alreadyPersisted = await storage.persisted()
  if (alreadyPersisted) {
    return record({ supported: true, persisted: true, alreadyPersisted: true, checkedAt })
  }

  const persisted = await storage.persist()
  return record({ supported: true, persisted, alreadyPersisted: false, checkedAt })
}

function record(result: PersistenceResult): PersistenceResult {
  try {
    globalThis.localStorage?.setItem(PERSISTENCE_STORAGE_KEY, JSON.stringify(result))
  } catch {
    // A refused write must not break boot. The in-memory result is still returned.
  }
  return result
}

export function readPersistenceResult(): PersistenceResult | null {
  const raw = globalThis.localStorage?.getItem(PERSISTENCE_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PersistenceResult
  } catch {
    return null
  }
}
