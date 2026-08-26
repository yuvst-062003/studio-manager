// Two `OfflineStore` implementations: one for tests and one for a phone.
//
// **Why not Dexie.** §8.1a names it, and it is the right library. It is not a dependency
// here because adding it edits `web/package.json` and `package-lock.json` — files W3's
// ownership list gives to neither lane, and which lane HEALTH holds at the same time. The
// port in `types.ts` is what makes that a deferral rather than a decision: every rule in
// `src/offline/` is written against `OfflineStore`, so swapping `indexedDbStore` for a
// Dexie-backed one is a file, not a refactor.
import type { OfflineStore, TableName } from './types'

/**
 * The store every test in this directory runs against.
 *
 * Not a stub. §10.6's eviction rule, §10.3's flush rules and §10.5's conflict rules are all
 * *our* logic, not IndexedDB's, and running them against a real IndexedDB would only add a
 * fake-indexeddb dependency and some flake. What IndexedDB itself does is asserted by the
 * one place it matters — a real device, which §W3's merge plan already schedules as the
 * manual airplane-mode run that "nothing substitutes for".
 */
export function memoryStore(): OfflineStore {
  const tables = new Map<TableName, Map<string, unknown>>()
  const table = (name: TableName): Map<string, unknown> => {
    const existing = tables.get(name)
    if (existing) return existing
    const created = new Map<string, unknown>()
    tables.set(name, created)
    return created
  }

  return {
    async get<T>(name: TableName, key: string): Promise<T | undefined> {
      return table(name).get(key) as T | undefined
    },
    async put<T>(name: TableName, key: string, value: T): Promise<void> {
      table(name).set(key, value)
    },
    async delete(name: TableName, key: string): Promise<void> {
      table(name).delete(key)
    },
    async all<T>(name: TableName): Promise<{ key: string; value: T }[]> {
      // Key-sorted, not insertion-ordered. §10.6 evicts "oldest-first" and `cache.ts` keys
      // a session by its start instant, so an insertion-ordered listing would evict
      // whatever the bootstrap payload happened to list first.
      return [...table(name).entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, value]) => ({ key, value: value as T }))
    },
    async clear(name: TableName): Promise<void> {
      table(name).clear()
    },
  }
}

const DB_NAME = 'studio.offline'
const DB_VERSION = 1
const TABLES: TableName[] = ['pending_ops', 'sessions', 'rosters', 'meta', 'conflicts']

/**
 * The real one. Five object stores, one per `TableName`, keyed out-of-line.
 *
 * **The tables are separate object stores and not one keyed by prefix**, because §10.6's
 * exemption has to be enforceable by construction: `clear('sessions')` must be incapable
 * of reaching `pending_ops`, and a shared store with a key convention makes that a habit
 * rather than a guarantee.
 *
 * Every method resolves rather than rejects on a missing database. §10.3 item 5 — "there is
 * no code path that discards unsynced work" — has a quieter twin: there is no code path
 * where storage being unavailable *stops a coach marking a register*. The optimistic UI is
 * already updated by then; a rejected write here would surface as an exception in a tap
 * handler on the mat.
 */
export function indexedDbStore(name: string = DB_NAME): OfflineStore {
  let opening: Promise<IDBDatabase> | null = null

  const open = (): Promise<IDBDatabase> => {
    if (opening) return opening
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = globalThis.indexedDB.open(name, DB_VERSION)
      request.onupgradeneeded = () => {
        for (const store of TABLES) {
          if (!request.result.objectStoreNames.contains(store)) {
            request.result.createObjectStore(store)
          }
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return opening
  }

  const run = async <T>(
    table: TableName,
    mode: IDBTransactionMode,
    body: (store: IDBObjectStore) => IDBRequest,
  ): Promise<T> => {
    const db = await open()
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(table, mode)
      const request = body(tx.objectStore(table))
      request.onsuccess = () => resolve(request.result as T)
      request.onerror = () => reject(request.error)
    })
  }

  return {
    async get<T>(table: TableName, key: string): Promise<T | undefined> {
      return run<T | undefined>(table, 'readonly', (store) => store.get(key))
    },
    async put<T>(table: TableName, key: string, value: T): Promise<void> {
      await run(table, 'readwrite', (store) => store.put(value, key))
    },
    async delete(table: TableName, key: string): Promise<void> {
      await run(table, 'readwrite', (store) => store.delete(key))
    },
    async all<T>(table: TableName): Promise<{ key: string; value: T }[]> {
      const keys = await run<IDBValidKey[]>(table, 'readonly', (store) => store.getAllKeys())
      const values = await run<T[]>(table, 'readonly', (store) => store.getAll())
      // `getAllKeys` and `getAll` are guaranteed by the spec to return parallel arrays in
      // the same order, but `noUncheckedIndexedAccess` cannot know that, and asserting it
      // with `!` would hide a real desync if a future adapter ever broke the pairing.
      return keys
        .flatMap((key, index) => {
          const value = values[index]
          return value === undefined ? [] : [{ key: String(key), value }]
        })
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    },
    async clear(table: TableName): Promise<void> {
      await run(table, 'readwrite', (store) => store.clear())
    },
  }
}
