export { getDisplayMode, isInstalled, useDisplayMode } from './useDisplayMode'
export type { DisplayMode } from './useDisplayMode'
export {
  PERSISTENCE_STORAGE_KEY,
  readPersistenceResult,
  requestPersistentStorage,
} from './persistentStorage'
export type { PersistenceResult } from './persistentStorage'

// -- pure helpers every lane imports (the foundations session) -----------------
// The offline queue is deliberately NOT here: `src/offline/**` is M5's, per the W3
// ownership globs. Nothing in this block touches storage, the network or React.
export { AGOROT_PER_SHEKEL, MoneyFormatError, formatAgorot, parseShekels } from './money'
export {
  STUDIO_TIMEZONE,
  formatDateInStudioZone,
  formatTimeInStudioZone,
  studioDayKey,
} from './datetime'
export type { Locale } from './datetime'
export { appendPage, hasNextPage, mergeCursorPages } from './pagination'
export type { CursorPage } from './pagination'
export { CAPABILITIES, MONEY_CAPABILITIES, can, isCoach } from './permissions'
export type { Actor, Capability, Role, Scope } from './permissions'
