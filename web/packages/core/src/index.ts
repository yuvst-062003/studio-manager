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
