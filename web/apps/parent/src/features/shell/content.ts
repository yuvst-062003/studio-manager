// The shell's own strings: the four tab labels, and the two account controls the drawer
// used to be the only home for.
//
// **Pre-i18n, deliberately and temporarily** — the same arrangement the wizard's
// `content.ts` records. The project rule is that no Hebrew string lives in a component,
// and none does; these are simply not in `web/packages/i18n/he/*.ts` yet. Build-order
// step 6 of docs/plan/prompts/redesign-parent-app.md moves every ported screen's strings
// there at once and writes the en and ru mirrors, so keeping them in one module per
// feature makes that a file move rather than a hunt through JSX. Nothing here may be
// inlined into a component in the meantime.
//
// Sign-out and the studio switcher are the exception and are NOT listed here:
// `common.nav.signOut` and `common.nav.studioSwitcher` already exist in @studio/i18n,
// already have their en and ru mirrors, and re-typing either locally would create a second
// Hebrew spelling of a shipped string for step 6 to reconcile.

/** The four tabs, in the prototype's own order. First is rightmost in an RTL document. */
export const TAB_LABELS = {
  home: 'בית',
  shop: 'חנות המועדון',
  updates: 'עדכונים',
  profile: 'פרופיל',
} as const

/** The tab bar's accessible name — a landmark needs one, and "navigation" is not it. */
export const TAB_BAR_LABEL = 'ניווט ראשי'
