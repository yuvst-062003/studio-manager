// §19.4's four tools, registered through the 'dev-bar' slot that M0.2 authored.
//
// Seam 4's whole point: M5 fills `offline`/`slow` and M6/M8 fill `runJob` by adding
// ONE file that calls registerDevTool() at module load. The container is never
// reopened.
//
// Pending tools are declarative rather than registered. If a placeholder registered
// itself into the slot, whether M5's real tool replaced it or it overwrote M5's tool
// would depend on module evaluation order — a race with no error message. Instead the
// container consults PENDING_TOOLS only for keys nothing has registered, so a lane's
// registration wins unconditionally and the placeholder erases itself.
import type { ComponentType } from 'react'
import type { Locale } from '@studio/i18n'
import { registerSlot, useSlot } from '../slots'

export type DevToolKey = 'offline' | 'slow' | 'timeTravel' | 'runJob' | 'resetDemo' | 'simulateIpn'

export type DevToolProps = { locale: Locale }

/** §19.4's layout order: [📴 offline] [🐌 slow] [⏩ +1 month] [↺ reset] [simulate IPN ▾]. */
export const DEV_TOOL_ORDER: Record<DevToolKey, number> = {
  offline: 10,
  slow: 20,
  timeTravel: 30,
  resetDemo: 35,
  runJob: 40,
  simulateIpn: 50,
}

/** The tools §19.5 specifies and this milestone does not build, and who builds them. */
export const PENDING_TOOLS = [
  { key: 'offline', milestone: 'M5', labelKey: 'common.dev.tool.offline' },
  { key: 'slow', milestone: 'M5', labelKey: 'common.dev.tool.slow' },
  { key: 'runJob', milestone: 'M6', labelKey: 'common.dev.tool.runJob' },
] as const satisfies readonly { key: DevToolKey; milestone: string; labelKey: string }[]

export function registerDevTool(key: DevToolKey, render: ComponentType<DevToolProps>): void {
  registerSlot<DevToolProps>('dev-bar', { key, order: DEV_TOOL_ORDER[key], render })
}

/** The keys currently registered, in slot order. */
export function devToolKeys(): readonly DevToolKey[] {
  // useSlot is a plain Map read (see slots.ts), not a real hook -- its name predates
  // this call site. eslint-plugin-react-hooks can't tell the two apart from the name.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useSlot<DevToolProps>('dev-bar').map((entry) => entry.key as DevToolKey)
}
