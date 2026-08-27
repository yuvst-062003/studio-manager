import { registerSW } from 'virtual:pwa-register'
import { SW_UPDATE_CHECK_INTERVAL_MS, onSwUpdateReady } from '@studio/ui'

/**
 * registerType stays 'prompt' rather than 'autoUpdate', but onNeedRefresh is now a real
 * policy (update pass 2026-08-27) instead of a console line: an update found at launch
 * applies itself silently, an update found mid-session becomes UpdateToast's one-tap
 * offer, and a long-running session re-checks hourly so it hears about new builds at
 * all. See @studio/ui's sw-update/swUpdate.ts for the reasoning — including why the
 * launch reload cannot eat unsynced pending_ops.
 */
export function registerServiceWorker() {
  const launchedAt = Date.now()
  const updateSW = registerSW({
    onNeedRefresh() {
      onSwUpdateReady(() => void updateSW(true), Date.now() - launchedAt)
    },
    onOfflineReady() {
      console.info('[sw] offline ready')
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      setInterval(() => {
        void registration.update().catch(() => {
          // Offline is a normal state; the next interval asks again.
        })
      }, SW_UPDATE_CHECK_INTERVAL_MS)
    },
  })
  return updateSW
}
