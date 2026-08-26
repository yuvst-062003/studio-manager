// The `events` namespace, asserted from the lane that consumes it.
//
// Two kinds of assertion, and the second is the one that will still matter in a year.
//
// POSITIVE — the composed strings twelve artboards need exist. `t()` returns the key
// itself when it is missing, so a gap ships as a screen with `events.roster.title` printed
// on it: visible, but visible as what looks like a data bug rather than a missing
// translation.
//
// NEGATIVE — D9.2's cut and the plan's cut list stay cut. `app/schemas/events.py` and this
// namespace's own docstring both say the same thing: adding the key is how the cut quietly
// comes back. A weight column returns as `roster.columnWeight` long before anyone proposes
// reinstating weight categories.
//
// Imported through `bundles` rather than by subpath: `@studio/i18n`'s package.json exports
// exactly `"."`, deliberately, so the namespace list has one door.
import { describe, expect, it } from 'vitest'
import { bundles } from '@studio/i18n'

const he = bundles.he.events
const en = bundles.en.events
const ru = bundles.ru.events

const REQUIRED = [
  // 7a / 9i / 12h — list chrome the audits found missing
  'list.subtitle',
  'list.filterAll',
  'list.needsAttention',
  // 7a finding 1 — the draft is the one status with a consequence outside the club, and
  // the artboard gives it the plainest treatment of the four.
  'status.draftWhy',
  // 7c / 9i — the existing rsvp.* keys are per-student and singular; these are aggregates.
  'counts.confirmed',
  'counts.awaitingConsent',
  'counts.attended',
  // 7c — the participants table (D9.2: six columns, none of them weight)
  'roster.title',
  'roster.columnConsent',
  'roster.columnPayment',
  'roster.notApplicable',
  'roster.sendConsentForm',
  // 7b findings 2 and 8 — a required field with no input, on a form that never errors
  'form.required',
  'form.blank',
  'form.errorTitle',
  'form.saved',
  'form.edit',
  // 7d / 12h finding 7 — every rsvp key is third-person and every screen string is second
  'rsvp.awaitingYourAnswer',
  'rsvp.youConfirmed',
  'rsvp.youDeclined',
  // 9d / 4d / 6b — the exam
  'exam.new',
  'exam.save',
  'exam.tenureAtRank',
  'exam.readiness',
  'exam.ready',
  'exam.confirmPromotion',
  'exam.promoted',
  // 5b / 5d — the belt system
  'belt.edit',
  'belt.save',
  'belt.preview',
  'belt.moveUp',
  'belt.moveDown',
  'belt.deleteHeld',
  'belt.holders',
  'belt.presetTitle',
  'belt.presetScratch',
  'belt.presetRankCount',
  // 12d
  'belt.ordinalOfTotal',
  'belt.progressCaption',
]

// D9.2 and the plan's cut list. Substrings rather than exact keys, because a cut comes
// back as a key NEAR the one that was cut rather than as the same one.
const FORBIDDEN = [
  'weight',
  'category',
  'medal',
  'capacity',
  'transport',
  'makeup',
  'federation',
  'invitationssent',
  'minattendance',
  'debtblock',
]

describe('the events namespace', () => {
  it.each(REQUIRED)('carries %s in every locale', (key) => {
    for (const [name, bundle] of [
      ['he', he],
      ['en', en],
      ['ru', ru],
    ] as const) {
      expect(bundle[key], `${name}.${key}`).toBeTruthy()
    }
  })

  it('has exactly the same key set in all three locales', () => {
    // The parity script reports `ru` rather than failing on it (SPEC §15 item 9 is still
    // outstanding), but an ORPHAN key — one in `ru` and not in `he` — is a hard error
    // there and a bug here. Asserted both directions.
    expect(Object.keys(en).sort()).toEqual(Object.keys(he).sort())
    expect(Object.keys(ru).sort()).toEqual(Object.keys(he).sort())
  })

  it.each(FORBIDDEN)('never grows a %s key', (word) => {
    const hit = Object.keys(he).filter((key) => key.toLowerCase().includes(word))
    expect(hit, `D9.2 / the cut list: ${word} is cut`).toEqual([])
  })

  it('never states an eligibility criterion §5.9 does not have', () => {
    // Five artboards gate a promotion on an attendance percentage and two add a debt or a
    // missing-declaration block. `events.exam.eligibleHint` — the string that ships — says
    // rank and time held, and `belt_rank` has no column for a threshold. A key here is how
    // the criterion arrives without a column to store it in.
    const values = Object.values(he).join(' ')
    expect(values).not.toMatch(/%/)
    expect(values).not.toMatch(/חוב/)
  })
})
