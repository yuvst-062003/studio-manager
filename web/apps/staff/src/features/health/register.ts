// This lane's `roster-row` fill. Conflict C2: M4's staff surface is real work with no screen of
// its own, so the whole of it is this one registration.
//
// Called once from the app's own entry, never at module import of a component file: a registration
// that happens on import registers twice under HMR and in any test that imports the barrel more
// than once. (`registerSlot` de-duplicates on key, which is a belt to this braces.)
//
// **M5 owns the `roster-row` container and it is not merged yet.** This registers against the
// contract's prop shape — `BootstrapPayload.roster[].health_status` and `.derived_flags` — which
// is the seam both lanes agreed on before either started. The integration test belongs on the
// container and is deferred until it lands; the badge's own tests do not need it.
import { registerSlot } from "@studio/ui";
import { HealthBadge } from "./HealthBadge";
import type { HealthBadgeProps } from "./HealthBadge";

export function registerHealthSections(): void {
  registerSlot<HealthBadgeProps>("roster-row", {
    key: "health-badge",
    // Early: §5.5's ⚠ is the thing a coach must see before they read anything else on the row.
    order: 10,
    render: HealthBadge,
  });
}
