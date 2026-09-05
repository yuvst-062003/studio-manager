// A student's status → the tone its chip wears.
//
// Extracted from `ProfileAndLeave` when the redesign deleted that screen. It was never
// really that screen's: `DetailsSection` renders inside the STUDENT CARD, which outlived
// the profile arrangement it happened to be written beside, and a live component importing
// from a deleted one is how a dead file stays alive forever.
//
// `ChipStatus` has no `trial` member and @studio/ui is not this lane's to change, so the
// tone is the nearest honest one and the LABEL carries the meaning — which is also SC
// 1.4.1's rule: never colour alone.
export function chipToneFor(status: string): 'paid' | 'pending' | 'cancelled' | 'planned' {
  if (status === 'active') return 'paid'
  if (status === 'left' || status === 'lost') return 'cancelled'
  if (status === 'frozen') return 'planned'
  return 'pending'
}
