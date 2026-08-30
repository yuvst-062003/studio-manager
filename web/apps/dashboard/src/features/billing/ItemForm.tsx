// Moved into the shared wizard package (2026-08-30) — the items step registers in both
// apps now, and the form is its editor. Re-exported so this lane's importers stay put.
export { BLANK_ITEM, ItemForm, draftFrom, sizesLabel, toInput, validateItem } from '@studio/ui'
export type { ItemDraft, ItemErrors } from '@studio/ui'
