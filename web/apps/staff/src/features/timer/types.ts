// Shared shapes for the training timer tab — §4.5 of
// docs/superpowers/specs/2026-09-06-staff-app-redesign.md. No backend, no model, no
// migration: a coach's own presets live on their phone (decision 2), so every type here
// is local to this app.

/** Prep -> work -> rest, repeated for `rounds`; then a break between sets, repeated for
 *  `sets`; then finished. Matches the prototype's own phase names (`setRest` for the
 *  break between sets) so `~/Downloads/staff-app/src/components/TimerView.tsx` and this
 *  port can be compared line for line. */
export type TimerPhase = 'prep' | 'work' | 'rest' | 'setRest' | 'finished'

/** The six numbers a preset carries. Seconds throughout, matching the prototype. */
export type TimerSettings = {
  prepTime: number
  workTime: number
  restTime: number
  rounds: number
  sets: number
  breakBetweenSets: number
}

/** A built-in preset. Its name and description are i18n KEYS, not literal Hebrew — "their
 *  Hebrew names go into the i18n bundles like every other string" (§4.5) — so this shape
 *  carries `nameKey`/`descriptionKey` rather than the prototype's plain `name`/
 *  `description` strings. */
export type BuiltInTimerPreset = TimerSettings & {
  id: string
  nameKey: string
  descriptionKey: string
}

/** A coach's own preset, saved on the device. Its name is text a coach typed, not a
 *  translation key — there is nothing to translate. */
export type CustomTimerPreset = TimerSettings & {
  id: string
  name: string
  isCustom: true
  /** ISO instant, for a stable sort — key-sorted storage order is not creation order. */
  createdAt: string
}

/** What the screen renders in its preset strip: either kind, discriminated on
 *  `isCustom`. */
export type TimerPreset = BuiltInTimerPreset | CustomTimerPreset

export function isCustomPreset(preset: TimerPreset): preset is CustomTimerPreset {
  return 'isCustom' in preset && preset.isCustom === true
}
