// The six built-in presets, ported from `builtInTemplates` in
// `~/Downloads/staff-app/src/components/TimerView.tsx` — §4.5: "domain content... the part
// of this screen that took a judo coach to write rather than a designer", so every number
// below is copied as it stands, not rounded or "tidied".
//
// The prototype's `name`/`description` are literal Hebrew; here they are i18n keys into
// `timer.ts` (all three locales) — the one change this file makes to the prototype's data.
import type { BuiltInTimerPreset } from './types'

export const BUILT_IN_TIMER_PRESETS: readonly BuiltInTimerPreset[] = [
  {
    id: 'tabata',
    nameKey: 'timer.presets.tabata.name',
    descriptionKey: 'timer.presets.tabata.description',
    prepTime: 10,
    workTime: 20,
    restTime: 10,
    rounds: 8,
    sets: 1,
    breakBetweenSets: 60,
  },
  {
    id: 'randori',
    nameKey: 'timer.presets.randori.name',
    descriptionKey: 'timer.presets.randori.description',
    prepTime: 15,
    workTime: 240,
    restTime: 60,
    rounds: 5,
    sets: 1,
    breakBetweenSets: 120,
  },
  {
    id: 'warmup',
    nameKey: 'timer.presets.warmup.name',
    descriptionKey: 'timer.presets.warmup.description',
    prepTime: 10,
    workTime: 45,
    restTime: 15,
    rounds: 8,
    sets: 1,
    breakBetweenSets: 60,
  },
  {
    id: 'randori_session',
    nameKey: 'timer.presets.randoriSession.name',
    descriptionKey: 'timer.presets.randoriSession.description',
    prepTime: 15,
    workTime: 180,
    restTime: 45,
    rounds: 6,
    sets: 2,
    breakBetweenSets: 90,
  },
  {
    id: 'hiit',
    nameKey: 'timer.presets.hiit.name',
    descriptionKey: 'timer.presets.hiit.description',
    prepTime: 10,
    workTime: 45,
    restTime: 15,
    rounds: 6,
    sets: 2,
    breakBetweenSets: 90,
  },
  {
    id: 'uchikomi',
    nameKey: 'timer.presets.uchikomi.name',
    descriptionKey: 'timer.presets.uchikomi.description',
    prepTime: 10,
    workTime: 30,
    restTime: 30,
    rounds: 10,
    sets: 1,
    breakBetweenSets: 60,
  },
] as const
