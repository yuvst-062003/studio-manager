// This lane's `roster-row` fill. Conflict C2: M4's staff surface is real work with no screen of
// its own, so the whole of it is this one registration.
//
// Called once from the app's own entry, never at module import of a component file: a registration
// that happens on import registers twice under HMR and in any test that imports the barrel more
// than once. (`registerSlot` de-duplicates on key, which is a belt to this braces.)
//
// M5's `roster-row` container is merged and renders this fill; the integration test lives
// beside it (S1). The registration speaks the contract's prop shape —
// `BootstrapPayload.roster[].health_status` and `.derived_flags` — the seam both lanes
// agreed on before either started.
import { registerSlot } from '@studio/ui'
import type { RosterRow } from '@studio/core'
import type { Locale } from '@studio/i18n'
import { RosterHealthBadge } from './HealthBadge'

export function registerHealthSections(): void {
  // `RosterHealthBadge`, not `HealthBadge`: the container renders sections with the
  // contract's `{ row, locale }`, and registering a component whose props the slot
  // never supplies is how this fill shipped unable to render (S1).
  registerSlot<{ row: RosterRow; locale: Locale }>('roster-row', {
    key: 'health-badge',
    // Early: §5.5's ⚠ is the thing a coach must see before they read anything else on the row.
    order: 10,
    render: RosterHealthBadge,
  })
}
