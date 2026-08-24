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

export type SlotId = 'student-card' | 'roster-row' | 'alert-centre' | 'setup-wizard' | 'dev-bar'

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
  render: ComponentType<P>
}

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

export function useSlot<P = Record<string, unknown>>(slot: SlotId): readonly SlotEntry<P>[] {
  // TypeScript has no existential types, so re-widening the erased form needs the
  // double cast. It is sound because `registerSlot` is the only writer and it takes a
  // `SlotEntry<P>`: the props a container asks for are the props a lane registered.
  return (registry.get(slot) ?? []) as unknown as readonly SlotEntry<P>[]
}

/** Tests only. Module-level state outlives a test file without it. */
export function clearSlot(slot: SlotId): void {
  registry.delete(slot)
}
