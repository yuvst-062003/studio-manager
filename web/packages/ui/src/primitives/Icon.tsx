// The canvas's stroke icon set, as one component. Every artboard draws its iconography as
// 24-viewBox stroke paths — 1.7px, round caps, currentColor — and the shipped apps had no
// icons at all, which is half of why every screen read as scaffolding beside its artboard
// (ship-audit design pass). Paths are traced from the canvas's own SVGs (DashNav.dc.html
// and the tab bars of 1a/9a); the handful the canvas only implies (search, menu, home)
// are drawn in the same grammar.
//
// currentColor on purpose: an icon is text-colored wherever it sits — an active tab, a
// muted nav item, an ink button — so no icon ever carries its own color decision.
import type { CSSProperties } from 'react'

export type IconName = keyof typeof PATHS

/** Each entry is the <path>/<shape> children of one 24×24 stroke icon. */
const PATHS = {
  home: (
    <>
      <path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M9 21v-8h6v8" />
    </>
  ),
  payments: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20" />
    </>
  ),
  // Added for `ImagePicker` (2026-09-10). The owner asked for "an empty square you can
  // press, with a picture icon" in place of the browser's own `Choose File` button, and
  // the set had no picture glyph. Drawn in the same grammar as the rest -- 24 viewBox,
  // stroke, round caps -- rather than reaching for Material Symbols, which §4 rule 11 of
  // the dashboard redesign excludes as a new dependency and a CDN font on first paint.
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0L16 17" />
      <path d="m14 14.5 1.6-1.6a2 2 0 0 1 2.8 0L20 14.5" />
    </>
  ),
  messages: (
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
  ),
  profile: (
    <>
      <circle cx="12" cy="7" r="3.6" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2.5" />
      <path d="M3 9h18" />
      <path d="M8 2v4" />
      <path d="M16 2v4" />
    </>
  ),
  attendance: (
    <>
      <path d="M9 11.5 11 13.5 15.5 9" />
      <rect x="3" y="4" width="18" height="17" rx="2.5" />
    </>
  ),
  students: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 20c0-3.5 3.2-5.5 7-5.5s7 2 7 5.5" />
      <path d="M17 8h5" />
    </>
  ),
  groups: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1.6" />
      <rect x="14" y="14" width="7" height="7" rx="1.6" />
    </>
  ),
  events: (
    <>
      <path d="M12 3v4" />
      <path d="M8.5 7h7l1.5 4a5 5 0 0 1-10 0Z" />
      <path d="M12 15v6" />
      <path d="M8 21h8" />
    </>
  ),
  belts: (
    <>
      <path d="M3 10h18" />
      <path d="M3 14h18" />
      <path d="M7 4v16" />
    </>
  ),
  documents: (
    <>
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v5h5" />
    </>
  ),
  reports: (
    <>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.5.55.87 1.06 1H21a2 2 0 1 1 0 4h-.09c-.51.13-.92.5-1.06 1Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  menu: (
    <>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </>
  ),
  warning: (
    <>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  sync: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  // A selected state needs a mark that is not a colour (D — never colour alone), and the
  // set had no tick: every selected control in the product was carrying its state in the
  // fill alone. Same 24x24 stroke grid as the rest.
  check: <path d="M20 6 9 17l-5-5" />,
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  // -- the class/group set (2026-09-10) -------------------------------------------------
  // The prototype gives every group card a pictogram for its discipline and puts a small
  // icon beside each fact in the card's well. The set had neither, so a card's three facts
  // read as three unlabelled lines. Same 24x24 stroke grid, same grammar as the rest.
  //
  // `martialArts` is the DEFAULT a class gets when its discipline names nothing we draw —
  // this is a judo club, and a club that types 'קרב מגע' should still get a mark rather
  // than a hole.
  martialArts: (
    <>
      <path d="M7 4a2 2 0 1 1 4 0 2 2 0 0 1-4 0Z" />
      <path d="M9 8v4l-3 3 2 5" />
      <path d="M9 12h4l4-3" />
      <path d="m13 12 2 4-2 4" />
    </>
  ),
  fitness: (
    <>
      <path d="M4 9v6" />
      <path d="M20 9v6" />
      <path d="M7 6v12" />
      <path d="M17 6v12" />
      <path d="M7 12h10" />
    </>
  ),
  pool: (
    <>
      <path d="M2 17c1.5 0 1.5 1.2 3 1.2s1.5-1.2 3-1.2 1.5 1.2 3 1.2 1.5-1.2 3-1.2 1.5 1.2 3 1.2 1.5-1.2 3-1.2" />
      <path d="M7 15V6a2 2 0 0 1 4 0" />
      <path d="M13 15V6a2 2 0 0 1 4 0" />
      <path d="M7 10h6" />
    </>
  ),
  ball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3c3 3 3 15 0 18" />
      <path d="M12 3c-3 3-3 15 0 18" />
      <path d="M3.5 9h17" />
      <path d="M3.5 15h17" />
    </>
  ),
  // The three facts on a group card, in the prototype's own order.
  location: (
    <>
      <path d="M20 10c0 5-8 12-8 12s-8-7-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  whistle: (
    <>
      <path d="M13 8h7a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-7" />
      <circle cx="8" cy="12" r="5" />
      <path d="M8 5V3" />
    </>
  ),
  // The three the add-students screen needed and the set did not have (2026-09-13): an
  // envelope for the account a trainee signs in through, and a pencil and a bin for the
  // two actions on a trainee's row. Drawn in the same grammar as everything above -- 24
  // viewBox, stroke, round caps -- rather than reaching for an icon font, which the
  // dashboard redesign excludes as a new dependency and a CDN request on first paint.
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.5 7 7.3 5.4a2 2 0 0 0 2.4 0L20.5 7" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7.5 18.5 3.5 19.5l1-4Z" />
    </>
  ),
  trash: (
    <>
      <path d="M3.5 6.5h17" />
      <path d="M9 6.5V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="m5.5 6.5 1 13a1.5 1.5 0 0 0 1.5 1.4h8a1.5 1.5 0 0 0 1.5-1.4l1-13" />
    </>
  ),
} as const

export function Icon({
  name,
  size = 18,
  style,
}: {
  name: IconName
  /** Box size in px. The canvas draws nav icons at 18 and tab-bar icons at 20. */
  size?: number
  style?: CSSProperties
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      // Decorative by contract: every control that uses an icon also carries text or an
      // aria-label of its own, so the pictogram never has to speak.
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      {PATHS[name]}
    </svg>
  )
}
