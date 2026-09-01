// web/packages/ui/src/slots.ts — main only, authored once in M0.
//
// Seam 4. Five artboards are composed of sections owned by *different* verticals. A
// lane adds one file that calls registerSlot() at module load, plus one line in its own
// feature barrel; the container file is never reopened. Where a section needs data it
// reads a field the wave's contract commit already put in the payload — it never asks
// the container to fetch for it.
//
// This is what makes the M4 ∥ M5 pairing safe: the health badge on the attendance
// lane's roster row is a health-lane file registering into a slot, not a health-lane
// edit to an attendance-lane file.
//
// Nothing consumes this until M3. It lands in M0 so no lane has to author it, and so no
// lane invents a second one.
import type { ComponentType } from 'react'

// `parent-profile` was added in W5's contract commit, and is the only id not authored in
// M0. M9's data-export request row (§11.3) lands on parent `12i`, which is M3's
// `features/people/ProfileAndLeave.tsx` — and M9 does not own that directory. Without a slot
// the row could only arrive as a REPORTS-lane edit to a PEOPLE-lane file, which is the exact
// cross-lane edit seam 4 exists to prevent. Adding the id on `main`, before the worktrees,
// is the mechanism working as designed rather than an exception to it.
// `staff-alerts` was added by the completion run (S1). The staff app registered its
// conflict cards and at-risk alert into `alert-centre` — a container only the DASHBOARD
// mounts — and slots register inside the bundle that imports the barrel, so both fills
// could render in no app at all. The staff app now has its own alert container; the
// dashboard keeps `alert-centre`.
export type SlotId =
  | 'student-card'
  | 'roster-row'
  | 'alert-centre'
  | 'staff-alerts'
  | 'parent-profile'
  | 'setup-wizard'
  | 'dev-bar'

/**
 * A section a lane registered. `P` is the props the container passes — they come from
 * the wave's contract commit, so the section narrows them at its own boundary.
 *
 * The milestone plan writes `React.FC<any>`; `no-explicit-any` and `tsc --strict` both
 * reject that. `Record<string, unknown>` does not work either: props are contravariant,
 * so it rejects every component that declares a required prop. A generic does.
 */
export type SlotEntry<P = Record<string, unknown>> = {
  key: string
  order: number
  /**
   * Which FRAME of the container this section belongs in. Omitted means `'body'`, so
   * every lane that registered before regions existed still lands where it did.
   *
   * A container is rarely one list. Parent `2c` is a header and a ledger of rows: the
   * status chip belongs beside the name, the belt belongs in a row, and the two are owned
   * by different milestones. Without this the container could only place a section by
   * KNOWING it — `if (key === 'people-details')` — which is the single thing seam 4 exists
   * to prevent. The region moves that decision into the lane's own file, where the lane
   * already decides its `order`.
   *
   * Deliberately a plain string and not a union: the legal regions are a property of each
   * CONTAINER, not of the registry, and a union here would mean every container's frames
   * had to be declared in this file — the same coupling, one level up.
   */
  region?: string
  render: ComponentType<P>
}

/** Where an entry lands when its lane did not name a frame. */
const DEFAULT_REGION = 'body'

/**
 * The registry is heterogeneous — each slot carries its own props contract — so the
 * stored form is erased. This is the one unavoidable erasure; `registerSlot` and
 * `useSlot` are both fully typed at their boundaries, so no caller ever sees it.
 */
type ErasedEntry = SlotEntry<never>

const registry = new Map<SlotId, ErasedEntry[]>()

export function registerSlot<P>(slot: SlotId, entry: SlotEntry<P>): void {
  // Replace on key, so a module evaluated twice — HMR, or a test importing a feature
  // barrel more than once — does not render the same strip twice.
  const list = (registry.get(slot) ?? []).filter((e) => e.key !== entry.key)
  list.push(entry as ErasedEntry)
  list.sort((a, b) => a.order - b.order)
  registry.set(slot, list)
}

export function useSlot<P = Record<string, unknown>>(
  slot: SlotId,
  region?: string,
): readonly SlotEntry<P>[] {
  // TypeScript has no existential types, so re-widening the erased form needs the
  // double cast. It is sound because `registerSlot` is the only writer and it takes a
  // `SlotEntry<P>`: the props a container asks for are the props a lane registered.
  const entries = (registry.get(slot) ?? []) as unknown as readonly SlotEntry<P>[]
  // No region asked for means "every section", which is what a single-frame container
  // wants and what every caller written before regions existed already does.
  if (region === undefined) return entries
  return entries.filter((entry) => (entry.region ?? DEFAULT_REGION) === region)
}

/** Tests only. Module-level state outlives a test file without it. */
export function clearSlot(slot: SlotId): void {
  registry.delete(slot)
}
