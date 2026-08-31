/**
 * What each token in tokens.css is FOR. The CSS holds values; this holds meaning.
 *
 * Why the split. D8 retired three greys because a ratio nobody re-computes rots the
 * first time someone tweaks a hex. A comment saying "4.88:1" is exactly that kind of
 * rot. This table plus tokens.audit.test.ts makes the audit structural instead: a token
 * with no role fails the build, a role with no token fails the build, and every
 * obligation is recomputed from the live values on every test run.
 *
 * ── A documented reading of D2 ────────────────────────────────────────────────────
 * D2 lists three tiers: Brand (logo, one primary hue, derived on-colour), Semantic
 * (debt · paid · pending · cancelled · danger · focus ring) and Structural (type scale,
 * spacing, radii, density, motion, component shape).
 *
 * The neutral palette — ground, surface, fg, secondary/muted text, borders, accent —
 * appears in none of those three lists. It is classified here as **structural**, grouped
 * as `palette`. The classification carries no behavioural consequence, because semantic
 * and structural are both *never overridable*; a fourth tier would contradict D2's "the
 * tiers are not negotiable". Recorded so a later reader does not think it was overlooked.
 *
 * ── Belt colours are deliberately absent ──────────────────────────────────────────
 * `belt_rank.color_hex` is per-studio data (D3, SPEC §5.9), not a token. BeltBar takes a
 * hex prop. The token layer owns only `--belt-ring` and `--belt-ring-width` (D7).
 */

export const TIERS = ['brand', 'semantic', 'structural'] as const
export type Tier = (typeof TIERS)[number]

/**
 * Every background a token may be rendered on. An obligation names the grounds it is
 * measured against, so a chip whose text sits on a tinted fill is audited against that
 * tint rather than against the card it happens to be sitting in.
 */
export const GROUND_TOKENS = [
  '--ground',
  '--surface',
  '--fg',
  '--emphasis',
  '--accent',
  '--brand-primary',
  '--debt-tint',
  '--danger-tint',
  '--cancelled-tint',
  '--disabled-surface',
] as const
export type GroundToken = (typeof GROUND_TOKENS)[number]

export type Obligation =
  /** WCAG SC 1.4.3 — normal-size body text. 4.5:1 against each named ground. */
  | { kind: 'text'; on: readonly GroundToken[] }
  /** WCAG SC 1.4.11 — graphical objects and control boundaries. 3:1. */
  | { kind: 'non-text'; on: readonly GroundToken[] }
  /** The token IS a background. Other tokens are measured against it. */
  | { kind: 'ground' }
  /** Exempt, and the reason must name the success criterion that grants the exemption. */
  | { kind: 'exempt'; why: string }
  /** Carries no colour at all — a length, a weight, a duration. */
  | { kind: 'none' }

export type TokenRole = {
  tier: Tier
  /** Sub-grouping within the tier, for humans reading the table. */
  group: 'palette' | 'status' | 'type' | 'space' | 'radius' | 'shape' | 'motion'
  obligation: Obligation
  note: string
}

const ON_GROUNDS = ['--ground', '--surface'] as const

const NO_COLOUR: Obligation = { kind: 'none' }

export const TOKEN_ROLES: Record<string, TokenRole> = {
  // ═══ TIER 1 · BRAND ═════════════════════════════════════════════════════════════
  '--brand-primary': {
    tier: 'brand',
    group: 'palette',
    obligation: { kind: 'non-text', on: ON_GROUNDS },
    note: 'D1 — a studio may upload a logo in v1 but cannot set a colour. Fixed until v2.',
  },
  '--brand-on-primary': {
    tier: 'brand',
    group: 'palette',
    obligation: { kind: 'text', on: ['--brand-primary'] },
    note: 'D2 — the derived on-colour. v2 validates this pair at the moment the hue is set.',
  },

  // ═══ TIER 2 · SEMANTIC — never overridable (D2) ═════════════════════════════════
  '--debt': {
    tier: 'semantic',
    group: 'status',
    obligation: { kind: 'text', on: [...ON_GROUNDS, '--debt-tint'] },
    note: 'The parent app’s most important alert. D2 exists so branding cannot swallow it.',
  },
  '--debt-tint': {
    tier: 'semantic',
    group: 'status',
    obligation: { kind: 'ground' },
    note: 'The debt chip’s fill. A ground, so --debt is audited against it.',
  },
  '--paid': {
    tier: 'semantic',
    group: 'status',
    obligation: { kind: 'text', on: ON_GROUNDS },
    note: 'Artboard 4h’s שולם chip is outline-only, so the text sits on the plain card.',
  },
  '--pending': {
    tier: 'semantic',
    group: 'status',
    obligation: { kind: 'text', on: ON_GROUNDS },
    note: 'Also the לא סומן dashed chip and the two unresolved attendance marks.',
  },
  '--cancelled': {
    tier: 'semantic',
    group: 'status',
    obligation: { kind: 'text', on: [...ON_GROUNDS, '--cancelled-tint'] },
    note: 'Artboard 4h renders בוטל in #7a766d, which D8 retired outright. This supersedes it.',
  },
  '--cancelled-tint': {
    tier: 'semantic',
    group: 'status',
    obligation: { kind: 'ground' },
    note: 'The cancelled chip’s fill.',
  },
  '--danger': {
    tier: 'semantic',
    group: 'status',
    obligation: { kind: 'text', on: [...ON_GROUNDS, '--danger-tint'] },
    note: 'Destructive actions, field errors, the alert banner.',
  },
  '--danger-tint': {
    tier: 'semantic',
    group: 'status',
    obligation: { kind: 'ground' },
    note: 'The alert banner’s ground.',
  },
  '--focus-ring': {
    tier: 'semantic',
    group: 'status',
    obligation: { kind: 'non-text', on: ON_GROUNDS },
    note: 'SC 1.4.11 — the focus indicator is a graphical object, not text.',
  },

  // ═══ TIER 3 · STRUCTURAL · palette ══════════════════════════════════════════════
  '--ground': {
    tier: 'structural',
    group: 'palette',
    obligation: { kind: 'ground' },
    note: 'D3 — the page. #f7f5f1 by design; D8 forbids lightening it to fix a grey.',
  },
  '--surface': {
    tier: 'structural',
    group: 'palette',
    obligation: { kind: 'ground' },
    note: 'Cards. Artboard 4h’s eight panels.',
  },
  '--fg': {
    tier: 'structural',
    group: 'palette',
    obligation: { kind: 'text', on: ON_GROUNDS },
    note: 'Ink. Also the primary button and toast fill, hence --on-fg.',
  },
  '--on-fg': {
    tier: 'structural',
    group: 'palette',
    obligation: { kind: 'text', on: ['--fg'] },
    note: 'Text on an ink fill: primary button, toast, active segment.',
  },
  '--emphasis': {
    tier: 'structural',
    group: 'palette',
    // Both obligations apply and the stricter one is stated: the fill is a control
    // boundary (SC 1.4.11, 3:1), but it is also what --on-emphasis is measured against,
    // which needs it declared as a ground. `ground` is the kind that carries that, and
    // its 3:1 duty is covered because every value it takes is also --fg or --accent,
    // both of which are audited as text at 4.5:1 on the same two grounds.
    obligation: { kind: 'ground' },
    note: 'The fill of an emphasis control — primary button, selected segment, toast, progress fill, switch knob. Equal to --fg on the inward surface; the club’s brand on the outward one.',
  },
  '--on-emphasis': {
    tier: 'structural',
    group: 'palette',
    obligation: { kind: 'text', on: ['--emphasis'] },
    note: 'Text on an emphasis fill. Split from --on-fg for the same reason --emphasis is split from --fg.',
  },
  '--text-secondary': {
    tier: 'structural',
    group: 'palette',
    obligation: { kind: 'text', on: ON_GROUNDS },
    note: 'Sublines, belt labels, inactive segment.',
  },
  '--text-muted': {
    tier: 'structural',
    group: 'palette',
    obligation: { kind: 'text', on: ON_GROUNDS },
    note: 'D8’s floor in light mode. Card captions, placeholders.',
  },
  '--border': {
    tier: 'structural',
    group: 'palette',
    obligation: {
      kind: 'exempt',
      why: 'SC 1.4.11 covers boundaries needed to identify a control; a decorative hairline divider is not one. D3’s restrained register depends on it staying faint.',
    },
    note: 'Card and divider hairline.',
  },
  '--border-strong': {
    tier: 'structural',
    group: 'palette',
    obligation: { kind: 'non-text', on: ON_GROUNDS },
    note: 'SC 1.4.11 — the boundary of an interactive control. This is the token that must reach 3:1.',
  },
  '--accent': {
    tier: 'structural',
    group: 'palette',
    obligation: { kind: 'text', on: ON_GROUNDS },
    note: 'D3’s one deep accent. Also the switch-on track.',
  },
  '--on-accent': {
    tier: 'structural',
    group: 'palette',
    obligation: { kind: 'text', on: ['--accent'] },
    note: 'Text on an accent fill.',
  },
  '--disabled-surface': {
    tier: 'structural',
    group: 'palette',
    obligation: { kind: 'ground' },
    note: 'The disabled button fill.',
  },
  '--scrim': {
    tier: 'structural',
    group: 'palette',
    // SC 1.4.11 is about the contrast of a component's own boundary against what is
    // ADJACENT to it. A scrim has no boundary and identifies nothing; it exists to reduce
    // the legibility of what is behind it, so a minimum-contrast obligation would be
    // measuring the opposite of its purpose. Its accessibility burden is carried instead by
    // the dialog's `aria-modal` and its focus trap, which is where modality is actually
    // announced.
    obligation: {
      kind: 'exempt',
      why: 'SC 1.4.11 covers boundaries that identify a component; a scrim identifies none.',
    },
    note: 'Modal overlay. Was USED and never DEFINED until W6 — `background` does not inherit, so it resolved to transparent and the nav drawer opened with no scrim at all.',
  },
  '--surface-raised': {
    tier: 'structural',
    group: 'palette',
    obligation: { kind: 'ground' },
    note: 'A surface above --surface: popovers, sheets, preview cards. In dark mode it goes LIGHTER than --surface, because elevation in dark mode is light.',
  },
  '--belt-ring': {
    tier: 'structural',
    group: 'shape',
    obligation: { kind: 'non-text', on: ON_GROUNDS },
    note: 'D7/G10 — the 1px ring every belt bar carries. It rescues white-on-light and black-on-dark.',
  },

  // ═══ TIER 3 · STRUCTURAL · type ═════════════════════════════════════════════════
  // Artboard 4h declares "Rubik 400/500/600"; G14 requires the family carry 300-700, so
  // all five weights are named here even though 4h reaches for three.
  '--text-micro': { tier: 'structural', group: 'type', obligation: NO_COLOUR, note: '11px — belt swatch labels, the smallest text on 4h.' },
  '--text-caption': { tier: 'structural', group: 'type', obligation: NO_COLOUR, note: '12px — card captions, chips, sublines, field helper text.' },
  '--text-label': { tier: 'structural', group: 'type', obligation: NO_COLOUR, note: '13px — control labels, segments, alert body.' },
  '--text-body': { tier: 'structural', group: 'type', obligation: NO_COLOUR, note: '14px — buttons, inputs, toast, prose.' },
  '--text-title': { tier: 'structural', group: 'type', obligation: NO_COLOUR, note: '15px — list-row names, section titles.' },
  '--text-display': { tier: 'structural', group: 'type', obligation: NO_COLOUR, note: '24px — page titles.' },
  '--text-hero': { tier: 'structural', group: 'type', obligation: NO_COLOUR, note: 'L2 — landing hero headline. Fluid 36px→52px (13a at 390, 13c at 1440), clamp so one component serves both.' },
  '--leading-tight': { tier: 'structural', group: 'type', obligation: NO_COLOUR, note: '1 — single-line controls.' },
  '--leading-snug': { tier: 'structural', group: 'type', obligation: NO_COLOUR, note: '1.2 — list-row names.' },
  '--leading-normal': { tier: 'structural', group: 'type', obligation: NO_COLOUR, note: '1.4 — alert body.' },
  '--leading-relaxed': { tier: 'structural', group: 'type', obligation: NO_COLOUR, note: '1.5 — prose.' },
  '--weight-light': { tier: 'structural', group: 'type', obligation: NO_COLOUR, note: 'G14 — 300. Present in the family; 4h does not use it.' },
  '--weight-regular': { tier: 'structural', group: 'type', obligation: NO_COLOUR, note: 'G14 — 400.' },
  '--weight-medium': { tier: 'structural', group: 'type', obligation: NO_COLOUR, note: 'G14 — 500. 4h’s workhorse for labels and chips.' },
  '--weight-semibold': { tier: 'structural', group: 'type', obligation: NO_COLOUR, note: 'G14 — 600. Page titles.' },
  '--weight-bold': { tier: 'structural', group: 'type', obligation: NO_COLOUR, note: 'G14 — 700. Present in the family; 4h does not use it.' },

  // ═══ TIER 3 · STRUCTURAL · space (4h declares a 4px unit) ═══════════════════════
  '--space-1': { tier: 'structural', group: 'space', obligation: NO_COLOUR, note: '4px — the unit 4h names.' },
  '--space-2': { tier: 'structural', group: 'space', obligation: NO_COLOUR, note: '8px' },
  '--space-3': { tier: 'structural', group: 'space', obligation: NO_COLOUR, note: '12px' },
  '--space-4': { tier: 'structural', group: 'space', obligation: NO_COLOUR, note: '16px — the card grid gap on 4h.' },
  '--space-5': { tier: 'structural', group: 'space', obligation: NO_COLOUR, note: '20px' },
  '--space-6': { tier: 'structural', group: 'space', obligation: NO_COLOUR, note: '24px' },
  '--space-8': { tier: 'structural', group: 'space', obligation: NO_COLOUR, note: '32px — the artboard padding on 4h.' },
  '--control-pad-block': { tier: 'structural', group: 'space', obligation: NO_COLOUR, note: '11px — button and field block padding on 4h.' },
  '--control-pad-inline': { tier: 'structural', group: 'space', obligation: NO_COLOUR, note: '18px — button inline padding on 4h.' },
  '--field-pad-inline': { tier: 'structural', group: 'space', obligation: NO_COLOUR, note: '12px — field inline padding on 4h.' },

  // ═══ TIER 3 · STRUCTURAL · radius (4h declares 9/11/14) ═════════════════════════
  '--radius-xs': { tier: 'structural', group: 'radius', obligation: NO_COLOUR, note: '3px — belt bar.' },
  '--radius-sm': { tier: 'structural', group: 'radius', obligation: NO_COLOUR, note: '6px — checkbox.' },
  '--radius-md': { tier: 'structural', group: 'radius', obligation: NO_COLOUR, note: '9px — buttons, fields, segmented track. One of 4h’s three declared corners.' },
  '--radius-lg': { tier: 'structural', group: 'radius', obligation: NO_COLOUR, note: '11px — list rows, toast, alert. Declared by 4h.' },
  '--radius-xl': { tier: 'structural', group: 'radius', obligation: NO_COLOUR, note: '14px — cards. Declared by 4h.' },
  '--radius-pill': { tier: 'structural', group: 'radius', obligation: NO_COLOUR, note: '999px — status chips. Outside 4h’s declared 9/11/14, which is worth knowing.' },
  '--radius-circle': { tier: 'structural', group: 'radius', obligation: NO_COLOUR, note: '50% — radio, switch knob. Also outside the declared scale.' },

  // ═══ TIER 3 · STRUCTURAL · shape and motion ═════════════════════════════════════
  '--border-width-hairline': { tier: 'structural', group: 'shape', obligation: NO_COLOUR, note: '1px' },
  '--border-width-strong': { tier: 'structural', group: 'shape', obligation: NO_COLOUR, note: '1.5px — a focused field, a secondary button.' },
  '--belt-ring-width': { tier: 'structural', group: 'shape', obligation: NO_COLOUR, note: 'D7 says 1px exactly. A token so no component can quietly drop it to 0.' },
  '--motion-fast': { tier: 'structural', group: 'motion', obligation: NO_COLOUR, note: '120ms — a switch knob, a chip.' },
  '--motion-base': { tier: 'structural', group: 'motion', obligation: NO_COLOUR, note: '200ms — a toast, a panel.' },
  '--ease-standard': { tier: 'structural', group: 'motion', obligation: NO_COLOUR, note: 'The one easing curve.' },
}
