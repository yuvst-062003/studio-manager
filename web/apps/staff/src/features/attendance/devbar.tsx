// §19.4's `📴 offline` and `🐌 slow` toggles, the two the dev bar has been drawing as
// `pending in M5` since M0.4.
//
// **They live in the staff app and not in `@studio/ui`** because the toggle's whole job is
// to drive `@studio/core`'s network monitor, and `@studio/ui` must not depend on
// `@studio/core` — the rule `apps/staff/src/App.tsx` states where it passes `apiFetch` into
// the setup wizard. The dev bar's own `registerDevTool` is likewise not exported from
// `@studio/ui/dev-bar`, so these register through the public `registerSlot` at the orders
// `DEV_TOOL_ORDER` already assigns them (offline 10, slow 20). Registering under those exact
// keys is what makes `PENDING_TOOLS` erase its own placeholders — see `dev-bar/tools.ts`.
//
// §19.6: this shifts what the CLIENT believes, never what the server does. There is no
// request either button can make the server treat differently.
import { useSyncExternalStore } from 'react'
import { registerSlot } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { forcedMode, onForcedModeChange, setForcedMode } from '@studio/core'
import type { NetworkMode } from '@studio/core'

/** Must equal `packages/ui/src/dev-bar/tools.ts`'s `DEV_TOOL_ORDER`. Duplicated rather than
 *  imported because that module is not on the package's export map; the two numbers are
 *  asserted equal by this feature's own slot test. */
const ORDER = { offline: 10, slow: 20 } as const

function useForced(): NetworkMode | null {
  return useSyncExternalStore(onForcedModeChange, forcedMode, () => null)
}

function Toggle({
  locale,
  mode,
  labelKey,
}: {
  locale: Locale
  mode: NetworkMode
  labelKey: string
}) {
  const active = useForced() === mode
  return (
    <button
      aria-pressed={active}
      data-testid={`dev-tool-${mode}`}
      // A toggle, not a switch: pressing the active one hands control back to the probes,
      // which is what a developer wants after checking the offline path — not a third
      // button labelled "back to normal".
      onClick={() => setForcedMode(active ? null : mode)}
      type="button"
    >
      {t(locale, labelKey)}
    </button>
  )
}

export function OfflineTool({ locale }: { locale: Locale }) {
  return <Toggle labelKey="attendance.network.offline" locale={locale} mode="offline" />
}

export function SlowTool({ locale }: { locale: Locale }) {
  return <Toggle labelKey="attendance.network.slow" locale={locale} mode="slow" />
}

export function registerAttendanceDevTools(): void {
  registerSlot<{ locale: Locale }>('dev-bar', {
    key: 'offline',
    order: ORDER.offline,
    render: OfflineTool,
  })
  registerSlot<{ locale: Locale }>('dev-bar', {
    key: 'slow',
    order: ORDER.slow,
    render: SlowTool,
  })
}
