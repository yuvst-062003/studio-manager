import { registerSW } from 'virtual:pwa-register'

/**
 * registerType is 'prompt', not 'autoUpdate': the staff app may be holding
 * unsynced pending_ops (§10.6), and reloading underneath a coach mid-register
 * would be worse than a stale build. M1 turns onNeedRefresh into a real control
 * in the app shell.
 */
export function registerServiceWorker() {
  return registerSW({
    onNeedRefresh() {
      console.info('[sw] a new version is ready')
    },
    onOfflineReady() {
      console.info('[sw] offline ready')
    },
  })
}
