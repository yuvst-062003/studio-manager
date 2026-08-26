export { getDisplayMode, isInstalled, useDisplayMode } from './useDisplayMode'
export type { DisplayMode } from './useDisplayMode'
export {
  PERSISTENCE_STORAGE_KEY,
  readPersistenceResult,
  requestPersistentStorage,
} from './persistentStorage'
export type { PersistenceResult } from './persistentStorage'

// §5.2, §10.3 and §11.7 — the session. The access token lives in memory only; the refresh
// token is an httpOnly cookie JavaScript never sees. See ./identity/session.ts's header
// for why nothing here may be moved into storage.
export {
  ACT_AS_EVENT,
  apiFetch,
  clearSession,
  getAccessToken,
  refresh,
  setAccessToken,
  signOut,
  startListeningForPersonaSwitch,
} from './identity/session'
export type { AppAccess, SessionState, StudioMembership } from './identity/session'
export { useSession } from './identity/useSession'
export type { Session, SessionStatus } from './identity/useSession'

// §10's offline layer — `src/offline/**`, lane ATTENDANCE's (M5). The four-state network
// machine, `pending_ops`, the two-day cache and the flusher. Re-exported through its own
// sub-barrel so this file lists one line rather than thirty, and so `src/offline/index.ts`
// stays the directory's single door: `queueMark` is the only way a lane writes to the
// queue, and a lane reaching past it could forget `queueChanged()` and leave the badge
// stuck at zero while marks pile up.
export * from './offline'

// -- pure helpers every lane imports (the foundations session) -----------------
// Nothing in this block touches storage, the network or React.
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
