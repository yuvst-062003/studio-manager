// S5 — the offline machinery, made visible from every screen.
//
// §10.1 models four network states plus api-down, `usePendingCount` counts the queue, and
// until this file the only consumers were two screens a coach might never be on. §6.1 walks
// a coach into a basement: the shell is where `לא מקוון` and the pending count must live so
// they are visible from Today and from the roster alike.
//
// This is also the app's one `useNetworkMonitor` mount — the hook's own docstring: "Start
// the probe loop for as long as a component is mounted. Mounted once, at the app shell — a
// second caller would be a second interval." Without a mount the probe loop never ran, and
// the mode only changed when a real request happened to fail.
import { plural, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { useNetworkMonitor, usePendingCount } from '@studio/core'
import type { NetworkMode } from '@studio/core'

/** §10.1's fifth row keeps its own words here — `השרת אינו זמין` — because a coach with
 *  four bars told `לא מקוון` stops trusting the indicator entirely. */
const MODE_KEY: Record<Exclude<NetworkMode, 'online'>, string> = {
  offline: 'attendance.network.offline',
  slow: 'attendance.network.slow',
  intermittent: 'attendance.network.intermittent',
  'api-down': 'attendance.network.apiDown',
}

/** The reassurance line ("your marks are saved on the device") — register §9 used to carry
 *  this only inside the roster screen's now-removed duplicate banner. `slow` has none: §10.1
 *  gives it no distinct hint copy, and a slow connection does not queue anything to explain. */
const HINT_KEY: Partial<Record<Exclude<NetworkMode, 'online'>, string>> = {
  offline: 'attendance.network.offlineHint',
  intermittent: 'attendance.network.intermittentHint',
  'api-down': 'attendance.network.apiDownHint',
}

export function NetworkStatus({ locale }: { locale: Locale }) {
  const { mode } = useNetworkMonitor()
  const pending = usePendingCount()

  // Online with an empty queue is the normal state, and a permanent "all good" chip is a
  // chip nobody reads. The strip exists only when it has something to say.
  if (mode === 'online' && pending === 0) return null

  return (
    <div
      data-testid="network-status"
      role="status"
      style={{
        display: 'flex',
        gap: '0.5rem',
        alignItems: 'center',
        paddingBlock: '0.25rem',
        paddingInline: '0.75rem',
        background: 'var(--surface-raised)',
        color: 'var(--fg)',
        fontSize: 'var(--text-caption)',
      }}
    >
      {mode !== 'online' ? (
        <span data-testid="network-status-mode">
          {t(locale, MODE_KEY[mode])}
          {HINT_KEY[mode] ? <> · {t(locale, HINT_KEY[mode] as string)}</> : null}
        </span>
      ) : null}
      {pending > 0 ? (
        <span data-testid="network-status-pending">
          {plural(locale, 'attendance.sync.pendingCount', pending)}
        </span>
      ) : null}
    </div>
  )
}
