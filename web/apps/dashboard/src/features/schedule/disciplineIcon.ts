// Which pictogram a class — and therefore each of its groups — is drawn with.
//
// The prototype gives every group card an icon chosen from its `discipline`
// (`sports_martial_arts` · `fitness_center` · `pool` · `sports_mma`), which is one of the
// things that makes its grid readable at a glance and ours read as a list of boxes. Ours
// maps the same way, off the real `class.discipline` column rather than off §4 rule 6's
// multi-sport model.
//
// **`martialArts` is the default, not a fallback to nothing.** A club that types קרב מגע,
// or nothing at all, still gets a mark: this is a judo club, and an empty badge on every
// card would be worse than one honest default. The icon is decorative in every place it is
// used — the class's name is always beside it — so a wrong guess costs a reader nothing.
import type { IconName } from '@studio/ui'

/** Matched on the word rather than an enum: `discipline` is free text a manager types. */
const BY_WORD: { test: RegExp; icon: IconName }[] = [
  { test: /judo|ג.?ודו|karate|קרטה|bjj|mma|קרב|אגרוף|box/i, icon: 'martialArts' },
  { test: /fit|cross|כושר|כוח|gym|התעמלות/i, icon: 'fitness' },
  // `שחיה` and `שחייה` are both written, hence `י{1,2}` — a character class matches one
  // character and would have missed the spelling most people use.
  { test: /swim|שחי{1,2}ה|pool|בריכה/i, icon: 'pool' },
  { test: /ball|כדור|soccer|basket/i, icon: 'ball' },
]

export function disciplineIcon(discipline: string | null | undefined): IconName {
  if (!discipline) return 'martialArts'
  return BY_WORD.find((entry) => entry.test.test(discipline))?.icon ?? 'martialArts'
}
