# M0.3 — The Design System: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn M0.1's token *seed* into the design system every one of the other 60 artboards sits on — D2's three tiers, separate light and dark sets, Rubik's five weights, a user-settable Light/Dark/System control on all three apps, and the UI primitives artboard `4h` defines — with the D7 and D8 contrast floors asserted by executable tests rather than by comments.

**Architecture:** The load-bearing idea is that **the contrast floors become a test that enumerates the token layer, not a test that spot-checks it**. `tokens.roles.ts` classifies every custom property by tier, role and contrast obligation; `contrast.ts` computes WCAG 2.x relative-luminance ratios; `contrast.test.ts` asserts a bijection between the roles table and `tokens.css` in *both* blocks, then asserts each token's obligation against every ground it can sit on. A token added without a role fails the build, and a role without a token fails the build — so the audit cannot silently stop covering the palette, which is the exact failure mode a ratio written in a comment has. Belt colours are deliberately *not* tokens: `belt_rank.color_hex` is per-studio data (D3, §5.9), so `BeltBar` takes a hex prop and the token layer owns only `--belt-ring`. Primitives live one-per-file under `packages/ui/src/primitives/`, take their text as props (G4 is lint-enforced in `apps/` only), and each ships a test that renders it in `he`/RTL and `en`/LTR under both themes.

**Tech Stack:** React 19 · TypeScript 5.9 (strict) · Vite 8 · vitest 4 + Testing Library + jsdom · ESLint 10 + typescript-eslint 8 · stylelint 17 · CSS custom properties, no CSS-in-JS runtime · `@fontsource-variable/rubik`, self-hosted · Workbox precache via `vite-plugin-pwa`.

**Spec:** [SPEC.md](../../../SPEC.md) §9, §13, §6.1, §6.5 · [docs/design/decisions.md](../../design/decisions.md) D1, D2, D3, D4, D6, D7, D8, D10, D11 · [docs/design/canvas-review.md](../../design/canvas-review.md) (the contrast audit) · [docs/plan/milestone-plan.md](../../plan/milestone-plan.md) Global Constraints G10–G14, W0 · M0 · [CLAUDE.md](../../../CLAUDE.md).

---

## Global Constraints

Every task inherits these. Values copied verbatim from their sources.

| # | Constraint | Source |
|---|---|---|
| G4 | No user-facing string is ever inlined in a component. Everything goes through `@studio/i18n`. | SPEC §8.3 |
| G10 | Every belt bar carries a **1px ring in the current foreground colour** — `#17150f` on light, `#fffefb` on dark. Never fill-only. | D7 |
| G11 | `#6f6b62` is the floor for any **light-mode** text token. `#a8a49a` and `#8f8b82` are **dark-mode-only** tokens. `#7a766d` is retired outright. | D8 |
| G12 | Physical CSS properties (`margin-left`, `padding-right`, `left:`, `right:`) are banned by ESLint in all frontend source. Exported canvas CSS is a **visual reference only** — never copy-pasted. | D10 |
| G13 | Colours live in named tokens, never hardcoded hex. Semantic tokens (debt · paid · pending · cancelled · danger · focus ring) are **never overridable**. | D1, D2 |
| G14 | Typeface is **Rubik**, one family, weights 300/400/500/600/700. It is the only family covering Hebrew + Latin + base Cyrillic. | D6 |
| G18 | A failing test is written before any bug fix. Prefer a single test file over the full suite during development. | CLAUDE.md §Workflow, SPEC §13 |
| §9 | CSS logical properties everywhere. `dir` flows from the document root. Direction-bearing icons mirror; a clock or a belt never does. Mixed-direction text is wrapped in isolation. **Every component is tested in both `he` and `en`.** | SPEC §9, §13 |
| §13 | Component layer: vitest + Testing Library, every component rendered in both `he` (RTL) and `en` (LTR). | SPEC §13 |

**Repo conventions this session matches:**

- **Assert behaviour, not source text, wherever behaviour is observable.** Where only source can be checked — a stylesheet's declared values, a precache manifest — the docstring says so and explains why.
- **Prove a new gate fails before trusting it.** M0.1 found three gates that passed while checking nothing; M0.2 found three more, one of which could never have fired. Plant a violation, watch it go red, revert.
- `./scripts/ci-local.sh` must be green before every push. `./scripts/lane-check.sh core` is this session's lane check.
- Node scripts live in `web/scripts/`. Frontend tooling runs from `web/`, never the repo root — `npx eslint` from the root downloads a fresh eslint and applies none of our rules.
- `web/packages/i18n/index.ts` is authored once and **never edited by a lane**. Namespace files (`he/common.ts` etc.) are editable.
- **Do not edit** `app/main.py`, `app/models/__init__.py` (seam-2 discovery), `alembic/versions/**` (hook-protected), or `web/packages/ui/src/slots.ts` (seam 4, authored in M0.2).

---

## What was verified empirically before this plan was written

None of the following is a guess. Each was run in the session that produced this plan.

### 1. The WCAG audit in `canvas-review.md` is arithmetically correct

An independent implementation of the WCAG 2.x relative-luminance formula reproduces **every** published figure exactly: `#17150f` 16.76, `#55524a` 7.16, `#6f6b62` 4.88, `#7a766d` 4.16, `#8f8b82` 3.12, `#a8a49a` 2.28 on `#f7f5f1`; `#a8a49a` 2.47 on `#fffefb`; dark `#fffefb` 18.41, `#a8a49a` 7.46, `#8f8b82` 5.47; belts `#6f4a2f` 7.15, `#2f6fa8` 4.87, `#c76a1e` 3.50, `#d9a800` 2.02; and D7's three cases 1.08 / 1.02 / 2.02. **The audit is sound and this plan builds on it directly.**

### 2. `lane-check.sh core` — this session's exit gate — does not check CSS at all

Verified by planting `.plant { margin-left: 4px; inset: 0; }` at the end of `web/packages/ui/src/tokens.css` and running `./scripts/lane-check.sh core`:

```
✅ lane core green (5 scoped gates)      ← exit 0, with a physical property in the token file
```

`lane-check.sh` runs `eslint` over `packages/` but never `stylelint`. Since this session writes a great deal of CSS and its stated exit gate is `lane-check.sh core`, **Task 5 wires stylelint into `lane-check.sh`**. Without that, the exit gate is green on CSS it never read.

### 3. The `inset` gap in `.stylelintrc.json` is real; the `float` gap is not

Probed with a fixture containing six declarations, run through `npx stylelint --config .stylelintrc.json`:

| Declaration | Caught today? |
|---|---|
| `margin-left: 4px` | **yes** — `property-disallowed-list` |
| `float: left` | **yes** — `declaration-property-value-disallowed-list` |
| `inset: 0` | **no** |
| `border-left-width: 1px` | **no** — only the `border-left` *shorthand* is listed |
| `clear: right` | **no** |
| `background-position: left top` | no *(out of scope — see Task 5)* |

The session prompt names `inset` and `float`; `float` was already closed in M0.2. The two additional holes — the `border-*-left/right-*` **longhands** and `clear` — were found by probing rather than by reading the config, and Task 5 closes all of them.

### 4. The stylelint half of D10 has no test

`web/tools/__tests__/d10-logical-css.test.ts` exercises **ESLint only**. The stylelint rule has never been proven to fire from a test, which makes it precisely the kind of gate this repo has been burned by twice. Task 5 adds the stylelint half.

### 5. Two seeded token pairs fail their own contrast obligation

These were found by computing the full matrix rather than by re-reading the audit — `canvas-review.md` audited text against the **ground** `#141311` and never against the **card surface** `#1e1d1a`, and it never audited the dark accent green at all, because that value was chosen in M0.1's seed rather than taken from the canvas.

| Pair | Measured | Needs | Verdict |
|---|--:|--:|---|
| dark `--paid` / `--accent` `#3f8f52` on `--surface` `#1e1d1a` | **4.22** | 4.5 (AA text) | **FAIL** |
| light `--border-strong` `#e5e0d5` on `--ground` `#f7f5f1` | **1.21** | 3.0 (SC 1.4.11) | **FAIL** as a control boundary |
| dark `--border-strong` `#4a4842` on `--surface` `#1e1d1a` | **1.84** | 3.0 (SC 1.4.11) | **FAIL** as a control boundary |

Task 3's contrast test fails on all three when first written; the fix is Task 3's implementation step. Replacement values are computed in that task and re-verified there.

Note that `--border-strong` was seeded one hex unit away from `--border` (`#e5e0d5` vs `#e6e1d6`), which is a visually meaningless distinction. Task 3 gives it the job SC 1.4.11 needs: **`--border` is the decorative hairline (no obligation, and D3's restrained register depends on it staying faint); `--border-strong` is the boundary of an interactive control and must reach 3:1.**

### 6. Dark mode makes *more* belts fail than the review reports — which strengthens D7

`canvas-review.md` audited belt fills against the light ground only. Against the dark ground `#141311`:

| Belt | on light `#f7f5f1` | on dark `#141311` |
|---|--:|--:|
| white `#fffefb` | **1.08 FAIL** | 18.41 |
| yellow `#d9a800` | **2.02 FAIL** | 8.45 |
| orange `#c76a1e` | 3.50 | 4.87 |
| green `#1f6b3f` | 5.97 | **2.86 FAIL** |
| blue `#2f6fa8` | 4.87 | 3.50 |
| brown `#6f4a2f` | 7.15 | **2.38 FAIL** |
| black `#17150f` | 16.76 | **1.02 FAIL** |

So light mode loses white and yellow; dark mode loses black, brown and green. **Five failures across the two modes, not three.** This does not reopen D7 — it is more evidence for it. The ring measures 16.76 on light and 18.41 on dark, so one declaration rescues every row. Task 3's test asserts the ring's rescue across the whole belt set in both modes, not only the three cases D7 names.

---

## A documented reading of D2, not a silent invention

D2's tier table lists Brand = *logo, one primary hue, derived on-colour*; Semantic = *debt · paid · pending · cancelled · danger · focus ring*; Structural = *type scale, spacing, radii, density, motion, component shape*.

The **neutral palette** — `--ground`, `--surface`, `--fg`, `--text-secondary`, `--text-muted`, `--border`, `--border-strong` — appears in none of those three lists. This plan classifies it as **structural**, sub-grouped as `palette`.

The classification has no behavioural consequence: semantic and structural are both *never overridable*, so the neutrals get the same protection either way, and D3 fixes them as design law regardless. The alternative — a fourth tier — would contradict D2's "the tiers are not negotiable". Recorded here so a later reader does not think it was overlooked. `tokens.roles.ts` carries the same note in a comment.

---

## File structure

### Created — `web/packages/ui/src/`

| Path | Responsibility |
|---|---|
| `contrast.ts` | WCAG 2.x relative luminance and contrast ratio. Pure, no DOM. Exported from the package so later milestones (M10's a11y sweep) reuse it rather than reimplementing it. |
| `contrast.test.ts` | Proves `contrastRatio` against `canvas-review.md`'s published table. If our arithmetic ever disagrees with the audit, this is the test that says so. |
| `tokens.roles.ts` | The single source of truth for **what each token is for**: tier, group, contrast obligation, note. Not a duplicate of the CSS — the CSS holds values, this holds meaning. |
| `tokens.audit.test.ts` | The bijection + obligation audit. The anti-rot mechanism: a token with no role fails, a role with no token fails, an obligation unmet fails. |
| `brand.ts` | D2's tier gate. `brandOverridesFor()` filters a studio-supplied record down to brand-tier properties only. Nothing calls it in v1 (D1 — logo only); it exists so v2 cannot invent a second, unguarded path. |
| `brand.test.ts` | Asserts a studio-supplied `--debt` / `--focus-ring` / `--radius-md` cannot reach a real element. |
| `primitives/` | One primitive per file, each with its own `.test.tsx` beside it. Populated by Tasks 8+. |

### Modified

| Path | Change |
|---|---|
| `web/packages/ui/src/tokens.css` | **Extend, never replace.** Three tier blocks, light and dark sets, the type/weight/motion/density scales, and the two corrected values from finding 5. |
| `web/packages/ui/src/tokens.test.ts` | Keep the existing D8 string-level assertions (they are complementary to the computed audit — they catch a retired hex even in a token that carries no contrast obligation). Add the tier-block assertions. |
| `web/packages/ui/src/index.ts` | Export the new modules and primitives. |
| `web/packages/ui/src/ThemeProvider.tsx` | Unchanged behaviour; it already resolves D4 correctly. Only the export surface moves. |
| `web/.stylelintrc.json` | `inset` + inset longhands, `border-*-left/right-*` longhands, `clear`. |
| `web/tools/__tests__/d10-logical-css.test.ts` | Add the stylelint half — the CSS gate is currently untested. |
| `scripts/lane-check.sh` | Run stylelint in the frontend lint gate, so `lane-check.sh core` reads the CSS this session writes. |
| `web/apps/{staff,parent,dashboard}/src/sw-precache.test.ts` | Extend to assert the Rubik variable axis covers every weight the token layer names. |
| `web/apps/{staff,parent,dashboard}/src/App.tsx` | Mount the real theme control. |
| `web/packages/i18n/{he,en,ru}/common.ts` | Keys for the theme control and any primitive label the apps pass in. |

---

## Task 1: `contrast.ts` — the ratio function, proved against the published audit

**Files:**
- Create: `web/packages/ui/src/contrast.ts`
- Test: `web/packages/ui/src/contrast.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `relativeLuminance(hex: string): number`, `contrastRatio(a: string, b: string): number`, `meetsAA(a: string, b: string): boolean`, `meetsNonText(a: string, b: string): boolean`. Tasks 3 and 8+ all use `contrastRatio`.

**Why this is Task 1.** Every downstream assertion is only as trustworthy as this function. Testing it against `canvas-review.md`'s *own published numbers* means that if the implementation and the audit ever disagree, the failure is loud and immediate rather than silently blessing a wrong palette.

- [ ] **Step 1: Write the failing test**

Create `web/packages/ui/src/contrast.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { contrastRatio, meetsAA, meetsNonText, relativeLuminance } from './contrast'

/**
 * Every expected value below is quoted from the contrast audit at the bottom of
 * docs/design/canvas-review.md. This test's job is to prove our arithmetic agrees
 * with the audit the design decisions were made from — if it ever disagrees, one of
 * the two is wrong and D7/D8 need rereading, not a tolerance bump.
 */
const LIGHT_GROUND = '#f7f5f1'
const LIGHT_SURFACE = '#fffefb'
const DARK_GROUND = '#141311'

describe('contrastRatio reproduces the published light-mode audit', () => {
  it.each([
    ['#17150f', 16.76, 'ink'],
    ['#55524a', 7.16, 'secondary'],
    ['#6f6b62', 4.88, 'tertiary — the D8 floor'],
    ['#7a766d', 4.16, 'retired grey'],
    ['#8f8b82', 3.12, 'retired grey'],
    ['#a8a49a', 2.28, 'retired grey'],
    ['#b3261e', 6.0, 'debt red'],
    ['#1f6b3f', 5.97, 'paid green'],
    ['#8a5a00', 5.44, 'pending amber'],
  ])('%s on the light ground is %s:1 (%s)', (hex, expected) => {
    expect(contrastRatio(hex, LIGHT_GROUND)).toBeCloseTo(expected as number, 2)
  })

  it('#a8a49a is 2.47 on the lighter card ground — still failing', () => {
    expect(contrastRatio('#a8a49a', LIGHT_SURFACE)).toBeCloseTo(2.47, 2)
  })
})

describe('contrastRatio reproduces the published dark-mode audit', () => {
  it.each([
    ['#fffefb', 18.41],
    ['#a8a49a', 7.46],
    ['#8f8b82', 5.47],
  ])('%s on the dark ground is %s:1', (hex, expected) => {
    expect(contrastRatio(hex, DARK_GROUND)).toBeCloseTo(expected as number, 2)
  })
})

describe('contrastRatio reproduces the published belt audit', () => {
  it.each([
    ['#6f4a2f', 7.15, 'brown'],
    ['#2f6fa8', 4.87, 'blue'],
    ['#c76a1e', 3.5, 'orange'],
    ['#d9a800', 2.02, 'yellow — fails even the 3:1 non-text threshold'],
  ])('%s on the light ground is %s:1 (%s)', (hex, expected) => {
    expect(contrastRatio(hex, LIGHT_GROUND)).toBeCloseTo(expected as number, 2)
  })
})

describe('the ratio is symmetric and bounded, as WCAG defines it', () => {
  it('does not care which colour is named first', () => {
    expect(contrastRatio('#17150f', LIGHT_GROUND)).toBeCloseTo(
      contrastRatio(LIGHT_GROUND, '#17150f'),
      10,
    )
  })

  it('is 1 for a colour against itself and 21 for black against white', () => {
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 10)
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10)
  })

  it('anchors relative luminance at the two extremes', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 10)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10)
  })
})

describe('the two thresholds are named, so no caller writes a bare number', () => {
  it('meetsAA is the 4.5:1 normal-text threshold (SC 1.4.3)', () => {
    expect(meetsAA('#6f6b62', LIGHT_GROUND)).toBe(true) // 4.88
    expect(meetsAA('#7a766d', LIGHT_GROUND)).toBe(false) // 4.16
  })

  it('meetsNonText is the 3:1 graphical-object threshold (SC 1.4.11)', () => {
    expect(meetsNonText('#c76a1e', LIGHT_GROUND)).toBe(true) // 3.50
    expect(meetsNonText('#d9a800', LIGHT_GROUND)).toBe(false) // 2.02
  })
})

describe('input handling', () => {
  it('accepts three-digit shorthand and is case-insensitive', () => {
    expect(contrastRatio('#FFF', '#000')).toBeCloseTo(21, 10)
    expect(contrastRatio('#AbCdEf', '#abcdef')).toBeCloseTo(1, 10)
  })

  it('throws on anything that is not a hex colour, rather than returning a plausible number', () => {
    // A silent NaN here would make every downstream contrast assertion pass
    // vacuously, which is the failure mode this whole file exists to prevent.
    expect(() => contrastRatio('var(--fg)', '#fff')).toThrow(/hex colour/i)
    expect(() => contrastRatio('#12345', '#fff')).toThrow(/hex colour/i)
    expect(() => contrastRatio('rebeccapurple', '#fff')).toThrow(/hex colour/i)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd web && npx vitest run packages/ui/src/contrast.test.ts --reporter=dot`
Expected: FAIL — `Failed to resolve import "./contrast"`.

- [ ] **Step 3: Write the minimal implementation**

Create `web/packages/ui/src/contrast.ts`:

```ts
/**
 * WCAG 2.x contrast, used by the token audit and by any primitive that has to prove
 * a colour it was handed is legible (BeltBar, chiefly — belt_rank.color_hex is
 * per-studio data, so it cannot be audited at build time).
 *
 * Kept dependency-free and pure: it runs in the token audit, which has no DOM.
 */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** SC 1.4.3 — normal-body text. */
export const AA_TEXT = 4.5
/** SC 1.4.11 — non-text contrast: graphical objects and control boundaries. */
export const NON_TEXT = 3

function channels(hex: string): [number, number, number] {
  if (!HEX.test(hex)) {
    throw new TypeError(
      `expected a hex colour like #f7f5f1, received ${JSON.stringify(hex)}. ` +
        'A ratio computed from a non-colour would make every contrast assertion pass vacuously.',
    )
  }
  const body = hex.slice(1)
  const full =
    body.length === 3
      ? body
          .split('')
          .map((c) => c + c)
          .join('')
      : body
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}

/** WCAG 2.x relative luminance. 0 for black, 1 for white. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** (lighter + 0.05) / (darker + 0.05). Symmetric, in [1, 21]. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export function meetsAA(a: string, b: string): boolean {
  return contrastRatio(a, b) >= AA_TEXT
}

export function meetsNonText(a: string, b: string): boolean {
  return contrastRatio(a, b) >= NON_TEXT
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd web && npx vitest run packages/ui/src/contrast.test.ts --reporter=dot`
Expected: PASS, all assertions.

- [ ] **Step 5: Export it from the package**

In `web/packages/ui/src/index.ts`, add beside the existing exports:

```ts
export { AA_TEXT, NON_TEXT, contrastRatio, meetsAA, meetsNonText, relativeLuminance } from './contrast'
```

- [ ] **Step 6: Typecheck and lint**

Run: `cd web && npm run typecheck && npx eslint packages/ui/src/contrast.ts packages/ui/src/contrast.test.ts`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add web/packages/ui/src/contrast.ts web/packages/ui/src/contrast.test.ts web/packages/ui/src/index.ts
git commit -m "feat(ui): WCAG contrast, proved against the canvas audit's own numbers"
```


---

## Task 2: `tokens.roles.ts` — every token declares what it is for, or the build fails

**Files:**
- Create: `web/packages/ui/src/tokens.roles.ts`
- Create: `web/packages/ui/src/tokens.audit.test.ts`

**Interfaces:**
- Consumes: nothing (Task 3 adds the `contrastRatio` usage).
- Produces: `TOKEN_ROLES: Record<string, TokenRole>`, `TIERS`, `GROUND_TOKENS`, and the types `Tier`, `Obligation`, `TokenRole`. Task 3 audits against it; Task 4 reads `TIERS` to build the brand gate.

**Why this exists.** A test that checks three named greys stops covering the palette the moment a fourth token is added. This table plus its bijection test means the audit's coverage is *structural*: a token with no role fails, and a role with no token fails. That is the difference between a gate and a comment.

- [ ] **Step 1: Write the failing test**

Create `web/packages/ui/src/tokens.audit.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GROUND_TOKENS, TIERS, TOKEN_ROLES } from './tokens.roles'

// Read from cwd rather than import.meta.url: the jsdom environment rewrites
// import.meta.url to a non-file scheme. Same reason as tokens.test.ts.
const raw = readFileSync(resolve(process.cwd(), 'packages/ui/src/tokens.css'), 'utf-8')
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * Only source can be checked here: these are declared values in a stylesheet, and jsdom
 * does not resolve custom properties across a cascade. The behavioural half — that a
 * primitive actually reaches for the token — is asserted in each primitive's own test.
 */
function readTokenBlock(selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  if (start === -1) throw new Error(`tokens.css has no ${selector} block`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const body = css.slice(open + 1, close)
  const out: Record<string, string> = {}
  for (const [, name, value] of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out[name] = value.trim()
  }
  return out
}

export const LIGHT = readTokenBlock(':root')
export const DARK = readTokenBlock('[data-theme="dark"]')

describe('the roles table and tokens.css are in exact bijection', () => {
  it('finds a non-trivial number of tokens in each block, so a parse failure cannot pass silently', () => {
    expect(Object.keys(LIGHT).length).toBeGreaterThan(30)
    expect(Object.keys(DARK).length).toBeGreaterThan(10)
  })

  it('every token declared in :root has a role', () => {
    const unclassified = Object.keys(LIGHT).filter((t) => !(t in TOKEN_ROLES))
    expect(unclassified, 'add these to TOKEN_ROLES — an unclassified token is an unaudited one').toEqual([])
  })

  it('every token declared in the dark block has a role', () => {
    const unclassified = Object.keys(DARK).filter((t) => !(t in TOKEN_ROLES))
    expect(unclassified).toEqual([])
  })

  it('every role in the table names a token that actually exists', () => {
    const orphans = Object.keys(TOKEN_ROLES).filter((t) => !(t in LIGHT))
    expect(orphans, 'a role with no token is a stale entry — delete it or add the token').toEqual([])
  })

  it('every token the dark block overrides also exists in the light block', () => {
    // The dark block is an override layer, not a second palette. A token that exists
    // only in dark would be undefined in light mode and inherit from nowhere.
    const darkOnly = Object.keys(DARK).filter((t) => !(t in LIGHT))
    expect(darkOnly).toEqual([])
  })

  it('every colour-bearing token is overridden in the dark block', () => {
    // A colour that is NOT re-declared in dark keeps its light value on a dark ground,
    // which is exactly how a palette silently half-converts.
    const missing = Object.keys(TOKEN_ROLES).filter(
      (t) => TOKEN_ROLES[t].obligation.kind !== 'none' && !(t in DARK),
    )
    expect(missing, 'these carry colour and must have a dark value').toEqual([])
  })
})

describe('D2 — the three tiers, and nothing else', () => {
  it('classifies every token into exactly one of D2s three tiers', () => {
    expect(TIERS).toEqual(['brand', 'semantic', 'structural'])
    for (const [token, role] of Object.entries(TOKEN_ROLES)) {
      expect(TIERS, `${token} has tier ${role.tier}`).toContain(role.tier)
    }
  })

  it('carries exactly D2s six semantic tokens, plus their tints — no more, no fewer', () => {
    const semantic = Object.entries(TOKEN_ROLES)
      .filter(([, r]) => r.tier === 'semantic')
      .map(([t]) => t)
      .sort()
    expect(semantic).toEqual(
      [
        '--cancelled', '--cancelled-tint',
        '--danger', '--danger-tint',
        '--debt', '--debt-tint',
        '--focus-ring',
        '--paid',
        '--pending',
      ].sort(),
    )
  })

  it('D1 — the brand tier exists but is only the hue and its on-colour', () => {
    const brand = Object.entries(TOKEN_ROLES)
      .filter(([, r]) => r.tier === 'brand')
      .map(([t]) => t)
      .sort()
    expect(brand).toEqual(['--brand-on-primary', '--brand-primary'])
  })

  it('every exemption states the success criterion that grants it', () => {
    // An exemption with no reason is indistinguishable from a token someone gave up on.
    for (const [token, role] of Object.entries(TOKEN_ROLES)) {
      if (role.obligation.kind === 'exempt') {
        expect(role.obligation.why, `${token} is exempt but says nothing about why`).toMatch(/SC \d/)
      }
    }
  })

  it('every ground named by an obligation is itself a declared ground token', () => {
    for (const [token, role] of Object.entries(TOKEN_ROLES)) {
      if (role.obligation.kind === 'text' || role.obligation.kind === 'non-text') {
        for (const ground of role.obligation.on) {
          expect(GROUND_TOKENS, `${token} is measured against ${ground}`).toContain(ground)
          expect(LIGHT).toHaveProperty(ground)
        }
      }
    }
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd web && npx vitest run packages/ui/src/tokens.audit.test.ts --reporter=dot`
Expected: FAIL — `Failed to resolve import "./tokens.roles"`.

- [ ] **Step 3: Write `tokens.roles.ts`**

Create `web/packages/ui/src/tokens.roles.ts`:

```ts
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
 * appears in none of those three lists. It is classified here as **structural**,
 * grouped as `palette`. The classification carries no behavioural consequence, because
 * semantic and structural are both *never overridable*; a fourth tier would contradict
 * D2's "the tiers are not negotiable". Recorded so a later reader does not think it was
 * overlooked.
 *
 * ── Belt colours are deliberately absent ──────────────────────────────────────────
 * `belt_rank.color_hex` is per-studio data (D3, SPEC §5.9), not a token. BeltBar takes
 * a hex prop. The token layer owns only `--belt-ring` and `--belt-ring-width` (D7).
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
  '--accent',
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

export const TOKEN_ROLES: Record<string, TokenRole> = {
  // ── Tier 1 · BRAND ────────────────────────────────────────────────────────────
  '--brand-primary': {
    tier: 'brand',
    group: 'palette',
    obligation: { kind: 'non-text', on: ON_GROUNDS },
    note: 'D1 — a studio may upload a logo in v1 but cannot set a colour. Fixed until v2.',
  },
  '--brand-on-primary': {
    tier: 'brand',
    group: 'palette',
    obligation: { kind: 'text', on: ['--brand-primary' as GroundToken] },
    note: 'D2 — the derived on-colour. v2 validates this pair at the moment the hue is set.',
  },

  // ── Tier 2 · SEMANTIC — never overridable (D2) ────────────────────────────────
  '--debt': {
    tier: 'semantic', group: 'status',
    obligation: { kind: 'text', on: [...ON_GROUNDS, '--debt-tint'] },
    note: 'The parent app’s most important alert. D2 exists so branding cannot swallow it.',
  },
  '--debt-tint': {
    tier: 'semantic', group: 'status', obligation: { kind: 'ground' },
    note: 'The debt chip’s fill. A ground, so --debt is audited against it.',
  },
  '--paid': {
    tier: 'semantic', group: 'status', obligation: { kind: 'text', on: ON_GROUNDS },
    note: 'Artboard 4h’s שולם chip is outline-only, so the text sits on the plain card.',
  },
  '--pending': {
    tier: 'semantic', group: 'status', obligation: { kind: 'text', on: ON_GROUNDS },
    note: 'Also the לא סומן dashed chip and the two unresolved attendance marks.',
  },
  '--cancelled': {
    tier: 'semantic', group: 'status',
    obligation: { kind: 'text', on: [...ON_GROUNDS, '--cancelled-tint'] },
    note: 'Artboard 4h renders בוטל in #7a766d, which D8 retired outright. This token supersedes it.',
  },
  '--cancelled-tint': {
    tier: 'semantic', group: 'status', obligation: { kind: 'ground' },
    note: 'The cancelled chip’s fill.',
  },
  '--danger': {
    tier: 'semantic', group: 'status',
    obligation: { kind: 'text', on: [...ON_GROUNDS, '--danger-tint'] },
    note: 'Destructive actions, field errors, the alert banner.',
  },
  '--danger-tint': {
    tier: 'semantic', group: 'status', obligation: { kind: 'ground' },
    note: 'The alert banner’s ground.',
  },
  '--focus-ring': {
    tier: 'semantic', group: 'status',
    obligation: { kind: 'non-text', on: ON_GROUNDS },
    note: 'SC 1.4.11 — the focus indicator is a graphical object, not text.',
  },

  // ── Tier 3 · STRUCTURAL · palette ─────────────────────────────────────────────
  '--ground': { tier: 'structural', group: 'palette', obligation: { kind: 'ground' }, note: 'D3 — the page. #f7f5f1 by design; D8 forbids lightening it to fix a grey.' },
  '--surface': { tier: 'structural', group: 'palette', obligation: { kind: 'ground' }, note: 'Cards. Artboard 4h’s eight panels.' },
  '--fg': { tier: 'structural', group: 'palette', obligation: { kind: 'text', on: ON_GROUNDS }, note: 'Ink. Also the primary button and toast fill, hence --on-fg.' },
  '--on-fg': { tier: 'structural', group: 'palette', obligation: { kind: 'text', on: ['--fg'] }, note: 'Text on an ink fill: primary button, toast, active segment.' },
  '--text-secondary': { tier: 'structural', group: 'palette', obligation: { kind: 'text', on: ON_GROUNDS }, note: 'Sublines, belt labels, inactive segment.' },
  '--text-muted': { tier: 'structural', group: 'palette', obligation: { kind: 'text', on: ON_GROUNDS }, note: 'D8’s floor in light mode, 4.88:1. Card captions, placeholders.' },
  '--border': { tier: 'structural', group: 'palette', obligation: { kind: 'exempt', why: 'SC 1.4.11 covers boundaries needed to identify a control; a decorative hairline divider is not one. D3’s restrained register depends on it staying faint.' }, note: 'Card and divider hairline.' },
  '--border-strong': { tier: 'structural', group: 'palette', obligation: { kind: 'non-text', on: ON_GROUNDS }, note: 'SC 1.4.11 — the boundary of an interactive control. This is the token that must reach 3:1.' },
  '--accent': { tier: 'structural', group: 'palette', obligation: { kind: 'text', on: ON_GROUNDS }, note: 'D3’s one deep accent. Also the switch-on track.' },
  '--on-accent': { tier: 'structural', group: 'palette', obligation: { kind: 'text', on: ['--accent'] }, note: 'Text on an accent fill.' },
  '--disabled-surface': { tier: 'structural', group: 'palette', obligation: { kind: 'ground' }, note: 'The disabled button fill.' },
  '--belt-ring': { tier: 'structural', group: 'shape', obligation: { kind: 'non-text', on: ON_GROUNDS }, note: 'D7/G10 — the 1px ring every belt bar carries. It is what rescues white-on-light and black-on-dark.' },
}
```

*(Continued in Step 4 — the structural scales are appended in the same file.)*

- [ ] **Step 4: Append the structural scales to `tokens.roles.ts`**

Append inside the same `TOKEN_ROLES` object, before its closing brace:

```ts
  // ── Tier 3 · STRUCTURAL · type (artboard 4h declares "Rubik 400/500/600";
  //    G14 requires the family carry 300-700, so all five weights are named) ────
  '--text-micro': { tier: 'structural', group: 'type', obligation: { kind: 'none' }, note: '11px — belt swatch labels, the smallest text on 4h.' },
  '--text-caption': { tier: 'structural', group: 'type', obligation: { kind: 'none' }, note: '12px — card captions, chips, sublines, field helper text.' },
  '--text-label': { tier: 'structural', group: 'type', obligation: { kind: 'none' }, note: '13px — control labels, segments, alert body.' },
  '--text-body': { tier: 'structural', group: 'type', obligation: { kind: 'none' }, note: '14px — buttons, inputs, toast, prose.' },
  '--text-title': { tier: 'structural', group: 'type', obligation: { kind: 'none' }, note: '15px — list-row names, section titles.' },
  '--text-display': { tier: 'structural', group: 'type', obligation: { kind: 'none' }, note: '24px — page titles.' },
  '--leading-tight': { tier: 'structural', group: 'type', obligation: { kind: 'none' }, note: '1 — single-line controls.' },
  '--leading-snug': { tier: 'structural', group: 'type', obligation: { kind: 'none' }, note: '1.2 — list-row names.' },
  '--leading-normal': { tier: 'structural', group: 'type', obligation: { kind: 'none' }, note: '1.4 — alert body.' },
  '--leading-relaxed': { tier: 'structural', group: 'type', obligation: { kind: 'none' }, note: '1.5 — prose.' },
  '--weight-light': { tier: 'structural', group: 'type', obligation: { kind: 'none' }, note: 'G14 — 300. Present in the family; 4h does not use it.' },
  '--weight-regular': { tier: 'structural', group: 'type', obligation: { kind: 'none' }, note: 'G14 — 400.' },
  '--weight-medium': { tier: 'structural', group: 'type', obligation: { kind: 'none' }, note: 'G14 — 500. 4h’s workhorse for labels and chips.' },
  '--weight-semibold': { tier: 'structural', group: 'type', obligation: { kind: 'none' }, note: 'G14 — 600. Page titles.' },
  '--weight-bold': { tier: 'structural', group: 'type', obligation: { kind: 'none' }, note: 'G14 — 700. Present in the family; 4h does not use it.' },

  // ── Tier 3 · STRUCTURAL · space (4h declares a 4px unit) ──────────────────────
  '--space-1': { tier: 'structural', group: 'space', obligation: { kind: 'none' }, note: '4px — the unit 4h names.' },
  '--space-2': { tier: 'structural', group: 'space', obligation: { kind: 'none' }, note: '8px' },
  '--space-3': { tier: 'structural', group: 'space', obligation: { kind: 'none' }, note: '12px' },
  '--space-4': { tier: 'structural', group: 'space', obligation: { kind: 'none' }, note: '16px — the card grid gap on 4h.' },
  '--space-5': { tier: 'structural', group: 'space', obligation: { kind: 'none' }, note: '20px' },
  '--space-6': { tier: 'structural', group: 'space', obligation: { kind: 'none' }, note: '24px' },
  '--space-8': { tier: 'structural', group: 'space', obligation: { kind: 'none' }, note: '32px — the artboard padding on 4h.' },
  '--control-pad-block': { tier: 'structural', group: 'space', obligation: { kind: 'none' }, note: '11px — button and field block padding on 4h.' },
  '--control-pad-inline': { tier: 'structural', group: 'space', obligation: { kind: 'none' }, note: '18px — button inline padding on 4h.' },
  '--field-pad-inline': { tier: 'structural', group: 'space', obligation: { kind: 'none' }, note: '12px — field inline padding on 4h.' },

  // ── Tier 3 · STRUCTURAL · radius (4h declares 9/11/14) ────────────────────────
  '--radius-xs': { tier: 'structural', group: 'radius', obligation: { kind: 'none' }, note: '3px — belt bar.' },
  '--radius-sm': { tier: 'structural', group: 'radius', obligation: { kind: 'none' }, note: '6px — checkbox.' },
  '--radius-md': { tier: 'structural', group: 'radius', obligation: { kind: 'none' }, note: '9px — buttons, fields, segmented track. One of 4h’s three declared corners.' },
  '--radius-lg': { tier: 'structural', group: 'radius', obligation: { kind: 'none' }, note: '11px — list rows, toast, alert. Declared by 4h.' },
  '--radius-xl': { tier: 'structural', group: 'radius', obligation: { kind: 'none' }, note: '14px — cards. Declared by 4h.' },
  '--radius-pill': { tier: 'structural', group: 'radius', obligation: { kind: 'none' }, note: '999px — status chips. Outside 4h’s declared 9/11/14, which is worth knowing.' },
  '--radius-circle': { tier: 'structural', group: 'radius', obligation: { kind: 'none' }, note: '50% — radio, switch knob. Also outside the declared scale.' },

  // ── Tier 3 · STRUCTURAL · shape and motion ────────────────────────────────────
  '--border-width-hairline': { tier: 'structural', group: 'shape', obligation: { kind: 'none' }, note: '1px' },
  '--border-width-strong': { tier: 'structural', group: 'shape', obligation: { kind: 'none' }, note: '1.5px — a focused field, a secondary button.' },
  '--belt-ring-width': { tier: 'structural', group: 'shape', obligation: { kind: 'none' }, note: 'D7 says 1px exactly. A token so no component can quietly drop to 0.' },
  '--motion-fast': { tier: 'structural', group: 'motion', obligation: { kind: 'none' }, note: '120ms — a switch knob, a chip.' },
  '--motion-base': { tier: 'structural', group: 'motion', obligation: { kind: 'none' }, note: '200ms — a toast, a panel.' },
  '--ease-standard': { tier: 'structural', group: 'motion', obligation: { kind: 'none' }, note: 'The one easing curve.' },
```

- [ ] **Step 5: Extend `tokens.css` so the bijection holds**

`web/packages/ui/src/tokens.css` — **extend the existing file, do not replace it.** Rewrite the `:root` and `[data-theme="dark"]` blocks to the following, leaving the `*`, `html`, `body` and `:focus-visible` rules at the bottom of the file untouched:

```css
/* D2 — three tiers. Semantic and structural are NEVER overridable; only the brand
 * tier is studio-settable, and not until v2 (D1 — v1 is logo-only).
 * D3 — near-neutral warm grounds, one deep accent, minimal decoration.
 * D7 — a belt bar is never fill-only; --belt-ring is what makes that enforceable.
 * D8 — #6f6b62 is the floor for any light-mode text token; #7a766d is retired outright.
 *
 * WHAT EACH TOKEN IS FOR lives in tokens.roles.ts, and tokens.audit.test.ts asserts a
 * bijection between the two plus every contrast obligation. Add a token here without a
 * role there and the build fails — deliberately. Ratios are NOT written in comments;
 * a ratio in a comment rots the first time someone tweaks a hex, which is how D8's
 * three greys survived 33, 19 and 9 uses.
 *
 * Values ported from dashboard artboard 4h (ספריית רכיבים) as a VISUAL REFERENCE.
 * No CSS was copy-pasted from the export — D10. */

:root {
  /* ═══ TIER 1 · BRAND — studio-owned in v2, fixed in v1 (D1) ═══════════════════ */
  --brand-primary: #17150f;
  --brand-on-primary: #f7f5f1;

  /* ═══ TIER 2 · SEMANTIC — never overridable, never a brand colour ═════════════
   * D2 consequence 2: a club branding itself red would otherwise swallow the debt
   * banner, which is the parent app's most important alert. */
  --debt: #b3261e;
  --debt-tint: #faefec;
  --paid: #1f6b3f;
  --pending: #8a5a00;
  --cancelled: #6f6b62;
  --cancelled-tint: #f3f2ef;
  --danger: #b3261e;
  --danger-tint: #faf1ee;
  --focus-ring: #2f6fa8;

  /* ═══ TIER 3 · STRUCTURAL · palette ═══════════════════════════════════════════ */
  --ground: #f7f5f1;
  --surface: #fffefb;
  --fg: #17150f;
  --on-fg: #f7f5f1;
  --text-secondary: #55524a;
  --text-muted: #6f6b62;
  --border: #e6e1d6;
  --border-strong: #8d8674;
  --accent: #1f6b3f;
  --on-accent: #fffefb;
  --disabled-surface: #e8e7e3;
  --belt-ring: #17150f;

  /* ═══ TIER 3 · STRUCTURAL · type ══════════════════════════════════════════════
   * rem, not px: a user who has raised their browser font size gets a UI that
   * scales with them. 4h is drawn in px against a 16px root, so the conversions
   * are exact. */
  --text-micro: 0.6875rem;
  --text-caption: 0.75rem;
  --text-label: 0.8125rem;
  --text-body: 0.875rem;
  --text-title: 0.9375rem;
  --text-display: 1.5rem;
  --leading-tight: 1;
  --leading-snug: 1.2;
  --leading-normal: 1.4;
  --leading-relaxed: 1.5;
  --weight-light: 300;
  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;

  /* ═══ TIER 3 · STRUCTURAL · space, radius, shape, motion ══════════════════════ */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --control-pad-block: 11px;
  --control-pad-inline: 18px;
  --field-pad-inline: 12px;
  --radius-xs: 3px;
  --radius-sm: 6px;
  --radius-md: 9px;
  --radius-lg: 11px;
  --radius-xl: 14px;
  --radius-pill: 999px;
  --radius-circle: 50%;
  --border-width-hairline: 1px;
  --border-width-strong: 1.5px;
  --belt-ring-width: 1px;
  --motion-fast: 120ms;
  --motion-base: 200ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
}

[data-theme="dark"] {
  --brand-primary: #fffefb;
  --brand-on-primary: #141311;

  --debt: #ff8a7d;
  --debt-tint: #2e2521;
  --paid: #4a9b5e;
  --pending: #e5b44f;
  --cancelled: #a8a49a;
  --cancelled-tint: #292825;
  --danger: #ff8a7d;
  --danger-tint: #2c2420;
  --focus-ring: #6aa9e0;

  --ground: #141311;
  --surface: #1e1d1a;
  --fg: #fffefb;
  --on-fg: #141311;
  --text-secondary: #a8a49a;
  --text-muted: #8f8b82;
  --border: #3a3833;
  --border-strong: #726e65;
  --accent: #4a9b5e;
  --on-accent: #141311;
  --disabled-surface: #343430;
  --belt-ring: #fffefb;
}
```

Note what changed from the M0.1 seed and why:

| Token | Was | Now | Reason |
|---|---|---|---|
| `--border-strong` (light) | `#e5e0d5` | `#8d8674` | 1.21:1 could not be a control boundary (SC 1.4.11). It was also one hex unit from `--border`, i.e. no distinction at all. |
| `--border-strong` (dark) | `#4a4842` | `#726e65` | Same, 1.84:1. |
| `--accent` / `--paid` (dark) | `#3f8f52` | `#4a9b5e` | 4.22:1 on the card surface, below AA. Also removes a collision with 4h's green belt, which is `#3f8f52`. |
| `--cancelled` (dark) | `#8f8b82` | `#a8a49a` | 4.34:1 on its own tint, below AA. |
| `--radius-md` | `10px` | `9px` | 4h declares its corners as 9/11/14. |
| `--radius-lg` | `16px` | `11px` | Same. `14px` becomes `--radius-xl`. |
| `--border-strong` in dark was also the only token whose light and dark values were nearly identical | | | resolved by the above |

- [ ] **Step 6: Run the test and confirm it passes**

Run: `cd web && npx vitest run packages/ui/src/tokens.audit.test.ts packages/ui/src/tokens.test.ts --reporter=dot`
Expected: PASS. `tokens.test.ts` must still pass — its D8 string assertions are unchanged and complementary (they catch a retired hex even in a token carrying no contrast obligation).

- [ ] **Step 7: Prove the bijection gate actually fires**

Plant, run, revert. This is the repo convention and it has caught six dead gates already.

```bash
cd web
printf '\n:root { --rogue-token: #ff0000; }\n' >> packages/ui/src/tokens.css
npx vitest run packages/ui/src/tokens.audit.test.ts --reporter=dot   # expect FAIL: unclassified
git checkout packages/ui/src/tokens.css
```

Then the mirror case — a role with no token:

```bash
# temporarily add "'--nonexistent': { tier: 'structural', group: 'space',
#   obligation: { kind: 'none' }, note: 'x' }," to TOKEN_ROLES
npx vitest run packages/ui/src/tokens.audit.test.ts --reporter=dot   # expect FAIL: orphan
git checkout packages/ui/src/tokens.roles.ts
```

Both must go red. If either stays green, the bijection is not being computed and the whole audit is decorative.

- [ ] **Step 8: Typecheck, lint, commit**

```bash
cd web && npm run typecheck && npx eslint packages/ui/src && npx stylelint "packages/ui/src/*.css"
cd .. && git add web/packages/ui/src/tokens.roles.ts web/packages/ui/src/tokens.audit.test.ts web/packages/ui/src/tokens.css
git commit -m "feat(ui): D2's three tiers, with a bijection gate over the token layer"
```

---

## Task 3: the contrast obligations — the audit that replaces D7 and D8's comments

**Files:**
- Modify: `web/packages/ui/src/tokens.audit.test.ts`

**Interfaces:**
- Consumes: `contrastRatio`, `AA_TEXT`, `NON_TEXT` from Task 1; `TOKEN_ROLES`, `GROUND_TOKENS` from Task 2.
- Produces: nothing new — this is the gate itself.

**This is the task the exit gate names.** "The contrast floors from D7 and D8 are asserted by tests rather than by comments."

- [ ] **Step 1: Write the failing test**

Append to `web/packages/ui/src/tokens.audit.test.ts`:

```ts
import { AA_TEXT, NON_TEXT, contrastRatio } from './contrast'

const MODES = [
  { name: 'light', tokens: LIGHT },
  // The dark block is an override layer, so a dark mode's effective palette is the
  // light block with the dark block laid over it. Auditing DARK alone would silently
  // skip every token dark does not override.
  { name: 'dark', tokens: { ...LIGHT, ...DARK } },
] as const

describe.each(MODES)('$name mode — every token meets its own obligation', ({ tokens }) => {
  for (const [token, role] of Object.entries(TOKEN_ROLES)) {
    const { obligation } = role
    if (obligation.kind !== 'text' && obligation.kind !== 'non-text') continue
    const threshold = obligation.kind === 'text' ? AA_TEXT : NON_TEXT

    for (const ground of obligation.on) {
      it(`${token} on ${ground} reaches ${threshold}:1`, () => {
        const ratio = contrastRatio(tokens[token], tokens[ground])
        expect(
          ratio,
          `${token} (${tokens[token]}) on ${ground} (${tokens[ground]}) is ${ratio.toFixed(2)}:1. ` +
            `${role.note}`,
        ).toBeGreaterThanOrEqual(threshold)
      })
    }
  }
})

describe('D8 — the light-mode text floor is a computed floor, not a named hex', () => {
  it('no light-mode text token is lighter than #6f6b62 against the ground', () => {
    // Stated as a ratio rather than as a list of banned hexes, so a NEW too-light grey
    // is caught as well as the three D8 happened to name.
    const floor = contrastRatio('#6f6b62', LIGHT['--ground'])
    expect(floor).toBeCloseTo(4.88, 2)

    const offenders = Object.entries(TOKEN_ROLES)
      .filter(([, r]) => r.obligation.kind === 'text')
      .map(([token]) => [token, contrastRatio(LIGHT[token], LIGHT['--ground'])] as const)
      // --on-fg / --on-accent / --brand-on-primary are measured against their own fill,
      // not against the page, so the page ground says nothing about them.
      .filter(([token]) => !token.startsWith('--on-') && !token.startsWith('--brand-on-'))
      .filter(([, ratio]) => ratio < floor)

    expect(offenders, 'these sit below D8’s #6f6b62 floor').toEqual([])
  })

  it('the three retired greys are gone from light mode, and two survive in dark only', () => {
    const lightValues = Object.values(LIGHT)
    expect(lightValues).not.toContain('#a8a49a')
    expect(lightValues).not.toContain('#8f8b82')
    expect(lightValues).not.toContain('#7a766d')

    const darkValues = Object.values(DARK)
    expect(darkValues).toContain('#a8a49a')
    expect(darkValues).toContain('#8f8b82')
    // #7a766d is retired outright — neither mode, at 4.16:1 it never passed.
    expect(darkValues).not.toContain('#7a766d')
  })

  it('the ground stays #f7f5f1 — D8 forbids fixing a grey by lightening it', () => {
    expect(LIGHT['--ground']).toBe('#f7f5f1')
  })
})

/**
 * D7/G10. Belt colours are per-studio DATA (belt_rank.color_hex, SPEC §5.9), not
 * tokens — so this fixture is the set the contrast audit measured, kept here to prove
 * the ring is what rescues them. BeltBar takes a hex prop; it never reads these.
 */
const BELTS = {
  white: '#fffefb',
  yellow: '#d9a800',
  orange: '#c76a1e',
  green: '#1f6b3f',
  blue: '#2f6fa8',
  brown: '#6f4a2f',
  black: '#17150f',
} as const

describe('D7 — fill alone is not enough, which is why the ring is unconditional', () => {
  it('white belt is invisible on the light ground at 1.08:1', () => {
    expect(contrastRatio(BELTS.white, LIGHT['--ground'])).toBeCloseTo(1.08, 2)
  })

  it('black belt is invisible on the dark ground at 1.02:1', () => {
    expect(contrastRatio(BELTS.black, DARK['--ground'])).toBeCloseTo(1.02, 2)
  })

  it('yellow belt fails even the 3:1 non-text threshold on the light ground at 2.02:1', () => {
    expect(contrastRatio(BELTS.yellow, LIGHT['--ground'])).toBeCloseTo(2.02, 2)
    expect(contrastRatio(BELTS.yellow, LIGHT['--ground'])).toBeLessThan(NON_TEXT)
  })

  it('dark mode loses three more belts to fill-only, which the review never covered', () => {
    // canvas-review.md audited belts against the LIGHT ground only. Recorded here so
    // nobody later reads D7 as a three-case patch and adds a fill-only variant "just
    // for dark".
    for (const belt of ['black', 'brown', 'green'] as const) {
      expect(contrastRatio(BELTS[belt], DARK['--ground'])).toBeLessThan(NON_TEXT)
    }
  })

  it.each(Object.entries(BELTS))(
    'the ring rescues the %s belt in BOTH modes',
    (_name, fill) => {
      // The ring is the current foreground colour, so it is measured against the belt
      // fill it outlines — that is the edge a person actually sees.
      expect(contrastRatio(LIGHT['--belt-ring'], fill === LIGHT['--fg'] ? LIGHT['--ground'] : fill))
        .toBeGreaterThanOrEqual(NON_TEXT)
      expect(contrastRatio(DARK['--belt-ring'], fill === DARK['--fg'] ? DARK['--ground'] : fill))
        .toBeGreaterThanOrEqual(NON_TEXT)
    },
  )

  it('the ring itself is legible against the page in both modes', () => {
    expect(contrastRatio(LIGHT['--belt-ring'], LIGHT['--ground'])).toBeCloseTo(16.76, 2)
    expect(contrastRatio(DARK['--belt-ring'], DARK['--ground'])).toBeCloseTo(18.41, 2)
  })

  it('D7 says one pixel — a token so no component can quietly drop it to zero', () => {
    expect(LIGHT['--belt-ring-width']).toBe('1px')
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd web && npx vitest run packages/ui/src/tokens.audit.test.ts --reporter=dot`

Expected: **PASS**, because Task 2 Step 5 already wrote the corrected values.

**If you are implementing Task 3 against the pre-Task-2 palette instead** — which is the honest TDD order and is worth doing once to see the gate bite — temporarily restore the four seed values (`--border-strong: #e5e0d5` / `#4a4842`, dark `--accent`/`--paid: #3f8f52`, dark `--cancelled: #8f8b82`) and re-run. Expected failures, exactly four:

```
--border-strong on --ground is 1.21:1        (needs 3)
--border-strong on --ground is 1.84:1 (dark) (needs 3)
--paid on --surface is 4.22:1 (dark)         (needs 4.5)
--cancelled on --cancelled-tint is 4.34:1    (needs 4.5)
```

Then restore Task 2's values and watch them go green. **Record the four failure lines in the commit message** — that is the evidence the gate is real.

- [ ] **Step 3: Prove the obligation gate fires on a fresh regression**

```bash
cd web
# D8's worst offender, reintroduced as a text token
sed -i '' 's/--text-muted: #6f6b62;/--text-muted: #a8a49a;/' packages/ui/src/tokens.css
npx vitest run packages/ui/src/tokens.audit.test.ts --reporter=dot
# expect: "--text-muted on --ground reaches 4.5:1" FAILS at 2.28, AND the D8 floor test
# fails, AND the retired-grey test fails. Three independent failures for one hex.
git checkout packages/ui/src/tokens.css
```

- [ ] **Step 4: Run the whole UI package and the lane check**

Run: `cd web && npx vitest run packages/ui --reporter=dot`
Then: `cd .. && ./scripts/lane-check.sh core`
Expected: both green.

- [ ] **Step 5: Commit**

```bash
git add web/packages/ui/src/tokens.audit.test.ts
git commit -m "test(ui): D7 and D8 as computed obligations, not comments

The audit enumerates TOKEN_ROLES x grounds and recomputes every ratio from the
live values, so a new too-light grey is caught as well as the three D8 named.
Four seeded values failed it on first run and were corrected in the previous
commit:

  --border-strong  1.21:1 light / 1.84:1 dark   needs 3    (SC 1.4.11)
  --paid (dark)    4.22:1 on --surface          needs 4.5  (SC 1.4.3)
  --cancelled(dk)  4.34:1 on --cancelled-tint   needs 4.5  (SC 1.4.3)

The first two were never audited by canvas-review.md, which measured dark text
against the ground and never against the card surface."
```

---

## Task 4: `brand.ts` — a studio-supplied value cannot reach a semantic token

**Files:**
- Create: `web/packages/ui/src/brand.ts`
- Create: `web/packages/ui/src/brand.test.ts`
- Modify: `web/packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `TIERS`, `TOKEN_ROLES` from Task 2.
- Produces: `BRAND_TOKENS: readonly string[]`, `brandOverridesFor(input: Record<string, string>): Record<string, string>`, `applyBrand(el: HTMLElement, input: Record<string, string>): void`.

**Why this exists in v1, when D1 says brand is not settable.** The requirement is a *test* that a studio-supplied brand value cannot reach a semantic token — and there is nothing to test without a mechanism. `brandOverridesFor` is the single, guarded path a v2 colour picker must go through. Landing it now, unused and fully tested, is what stops v2 inventing a second, unguarded one. Five lines of runtime code; the value is entirely in the gate. Nothing in `apps/` calls it this milestone.

- [ ] **Step 1: Write the failing test**

Create `web/packages/ui/src/brand.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BRAND_TOKENS, applyBrand, brandOverridesFor } from './brand'
import { TOKEN_ROLES } from './tokens.roles'

describe('D2 — the brand tier is exactly the hue and its on-colour (D1)', () => {
  it('names only brand-tier tokens', () => {
    expect([...BRAND_TOKENS].sort()).toEqual(['--brand-on-primary', '--brand-primary'])
  })

  it('is derived from the roles table, so the two can never drift apart', () => {
    const fromRoles = Object.entries(TOKEN_ROLES)
      .filter(([, r]) => r.tier === 'brand')
      .map(([t]) => t)
      .sort()
    expect([...BRAND_TOKENS].sort()).toEqual(fromRoles)
  })
})

describe('a studio-supplied value cannot reach a semantic or structural token', () => {
  it('drops every semantic token D2 lists', () => {
    const hostile = {
      '--debt': '#00ff00',
      '--paid': '#00ff00',
      '--pending': '#00ff00',
      '--cancelled': '#00ff00',
      '--danger': '#00ff00',
      '--focus-ring': '#00ff00',
      '--brand-primary': '#123456',
    }
    expect(brandOverridesFor(hostile)).toEqual({ '--brand-primary': '#123456' })
  })

  it('drops structural tokens — type scale, spacing, radii, motion, and the belt ring', () => {
    const hostile = {
      '--fg': '#00ff00',
      '--ground': '#00ff00',
      '--belt-ring': 'transparent',
      '--belt-ring-width': '0',
      '--radius-md': '40px',
      '--text-body': '40px',
      '--motion-base': '9999ms',
    }
    expect(brandOverridesFor(hostile)).toEqual({})
  })

  it('drops anything that is not a token at all, including a CSS injection attempt', () => {
    const hostile = {
      color: 'red',
      '--brand-primary; --debt': '#00ff00',
      '--unknown-token': '#00ff00',
    }
    expect(brandOverridesFor(hostile)).toEqual({})
  })
})

describe('applyBrand writes only through that gate', () => {
  it('leaves --debt at its stylesheet value when a studio tries to set it', () => {
    const el = document.createElement('div')
    el.style.setProperty('--debt', '#b3261e')

    applyBrand(el, { '--debt': '#00ff00', '--brand-primary': '#123456' })

    // The behavioural assertion: the element's own inline --debt is untouched, and the
    // brand hue did land. Reading it back from the element is the real check — a test
    // over the filter function alone would not catch applyBrand bypassing it.
    expect(el.style.getPropertyValue('--debt')).toBe('#b3261e')
    expect(el.style.getPropertyValue('--brand-primary')).toBe('#123456')
  })

  it('writes nothing at all when a studio supplies only forbidden tokens', () => {
    const el = document.createElement('div')
    applyBrand(el, { '--focus-ring': '#00ff00', '--fg': '#00ff00' })
    expect(el.getAttribute('style')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd web && npx vitest run packages/ui/src/brand.test.ts --reporter=dot`
Expected: FAIL — `Failed to resolve import "./brand"`.

- [ ] **Step 3: Write the implementation**

Create `web/packages/ui/src/brand.ts`:

```ts
import { TOKEN_ROLES } from './tokens.roles'

/**
 * D2's tier gate. The ONE path a studio-supplied colour may take into the token layer.
 *
 * D1 means nothing calls this in v1 — a manager may upload a logo, not pick a hue. It
 * exists now so that when v2 adds the colour picker, there is already a guarded path
 * and a test suite around it, rather than a second unguarded one written under deadline.
 *
 * D2 consequence 1, recorded for whoever builds that picker: never render a studio's raw
 * hex. Derive a tint ramp and validate contrast AT THE MOMENT THE COLOUR IS SET — the
 * wizard rejects or auto-adjusts anything that cannot reach 4.5:1. `contrastRatio` from
 * ./contrast is what that validation should use.
 */
export const BRAND_TOKENS: readonly string[] = Object.entries(TOKEN_ROLES)
  .filter(([, role]) => role.tier === 'brand')
  .map(([token]) => token)

/**
 * Narrows an arbitrary studio-supplied record to brand-tier custom properties only.
 * Everything else — semantic, structural, non-tokens, injection attempts — is dropped
 * silently rather than throwing: a studio should not be able to break its own app by
 * sending an unexpected key.
 */
export function brandOverridesFor(input: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const token of BRAND_TOKENS) {
    if (Object.hasOwn(input, token)) out[token] = input[token]
  }
  return out
}

/** Applies the filtered result to an element. The only writer. */
export function applyBrand(el: HTMLElement, input: Record<string, string>): void {
  for (const [token, value] of Object.entries(brandOverridesFor(input))) {
    el.style.setProperty(token, value)
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd web && npx vitest run packages/ui/src/brand.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Export and commit**

In `web/packages/ui/src/index.ts` add:

```ts
export { BRAND_TOKENS, applyBrand, brandOverridesFor } from './brand'
export { GROUND_TOKENS, TIERS, TOKEN_ROLES } from './tokens.roles'
export type { GroundToken, Obligation, Tier, TokenRole } from './tokens.roles'
```

```bash
cd web && npm run typecheck && npx eslint packages/ui/src
cd .. && git add web/packages/ui/src/brand.ts web/packages/ui/src/brand.test.ts web/packages/ui/src/index.ts
git commit -m "feat(ui): D2's tier gate — a studio value cannot reach a semantic token"
```

---

## Task 5: close the CSS half of D10, prove it fires, and put it inside the lane check

**Files:**
- Modify: `web/.stylelintrc.json`
- Modify: `web/tools/__tests__/d10-logical-css.test.ts`
- Modify: `scripts/lane-check.sh`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing importable. The deliverable is a gate that bites.

**Three separate holes, all verified in this session** (see "What was verified empirically", findings 2–4):
1. `.stylelintrc.json` misses `inset`, the `border-*-left/right-*` longhands, and `clear`.
2. The stylelint rule has **no test** — only the ESLint half does.
3. `lane-check.sh core` — this session's exit gate — never runs stylelint at all, so `margin-left` in `tokens.css` passes it.

- [ ] **Step 1: Write the failing test**

Append to `web/tools/__tests__/d10-logical-css.test.ts`:

```ts
import stylelint from 'stylelint'

const CONFIG = new URL('../../.stylelintrc.json', import.meta.url).pathname

const lintCss = async (code: string) => {
  const { results } = await stylelint.lint({ code, configFile: CONFIG, codeFilename: 'probe.css' })
  return results.flatMap((r) => r.warnings.map((w) => w.text)).join('\n')
}

/**
 * The CSS half of D10. ESLint's rule is `no-restricted-syntax` over JS object
 * properties, so a physical property written in tokens.css or any other stylesheet is
 * completely invisible to it. Verified in M0.3: `margin-left` planted in tokens.css
 * left `lane-check.sh core` green.
 */
describe('D10 in stylesheets — stylelint is the only thing that reads these', () => {
  it.each([
    ['margin-left: 4px', /margin-left/],
    ['margin-right: 4px', /margin-right/],
    ['padding-left: 4px', /padding-left/],
    ['padding-right: 4px', /padding-right/],
    ['border-left: 1px solid red', /border-left/],
    ['border-right: 1px solid red', /border-right/],
    ['left: 0', /"left"/],
    ['right: 0', /"right"/],
  ])('rejects %s', async (decl, expected) => {
    expect(await lintCss(`.probe { ${decl}; }`)).toMatch(expected)
  })

  it.each([
    // The three holes this task closes.
    ['inset: 0 auto 0 0', /inset/],
    ['border-left-width: 1px', /border-left-width/],
    ['border-right-color: red', /border-right-color/],
    ['clear: left', /clear/],
  ])('rejects %s — the gap M0.3 found', async (decl, expected) => {
    expect(await lintCss(`.probe { ${decl}; }`)).toMatch(expected)
  })

  it.each([['float: left'], ['float: right'], ['text-align: left'], ['text-align: right']])(
    'rejects %s',
    async (decl) => {
      expect(await lintCss(`.probe { ${decl}; }`)).not.toBe('')
    },
  )

  it.each([
    'margin-inline-start: 4px',
    'padding-inline-end: 4px',
    'border-inline-start: 1px solid red',
    'inset-inline-start: 0',
    'inset-block: 0',
    'text-align: start',
    'margin-block: 4px',
    'border-start-start-radius: 4px',
  ])('accepts the logical equivalent %s', async (decl) => {
    expect(await lintCss(`.probe { ${decl}; }`)).toBe('')
  })

  it('names the replacement in the message, so it gets fixed rather than worked around', async () => {
    expect(await lintCss('.probe { margin-left: 4px; }')).toMatch(/inline-start/)
  })

  it('lints the real token file clean', async () => {
    // The gate has to be satisfiable by the code we actually ship, not only by fixtures.
    const { errored } = await stylelint.lint({
      files: [new URL('../../packages/ui/src/tokens.css', import.meta.url).pathname],
      configFile: CONFIG,
    })
    expect(errored).toBe(false)
  })
})
```

Note: `describe`, `expect` and `it` are already imported at the top of this file from `vitest`.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd web && npx vitest run tools/__tests__/d10-logical-css.test.ts --reporter=dot`
Expected: **4 failures** — `inset`, `border-left-width`, `border-right-color`, `clear`. Every other case already passes, which is itself the useful signal: it confirms the rest of the rule was real all along.

- [ ] **Step 3: Close the gaps in `.stylelintrc.json`**

Replace `web/.stylelintrc.json` with:

```json
{
  "extends": ["stylelint-config-standard"],
  "ignoreFiles": ["**/node_modules/**", "**/dist/**", "**/dev-dist/**"],
  "rules": {
    "property-disallowed-list": [
      [
        "margin-left", "margin-right", "padding-left", "padding-right",
        "border-left", "border-right", "left", "right",
        "border-top-left-radius", "border-top-right-radius",
        "border-bottom-left-radius", "border-bottom-right-radius",
        "/^border-(left|right)-/",
        "inset",
        "clear"
      ],
      {
        "message": "D10: physical CSS properties are banned. Use the logical equivalent — margin-inline-start / padding-inline-end / border-inline-start / inset-inline-start / inset-block / border-start-start-radius. The UI is genuinely bidirectional (SPEC §9), and an RTL bug of this kind is nearly invisible to an LTR reader."
      }
    ],
    "declaration-property-value-disallowed-list": [
      {
        "text-align": ["left", "right"],
        "float": ["left", "right"]
      },
      {
        "message": "D10: use the flow-relative value — text-align: start / end. float has no logical form; use flex or grid instead."
      }
    ],
    "custom-property-pattern": null,
    "import-notation": null,
    "selector-class-pattern": null
  }
}
```

Two notes on judgement calls made here:

- **`inset` is banned outright**, including the direction-agnostic `inset: 0`. `inset: 0` is genuinely safe, but `inset: 0 auto 0 0` is not, and no linter can tell a reviewer's intent from the shorthand. `inset-block: 0; inset-inline: 0` says what it means. The message names both replacements.
- **`clear` is banned as a property**, not as a value pair, because `clear: both` is only ever needed alongside a `float` that is itself banned.
- `background-position: left top` is **not** covered. It is legal, occasionally correct (a decorative image that should not mirror), and there is no instance of it in the codebase or in artboard `4h`. Recorded so the omission is a decision rather than an oversight.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd web && npx vitest run tools/__tests__/d10-logical-css.test.ts --reporter=dot`
Expected: PASS, all cases.

- [ ] **Step 5: Confirm the new rules do not break the CSS already in the repo**

Run: `cd web && npx stylelint "**/*.css" --allow-empty-input`
Expected: clean. If `inset` or `clear` appears anywhere, fix that site to the logical form now — do not weaken the rule.

- [ ] **Step 6: Put stylelint inside `lane-check.sh`**

In `scripts/lane-check.sh`, in the `lint · $V` section, immediately after the existing eslint block, add:

```bash
# CSS is invisible to eslint. D10's rule is a `no-restricted-syntax` rule over JS object
# properties, so a physical property written in a .css file never reaches it. Verified in
# M0.3 by planting `margin-left: 4px; inset: 0;` in tokens.css: `lane-check.sh core` went
# green with both in the file. A lane that writes CSS needs the CSS gate in its own check,
# not only in ci-local.
if [ "$V" = "core" ]; then
  SCOPED_GATES=$((SCOPED_GATES + 1))
  if [ "$DRY_RUN" = 1 ]; then
    printf '   would run: (cd web && stylelint "packages/**/*.css")\n'
  else
    ( cd web && npx stylelint "packages/**/*.css" )
  fi
elif [ -n "$eslint_targets" ]; then
  SCOPED_GATES=$((SCOPED_GATES + 1))
  if [ "$DRY_RUN" = 1 ]; then
    printf '   would run: (cd web && stylelint "apps/*/src/features/%s/**/*.css" --allow-empty-input)\n' "$V"
  else
    ( cd web && npx stylelint "apps/*/src/features/$V/**/*.css" --allow-empty-input )
  fi
else
  skip "no CSS for $V"
fi
```

`--allow-empty-input` on the vertical branch only: `packages/**/*.css` always matches at least `tokens.css` and `fonts.css`, so if it ever matches nothing that is a real problem and should fail.

- [ ] **Step 7: Prove the lane check now catches what it missed**

This is the same plant that was green before this task. It must now be red.

```bash
printf '\n.plant { margin-left: 4px; inset: 0; }\n' >> web/packages/ui/src/tokens.css
./scripts/lane-check.sh core          # expect: RED, naming both declarations
git checkout web/packages/ui/src/tokens.css
./scripts/lane-check.sh core          # expect: green again
```

Record the red output in the commit message.

- [ ] **Step 8: Commit**

```bash
git add web/.stylelintrc.json web/tools/__tests__/d10-logical-css.test.ts scripts/lane-check.sh
git commit -m "fix(lint): D10 covers stylesheets, and the lane check finally reads them

Three separate holes, each verified before being fixed:

  1. .stylelintrc.json missed `inset`, the border-*-left/right-* longhands and
     `clear`. (`float` was already covered — the session prompt's note on it was
     stale.)
  2. The stylelint rule had no test at all; only the ESLint half did.
  3. lane-check.sh never ran stylelint. `margin-left: 4px; inset: 0;` planted in
     tokens.css left `lane-check.sh core` green at exit 0 — and lane-check is
     M0.3's stated exit gate."
```

---

## Task 6: Rubik — confirm every weight the token layer names is actually precached

**Files:**
- Modify: `web/apps/staff/src/sw-precache.test.ts`
- Modify: `web/apps/parent/src/sw-precache.test.ts`
- Modify: `web/apps/dashboard/src/sw-precache.test.ts`
- Create: `web/packages/ui/src/fonts.test.ts`

**Interfaces:**
- Consumes: `TOKEN_ROLES` from Task 2 (for the `--weight-*` tokens).
- Produces: nothing importable.

**The thing worth getting right.** Rubik is shipped as a **variable** font: one file per subset, `font-weight: 300 900`. So "five weights" is not five files, and a test that counted files would be asserting something false. The real question — *can the browser actually render weight 700 offline?* — decomposes into two: does the single declared family's axis span every weight the tokens name, and are that family's files in the precache manifest. §6.1 assumes the font is there before a coach walks into a basement, so both halves matter.

- [ ] **Step 1: Write the failing test**

Create `web/packages/ui/src/fonts.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOKEN_ROLES } from './tokens.roles'

const css = readFileSync(resolve(process.cwd(), 'packages/ui/src/fonts.css'), 'utf-8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)
const tokens = readFileSync(resolve(process.cwd(), 'packages/ui/src/tokens.css'), 'utf-8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1])
const declared = (block: string, prop: string) =>
  block.match(new RegExp(`${prop}\\s*:\\s*([^;]+);`))?.[1].trim() ?? ''

describe('D6/G14 — one family, one loading strategy', () => {
  it('declares exactly one font-family across every @font-face', () => {
    // "One family also means one loading strategy, which matters for a PWA that must
    // work offline (§6.1) — every extra family is another asset to cache before a coach
    // walks into a basement."
    const families = new Set(faces.map((f) => declared(f, 'font-family')))
    expect(families.size).toBe(1)
    expect([...families][0]).toMatch(/Rubik/)
  })

  it('ships the four subsets SPEC §9 needs and no more', () => {
    // Base cyrillic U+0400-045F is where Russian lives — D6's whole argument for Rubik
    // over Heebo, Assistant and the two Noto/Plex families, which only carry
    // cyrillic-ext (U+0460-052F) and would silently fall back for a Russian parent.
    expect(faces).toHaveLength(4)
    const ranges = faces.map((f) => declared(f, 'unicode-range')).join(' ')
    expect(ranges).toMatch(/U\+0590-05FF/i) // hebrew
    expect(ranges).toMatch(/U\+0400-045F/i) // cyrillic, base
    expect(ranges).toMatch(/U\+0000-00FF/i) // latin
    expect(ranges).toMatch(/U\+0100-02BA/i) // latin-ext
    expect(ranges).not.toMatch(/U\+0600-06FF/i) // arabic, deliberately omitted
  })

  it('every weight the token layer names falls inside the declared variable axis', () => {
    // This is the assertion that actually answers "is weight 700 available offline".
    // Counting files would assert something false: Rubik is a variable font, so one
    // file per subset carries the whole axis.
    const weights = Object.keys(TOKEN_ROLES)
      .filter((t) => t.startsWith('--weight-'))
      .map((t) => Number(tokens.match(new RegExp(`${t}\\s*:\\s*(\\d+);`))?.[1]))

    expect(weights).toEqual(expect.arrayContaining([300, 400, 500, 600, 700]))
    expect(weights.every((w) => Number.isFinite(w))).toBe(true)

    for (const face of faces) {
      const [min, max] = declared(face, 'font-weight').split(/\s+/).map(Number)
      for (const w of weights) {
        expect(w, `weight ${w} is outside the declared axis ${min}-${max}`).toBeGreaterThanOrEqual(min)
        expect(w).toBeLessThanOrEqual(max)
      }
    }
  })

  it('uses font-display: swap on every face, so text is never invisible while loading', () => {
    for (const face of faces) expect(declared(face, 'font-display')).toBe('swap')
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd web && npx vitest run packages/ui/src/fonts.test.ts --reporter=dot`
Expected: FAIL on the weights case — `--weight-*` tokens do not exist until Task 2 lands. If Task 2 is already done, this passes; in that case verify the gate by temporarily setting `--weight-bold: 950;` in `tokens.css` and confirming it goes red against the `300 900` axis, then revert.

- [ ] **Step 3: Extend the three precache specs**

In each of `web/apps/{staff,parent,dashboard}/src/sw-precache.test.ts`, replace the Rubik test with:

```ts
  it('precaches all four Rubik subsets — §6.1 offline priming assumes the font is there', () => {
    // Rubik is a VARIABLE font: one file per subset carrying the whole 300-900 axis, so
    // this is what "weights 300/400/500/600/700 are available offline" reduces to. The
    // axis itself is asserted in packages/ui/src/fonts.test.ts.
    const text = precacheText()
    expect(text).toMatch(/rubik-hebrew[^"']*\.woff2/)
    expect(text).toMatch(/rubik-latin-wght[^"']*\.woff2/)
    expect(text).toMatch(/rubik-latin-ext[^"']*\.woff2/)
    expect(text).toMatch(/rubik-cyrillic[^"']*\.woff2/)
  })
```

`rubik-latin-wght` rather than `rubik-latin`: the bare prefix also matches `rubik-latin-ext`, so the original assertion passed even if the latin subset itself were dropped.

- [ ] **Step 4: Build, then run the precache specs**

```bash
cd web && npm run build && npx vitest run apps/staff/src/sw-precache.test.ts apps/parent/src/sw-precache.test.ts apps/dashboard/src/sw-precache.test.ts --reporter=dot
```

Expected: PASS. The build must precede the specs — they assert built output, so running them on a stale `dist/` hides a real regression.

- [ ] **Step 5: Prove the latin-ext assertion is not vacuous**

```bash
cd web
# Comment out the rubik-latin-ext @font-face block in packages/ui/src/fonts.css
npm run build && npx vitest run apps/staff/src/sw-precache.test.ts --reporter=dot   # expect RED
git checkout packages/ui/src/fonts.css && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add web/packages/ui/src/fonts.test.ts web/apps/*/src/sw-precache.test.ts
git commit -m "test(ui): every weight the tokens name is inside the precached axis

Rubik is a variable font, so 'five weights' is one file per subset carrying a
300-900 axis, not five files. The assertion that answers the offline question is
axis-covers-tokens plus subset-is-precached. Also tightened the latin matcher:
/rubik-latin/ also matched rubik-latin-ext, so the latin subset could have been
dropped without the test noticing."
```

---

## The primitive layer — conventions every task from here on follows

Read this once; Tasks 7–18 all assume it.

**Where the styling lives.** One stylesheet, `web/packages/ui/src/primitives/primitives.css`, imported from `index.ts` beside `tokens.css`. **Not** inline style objects: the primitives need `:focus-visible`, `:hover`, `:disabled` and `prefers-reduced-motion`, and none of those can be expressed inline. This also makes the stylelint gate Task 5 wired into `lane-check.sh` genuinely load-bearing rather than ceremonial.

**Variants are data attributes, not class names.** A primitive sets `data-variant`, `data-state`, `data-status` or `data-tone`; the CSS selects on `[data-variant="primary"]`. Two reasons: the attribute is a documented API a test can assert, whereas a class name is a styling implementation detail; and jsdom does not apply stylesheet rules, so a class-name assertion would be testing nothing observable either way. Each such test says so in its docstring, per the repo convention.

**The one exception is D7's belt ring**, which is applied as an **inline** style so that it *is* observable in jsdom. G10 says there is no fill-only variant to reach for — making the ring the one thing a test can read directly off the element is what turns that from a rule into a gate.

**Text comes in as props.** G4's inline-string lint rule is scoped to `apps/*/src/**/*.tsx`; `packages/ui` primitives are deliberately outside it because a primitive that reached into i18n could not be reused with a caller-supplied label. Every visible string is a required prop. A primitive that renders text it was not given is a bug.

**Every primitive test renders in `he`/RTL and `en`/LTR, in both themes** (§13). The `renderIn` helper from Task 7 is how.

**Naming.** Class names are prefixed `studio-` to avoid collision with app CSS. Files are `PascalCase.tsx` with `PascalCase.test.tsx` beside them, under `web/packages/ui/src/primitives/`.

---

## Task 7: the primitive foundation — `primitives.css`, the bidirectional test harness, and `Card`

**Files:**
- Create: `web/packages/ui/src/testing.tsx`
- Create: `web/packages/ui/src/primitives/primitives.css`
- Create: `web/packages/ui/src/primitives/Card.tsx`
- Create: `web/packages/ui/src/primitives/Card.test.tsx`
- Modify: `web/packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `ThemeProvider`, `THEME_STORAGE_KEY` from `./ThemeProvider` / `./theme`; `DIRECTION`, `Locale` from `@studio/i18n`.
- Produces: `renderIn(ui, { locale, theme })`, `DIRECTIONS`, `THEMES` from `./testing`; `Card` from `./primitives/Card`. **Every task from 8 onward imports `renderIn`, `DIRECTIONS` and `THEMES`.**

`Card` is first because artboard `4h` wraps all eight of its panels in the same surface — `#fffefb`, 1px hairline, 14px corner, 18px/20px padding, with a 12px/500 caption in `--text-muted`. It is the smallest primitive that exercises the whole harness.

- [ ] **Step 1: Write the failing test**

Create `web/packages/ui/src/primitives/Card.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { Card } from './Card'

describe.each(DIRECTIONS)('Card in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('renders its children and flows in the document direction', () => {
      renderIn(
        <Card caption="Buttons">
          <p>content</p>
        </Card>,
        { locale, theme },
      )
      expect(screen.getByText('content')).toBeInTheDocument()
      expect(document.documentElement.dir).toBe(dir)
      expect(document.documentElement.dataset.theme).toBe(theme)
    })

    it('exposes the caption as the accessible name of a region', () => {
      // Behavioural: 4h's eight panels are labelled groups, so a screen-reader user
      // can tell which set of controls they are inside.
      renderIn(<Card caption="Status chips">x</Card>, { locale, theme })
      expect(screen.getByRole('region', { name: 'Status chips' })).toBeInTheDocument()
    })
  })
})

describe('Card', () => {
  it('renders without a caption, and is then not a labelled region', () => {
    renderIn(<Card>bare</Card>)
    expect(screen.getByText('bare')).toBeInTheDocument()
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('forwards a className so a feature can position it without reopening this file', () => {
    renderIn(<Card className="wide">x</Card>)
    expect(screen.getByText('x').closest('.studio-card')).toHaveClass('wide')
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd web && npx vitest run packages/ui/src/primitives/Card.test.tsx --reporter=dot`
Expected: FAIL — cannot resolve `../testing` or `./Card`.

- [ ] **Step 3: Write the test harness**

Create `web/packages/ui/src/testing.tsx`:

```tsx
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { DIRECTION } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { ThemeProvider } from './ThemeProvider'
import { THEME_STORAGE_KEY } from './theme'
import type { ResolvedTheme } from './theme'

/**
 * SPEC §13: "Every component rendered in both `he` (RTL) and `en` (LTR)". SPEC §9: the
 * UI is genuinely bidirectional, not RTL-only with LTR bolted on. Every primitive test
 * runs this matrix, so a physical property or a hard-coded direction fails at the
 * component that introduced it rather than during M10's sweep.
 */
export const DIRECTIONS = [
  { locale: 'he', dir: 'rtl' },
  { locale: 'en', dir: 'ltr' },
] as const satisfies readonly { locale: Locale; dir: 'rtl' | 'ltr' }[]

export const THEMES = ['light', 'dark'] as const

/**
 * Renders inside the REAL ThemeProvider rather than stubbing the theme onto the root.
 * The theme is forced through localStorage, which is the provider's own input — a test
 * that set `data-theme` directly would pass even if the provider stopped working.
 */
export function renderIn(
  ui: ReactElement,
  { locale = 'he', theme = 'light' }: { locale?: Locale; theme?: ResolvedTheme } = {},
) {
  globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme)
  document.documentElement.lang = locale
  document.documentElement.dir = DIRECTION[locale]
  return render(<ThemeProvider>{ui}</ThemeProvider>)
}
```

- [ ] **Step 4: Write `primitives.css` with the Card rule**

Create `web/packages/ui/src/primitives/primitives.css`:

```css
/* Primitives ported from dashboard artboard 4h (ספריית רכיבים) as a VISUAL REFERENCE.
 * No declaration here was copy-pasted from the export — D10. Every value is a token.
 *
 * Logical properties only. stylelint enforces it (web/.stylelintrc.json) and, since
 * M0.3, `lane-check.sh core` runs stylelint over packages/**\/*.css. */

.studio-card {
  background: var(--surface);
  border: var(--border-width-hairline) solid var(--border);
  border-radius: var(--radius-xl);
  padding-block: 18px;
  padding-inline: var(--space-5);
}

.studio-card__caption {
  color: var(--text-muted);
  font-size: var(--text-caption);
  font-weight: var(--weight-medium);
  line-height: var(--leading-tight);
  margin-block: 0 var(--space-3);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 5: Write `Card.tsx`**

Create `web/packages/ui/src/primitives/Card.tsx`:

```tsx
import { useId } from 'react'
import type { ReactNode } from 'react'

/**
 * Artboard 4h wraps all eight of its panels in one surface. This is that surface.
 *
 * The caption becomes the region's accessible name rather than a bare heading, so a
 * screen-reader user can tell which group of controls they are inside — 4h's captions
 * are group labels, not document structure.
 */
export function Card({
  caption,
  className,
  children,
}: {
  caption?: string
  className?: string
  children: ReactNode
}) {
  const captionId = useId()
  return (
    <section
      className={className ? `studio-card ${className}` : 'studio-card'}
      {...(caption ? { 'aria-labelledby': captionId } : {})}
    >
      {caption ? (
        <p className="studio-card__caption" id={captionId}>
          {caption}
        </p>
      ) : null}
      {children}
    </section>
  )
}
```

A `<section>` is only exposed as `role="region"` when it has an accessible name, which is exactly the behaviour the last test asserts — no `role` attribute is needed, and adding one would make the uncaptioned case wrong.

- [ ] **Step 6: Wire the stylesheet and the export**

In `web/packages/ui/src/index.ts`:

```ts
import './fonts.css'
import './tokens.css'
import './primitives/primitives.css'

export { Card } from './primitives/Card'
```

- [ ] **Step 7: Run the test and confirm it passes**

Run: `cd web && npx vitest run packages/ui/src/primitives/Card.test.tsx --reporter=dot`
Expected: PASS — 10 cases (2 locales × 2 themes × 2, plus 2 standalone).

- [ ] **Step 8: Prove the direction half of the harness is not vacuous**

```bash
cd web
# In testing.tsx, temporarily hard-code: document.documentElement.dir = 'rtl'
npx vitest run packages/ui/src/primitives/Card.test.tsx --reporter=dot   # expect RED on the en/ltr cases
git checkout packages/ui/src/testing.tsx
```

If the `en` cases stay green with the direction pinned to `rtl`, the matrix is decorative and every later primitive test inherits that.

- [ ] **Step 9: Typecheck, lint, commit**

```bash
cd web && npm run typecheck && npx eslint packages/ui/src && npx stylelint "packages/**/*.css"
cd .. && git add web/packages/ui/src/testing.tsx web/packages/ui/src/primitives/ web/packages/ui/src/index.ts
git commit -m "feat(ui): the primitive foundation — bidirectional harness and Card"
```

---

## Task 8: `ThemeControl` — D4 wired to a real control on all three apps

**Files:**
- Create: `web/packages/ui/src/primitives/ThemeControl.tsx`
- Create: `web/packages/ui/src/primitives/ThemeControl.test.tsx`
- Modify: `web/packages/ui/src/primitives/primitives.css`
- Modify: `web/packages/ui/src/index.ts`
- Modify: `web/packages/i18n/{he,en,ru}/common.ts`
- Modify: `web/apps/{staff,parent,dashboard}/src/App.tsx`
- Modify: `web/packages/ui/src/HelloProof.tsx`

**Interfaces:**
- Consumes: `useTheme` from `../ThemeProvider`; `renderIn`, `DIRECTIONS`, `THEMES` from `../testing`.
- Produces: `ThemeControl` — props `{ legend: string; labels: Record<ThemePreference, string>; stateLabels: Record<ResolvedTheme, string> }`.

**Two design points, both from the canvas.** `4h`'s toggle card is captioned *"מתגים ובחירה — תמיד עם תווית מצב"* ("always with a status label"), and `2e`/`3f` both carry *"לכל מתג יש תווית מצב"*. That came from a real Arbox reviewer who could not tell whether a toggle was on. So `ThemeControl` renders the **resolved** theme as visible text, not only the selected preference — which also disambiguates the one case that genuinely confuses people: "System" selected, and which one did that actually give me?

Native radio inputs, not buttons with `aria-checked`: they bring arrow-key navigation, the roving tab stop and the group semantics for free, and D4's three options are mutually exclusive.

- [ ] **Step 1: Add the i18n keys**

`web/packages/i18n/he/common.ts` — add:

```ts
  'theme.legend': 'ערכת נושא',
  'theme.state.light': 'מצב נוכחי: בהיר',
  'theme.state.dark': 'מצב נוכחי: כהה',
```

`web/packages/i18n/en/common.ts` — add:

```ts
  'theme.legend': 'Theme',
  'theme.state.light': 'Currently: light',
  'theme.state.dark': 'Currently: dark',
```

`web/packages/i18n/ru/common.ts` — add:

```ts
  'theme.legend': 'Тема',
  'theme.state.light': 'Сейчас: светлая',
  'theme.state.dark': 'Сейчас: тёмная',
```

`theme.light` / `theme.dark` / `theme.system` already exist in all three locales.

- [ ] **Step 2: Write the failing test**

Create `web/packages/ui/src/primitives/ThemeControl.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { t } from '@studio/i18n'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { ThemeControl } from './ThemeControl'

const props = (locale: 'he' | 'en') => ({
  legend: t(locale, 'common.theme.legend'),
  labels: {
    light: t(locale, 'common.theme.light'),
    dark: t(locale, 'common.theme.dark'),
    system: t(locale, 'common.theme.system'),
  },
  stateLabels: {
    light: t(locale, 'common.theme.state.light'),
    dark: t(locale, 'common.theme.state.dark'),
  },
})

describe.each(DIRECTIONS)('ThemeControl in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('offers exactly D4s three options as one radio group', () => {
      renderIn(<ThemeControl {...props(locale)} />, { locale, theme })
      const group = screen.getByRole('radiogroup', { name: props(locale).legend })
      expect(group).toBeInTheDocument()
      expect(screen.getAllByRole('radio')).toHaveLength(3)
      expect(document.documentElement.dir).toBe(dir)
    })

    it('marks exactly one option selected, and it is the stored preference', () => {
      renderIn(<ThemeControl {...props(locale)} />, { locale, theme })
      const checked = screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked)
      expect(checked).toHaveLength(1)
      expect(checked[0]).toHaveAccessibleName(props(locale).labels[theme])
    })

    it('always shows a visible state label — 4h: "תמיד עם תווית מצב"', () => {
      renderIn(<ThemeControl {...props(locale)} />, { locale, theme })
      expect(screen.getByText(props(locale).stateLabels[theme])).toBeVisible()
    })
  })
})

describe('ThemeControl behaviour (D4)', () => {
  it('applies the chosen theme to the document root', async () => {
    const user = userEvent.setup()
    renderIn(<ThemeControl {...props('he')} />, { theme: 'light' })
    await user.click(screen.getByRole('radio', { name: 'כהה' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('persists the preference, so it survives a reload', async () => {
    const user = userEvent.setup()
    renderIn(<ThemeControl {...props('he')} />, { theme: 'light' })
    await user.click(screen.getByRole('radio', { name: 'כהה' }))
    expect(globalThis.localStorage.getItem('studio.theme')).toBe('dark')
  })

  it('reports the RESOLVED theme when System is chosen, not the word "System"', () => {
    // The one case that genuinely confuses people: System is selected — which did I get?
    // matchMedia is stubbed to light in the jsdom setup, so System resolves to light.
    renderIn(<ThemeControl {...props('he')} />, { theme: 'light' })
    globalThis.localStorage.setItem('studio.theme', 'system')
    expect(screen.getByText('מצב נוכחי: בהיר')).toBeVisible()
  })

  it('takes every visible string as a prop — no primitive reaches into i18n (G4)', async () => {
    // A primitive that fetched its own copy could not be reused with a caller's label.
    renderIn(
      <ThemeControl
        legend="L"
        labels={{ light: 'A', dark: 'B', system: 'C' }}
        stateLabels={{ light: 'now-A', dark: 'now-B' }}
      />,
      { theme: 'light' },
    )
    expect(screen.getByRole('radiogroup', { name: 'L' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'A' })).toBeInTheDocument()
    expect(screen.getByText('now-A')).toBeVisible()
  })
})
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `cd web && npx vitest run packages/ui/src/primitives/ThemeControl.test.tsx --reporter=dot`
Expected: FAIL — cannot resolve `./ThemeControl`. If `@testing-library/user-event` is not installed, `npm i -D @testing-library/user-event -w @studio/web` first.

- [ ] **Step 4: Write `ThemeControl.tsx`**

```tsx
import { useId } from 'react'
import { useTheme } from '../ThemeProvider'
import type { ResolvedTheme, ThemePreference } from '../theme'

const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'] as const

/**
 * D4 — Light · Dark · System, user-settable, on every app. "System" follows the OS,
 * which both iOS and Android already schedule by hour; duplicating that scheduler would
 * also override someone who deliberately runs their phone dark all day.
 *
 * Native radios rather than buttons with aria-checked: arrow-key navigation, the roving
 * tab stop and the group semantics come free, and the three options are exclusive.
 *
 * The visible state label reports the RESOLVED theme, not the preference. Artboard 4h
 * captions its toggle card "תמיד עם תווית מצב", and 2e/3f repeat it — it came from an
 * Arbox reviewer who could not tell whether a toggle was on. "System" selected leaves
 * exactly that ambiguity, so the resolved value is the thing worth showing.
 */
export function ThemeControl({
  legend,
  labels,
  stateLabels,
}: {
  legend: string
  labels: Record<ThemePreference, string>
  stateLabels: Record<ResolvedTheme, string>
}) {
  const { preference, resolved, setPreference } = useTheme()
  const name = useId()

  return (
    <fieldset className="studio-theme-control">
      <legend className="studio-theme-control__legend">{legend}</legend>
      <div className="studio-theme-control__options">
        {PREFERENCES.map((p) => (
          <label className="studio-theme-control__option" data-selected={preference === p} key={p}>
            <input
              checked={preference === p}
              className="studio-theme-control__input"
              name={name}
              onChange={() => setPreference(p)}
              type="radio"
              value={p}
            />
            <span>{labels[p]}</span>
          </label>
        ))}
      </div>
      <p className="studio-theme-control__state">{stateLabels[resolved]}</p>
    </fieldset>
  )
}
```

A `<fieldset>` with a `<legend>` is exposed as `role="radiogroup"` by the accessibility tree once it contains radios, which is what the first test asserts.

- [ ] **Step 5: Add the CSS**

Append to `primitives.css`:

```css
.studio-theme-control {
  border: 0;
  margin: 0;
  padding: 0;
}

.studio-theme-control__legend {
  color: var(--text-muted);
  font-size: var(--text-caption);
  font-weight: var(--weight-medium);
  padding: 0;
}

.studio-theme-control__options {
  background: var(--ground);
  border-radius: var(--radius-md);
  display: flex;
  gap: var(--space-1);
  margin-block-start: var(--space-2);
  padding: 3px;
}

.studio-theme-control__option {
  border-radius: 7px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--text-label);
  font-weight: var(--weight-regular);
  padding-block: 7px;
  padding-inline: 13px;
  transition: background var(--motion-fast) var(--ease-standard);
}

.studio-theme-control__option[data-selected='true'] {
  background: var(--fg);
  color: var(--on-fg);
  font-weight: var(--weight-medium);
}

/* The radio stays in the accessibility tree and keeps keyboard focus — it is placed
 * off-screen, never display:none, which would remove it from the tab order. */
.studio-theme-control__input {
  block-size: 1px;
  clip-path: inset(50%);
  inline-size: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
}

.studio-theme-control__option:has(.studio-theme-control__input:focus-visible) {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.studio-theme-control__state {
  color: var(--text-muted);
  font-size: var(--text-caption);
  margin-block: var(--space-2) 0;
}
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `cd web && npx vitest run packages/ui/src/primitives/ThemeControl.test.tsx --reporter=dot`
Expected: PASS.

- [ ] **Step 7: Mount it on all three apps**

In `web/packages/ui/src/HelloProof.tsx`, replace the ad-hoc three-button group at the bottom (the `<div role="group">` block and the `PREFERENCES` constant above it) with:

```tsx
      <ThemeControl
        labels={{
          light: t(locale, 'common.theme.light'),
          dark: t(locale, 'common.theme.dark'),
          system: t(locale, 'common.theme.system'),
        }}
        legend={t(locale, 'common.theme.legend')}
        stateLabels={{
          light: t(locale, 'common.theme.state.light'),
          dark: t(locale, 'common.theme.state.dark'),
        }}
      />
```

Add `import { ThemeControl } from './primitives/ThemeControl'`, and drop the now-unused `useTheme` destructure of `preference`/`setPreference` (keep `resolved`, which the `resolved-theme` readout still uses).

All three apps render `HelloProof`, so this mounts the real control on staff, parent and dashboard at once — D4 asks for both apps; this covers all three surfaces.

- [ ] **Step 8: Update the `HelloProof` test that counted the old buttons**

`web/packages/ui/src/HelloProof.test.tsx` — replace the last case:

```tsx
  it('offers all three D4 theme options as one radio group, with the resolved state shown', () => {
    renderProof()
    expect(screen.getByRole('radiogroup', { name: 'ערכת נושא' })).toBeInTheDocument()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
    expect(radios.filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1)
    expect(screen.getByText(/מצב נוכחי:/)).toBeVisible()
  })
```

- [ ] **Step 9: Run the whole frontend and the lane check**

```bash
cd web && npm run typecheck && npx eslint . && npx stylelint "**/*.css" && npm test
cd .. && ./scripts/lane-check.sh core && node web/scripts/i18n-parity.mjs
```

Expected: all green, and parity clean across `he`/`en`/`ru` for the three new keys.

- [ ] **Step 10: Commit**

```bash
git add web/packages/ui/src/primitives/ThemeControl.tsx web/packages/ui/src/primitives/ThemeControl.test.tsx \
        web/packages/ui/src/primitives/primitives.css web/packages/ui/src/index.ts \
        web/packages/ui/src/HelloProof.tsx web/packages/ui/src/HelloProof.test.tsx \
        web/packages/i18n/he/common.ts web/packages/i18n/en/common.ts web/packages/i18n/ru/common.ts
git commit -m "feat(ui): D4's Light/Dark/System as a real control on all three apps

Reports the RESOLVED theme rather than the preference: 'System' selected is
exactly the case where a person cannot tell what they got, and 4h/2e/3f all
caption their toggles 'לכל מתג יש תווית מצב' for that reason."
```

---

## Task 9: `Button` — 4h's five states

**Files:**
- Create: `web/packages/ui/src/primitives/Button.tsx`, `Button.test.tsx`
- Modify: `web/packages/ui/src/primitives/primitives.css`, `web/packages/ui/src/index.ts`

**Interfaces:**
- Consumes: `renderIn`, `DIRECTIONS`, `THEMES`.
- Produces: `Button`, and `type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'`.

From `4h`'s כפתורים card: ראשי (ink fill), משני (1.5px ink outline), שקוף (1px 20%-ink outline, weight 400 — the only button not at 500), הרסני (1.5px danger outline, danger text), מושבת (10%-ink fill, muted text), and a focus state shown as a 3px ring rather than a border change. Radius 9px, padding 11px/18px.

- [ ] **Step 1: Write the failing test**

```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { Button } from './Button'

const VARIANTS = ['primary', 'secondary', 'ghost', 'destructive'] as const

describe.each(DIRECTIONS)('Button in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it.each(VARIANTS)('renders the %s variant as a real button with its label', (variant) => {
      renderIn(<Button variant={variant}>שמור</Button>, { locale, theme })
      expect(screen.getByRole('button', { name: 'שמור' })).toBeInTheDocument()
      expect(document.documentElement.dir).toBe(dir)
    })
  })
})

describe('Button', () => {
  it('defaults to the primary variant', () => {
    renderIn(<Button>x</Button>)
    // data-variant is the documented API the stylesheet selects on. jsdom applies no
    // stylesheet rules, so the attribute is the only observable form of the variant.
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'primary')
  })

  it.each(VARIANTS)('exposes %s through data-variant', (variant) => {
    renderIn(<Button variant={variant}>x</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('data-variant', variant)
  })

  it('defaults to type=button, so it never submits a form by accident', () => {
    renderIn(<Button>x</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('honours an explicit type', () => {
    renderIn(<Button type="submit">x</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('calls onClick when pressed', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    renderIn(<Button onClick={onClick}>x</Button>)
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not call onClick when disabled', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    renderIn(
      <Button disabled onClick={onClick}>
        x
      </Button>,
    )
    await user.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('is reachable by keyboard and activates on Enter', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    renderIn(<Button onClick={onClick}>x</Button>)
    await user.tab()
    expect(screen.getByRole('button')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('takes its label as a prop — the primitive never reaches into i18n (G4)', () => {
    renderIn(<Button>caller-supplied</Button>)
    expect(screen.getByRole('button', { name: 'caller-supplied' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails.** `cd web && npx vitest run packages/ui/src/primitives/Button.test.tsx --reporter=dot` → cannot resolve `./Button`.

- [ ] **Step 3: Write `Button.tsx`**

```tsx
import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'

/**
 * Artboard 4h, card כפתורים. Five appearances, four of them variants and one — disabled
 * — a state of any variant, which is why `disabled` stays a native attribute rather than
 * becoming a fifth variant: it must also switch off the click, the focus and the
 * accessibility state, and only the real attribute does all four.
 *
 * `type` defaults to "button". The HTML default is "submit", which makes any button
 * inside a form submit it — a bug that only appears once forms exist, i.e. in someone
 * else's lane.
 */
export function Button({
  variant = 'primary',
  type = 'button',
  className,
  ...rest
}: { variant?: ButtonVariant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={className ? `studio-btn ${className}` : 'studio-btn'}
      data-variant={variant}
      type={type}
      {...rest}
    />
  )
}
```

- [ ] **Step 4: Append the CSS**

```css
.studio-btn {
  background: transparent;
  border: var(--border-width-hairline) solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--text-body);
  font-weight: var(--weight-medium);
  line-height: var(--leading-tight);
  padding-block: var(--control-pad-block);
  padding-inline: var(--control-pad-inline);
  transition: background var(--motion-fast) var(--ease-standard);
}

.studio-btn[data-variant='primary'] {
  background: var(--fg);
  color: var(--on-fg);
}

.studio-btn[data-variant='secondary'] {
  border-color: var(--fg);
  border-width: var(--border-width-strong);
  color: var(--fg);
}

.studio-btn[data-variant='ghost'] {
  border-color: var(--border-strong);
  color: var(--fg);
  font-weight: var(--weight-regular);
}

.studio-btn[data-variant='destructive'] {
  border-color: var(--danger);
  border-width: var(--border-width-strong);
  color: var(--danger);
}

.studio-btn:disabled {
  background: var(--disabled-surface);
  border-color: transparent;
  color: var(--text-muted);
  cursor: not-allowed;
}

.studio-btn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
```

`--border-strong` is what the ghost button's boundary uses — it is the token Task 3 raised to 3:1 precisely because a ghost button's outline is the *only* thing identifying it as a control (SC 1.4.11).

- [ ] **Step 5: Run the test and confirm it passes.** Expected: PASS.
- [ ] **Step 6: Export from `index.ts`:** `export { Button } from './primitives/Button'` and `export type { ButtonVariant } from './primitives/Button'`.
- [ ] **Step 7: Typecheck, lint, commit**

```bash
cd web && npm run typecheck && npx eslint packages/ui/src && npx stylelint "packages/**/*.css"
cd .. && git add web/packages/ui/src/primitives/Button.tsx web/packages/ui/src/primitives/Button.test.tsx web/packages/ui/src/primitives/primitives.css web/packages/ui/src/index.ts
git commit -m "feat(ui): Button — 4h's four variants plus the disabled state"
```

---

## Task 10: `TextField`

**Files:**
- Create: `web/packages/ui/src/primitives/TextField.tsx`, `TextField.test.tsx`
- Modify: `primitives.css`, `index.ts`

**Interfaces:**
- Produces: `TextField` — props `{ label: string; error?: string; hint?: string; id?: string }` plus `InputHTMLAttributes<HTMLInputElement>`.

From `4h`'s שדות קלט card: empty / focused / filled / error, radius 9px, padding 11px/12px, 14px regular; focused takes a 1.5px ink border; error takes a 1.5px danger border with 12px danger helper text (*"נדרש מספר טלפון תקין"*).

- [ ] **Step 1: Write the failing test**

```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { TextField } from './TextField'

describe.each(DIRECTIONS)('TextField in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('is labelled, so getByLabelText finds it', () => {
      renderIn(<TextField label="טלפון" />, { locale, theme })
      expect(screen.getByLabelText('טלפון')).toBeInTheDocument()
      expect(document.documentElement.dir).toBe(dir)
    })

    it('announces its error through aria-invalid and aria-describedby', () => {
      renderIn(<TextField error="נדרש מספר טלפון תקין" label="טלפון" />, { locale, theme })
      const input = screen.getByLabelText('טלפון')
      expect(input).toBeInvalid()
      expect(input).toHaveAccessibleDescription('נדרש מספר טלפון תקין')
    })
  })
})

describe('TextField', () => {
  it('accepts typing and reports the value', async () => {
    const user = userEvent.setup()
    renderIn(<TextField label="שם" />)
    await user.type(screen.getByLabelText('שם'), 'דנה')
    expect(screen.getByLabelText('שם')).toHaveValue('דנה')
  })

  it('is not invalid when there is no error', () => {
    renderIn(<TextField label="שם" />)
    expect(screen.getByLabelText('שם')).not.toBeInvalid()
    expect(screen.getByLabelText('שם')).toHaveAttribute('data-state', 'default')
  })

  it('exposes the error state through data-state for the stylesheet', () => {
    // Only-source-observable: jsdom applies no stylesheet, so the attribute is the
    // testable form of "this field is drawn with the 1.5px danger border".
    renderIn(<TextField error="bad" label="שם" />)
    expect(screen.getByLabelText('שם')).toHaveAttribute('data-state', 'error')
  })

  it('describes itself with a hint when there is no error', () => {
    renderIn(<TextField hint="עשר ספרות" label="טלפון" />)
    expect(screen.getByLabelText('טלפון')).toHaveAccessibleDescription('עשר ספרות')
  })

  it('prefers the error over the hint when both are present', () => {
    // Two descriptions would be read out one after the other; the error is the one
    // that needs acting on.
    renderIn(<TextField error="שגיאה" hint="עשר ספרות" label="טלפון" />)
    expect(screen.getByLabelText('טלפון')).toHaveAccessibleDescription('שגיאה')
  })

  it('generates a unique id per instance, so two fields do not share a label', () => {
    renderIn(
      <>
        <TextField label="א" />
        <TextField label="ב" />
      </>,
    )
    expect(screen.getByLabelText('א').id).not.toBe(screen.getByLabelText('ב').id)
  })

  it('honours a caller-supplied id', () => {
    renderIn(<TextField id="phone" label="טלפון" />)
    expect(screen.getByLabelText('טלפון')).toHaveAttribute('id', 'phone')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails.**

- [ ] **Step 3: Write `TextField.tsx`**

```tsx
import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'

/**
 * Artboard 4h, card שדות קלט. Four states: empty, focused, filled, error.
 *
 * `focused` and `filled` are not props — they are CSS states (:focus-visible, and the
 * value simply being there). Only `error` needs to be told, because nothing in the DOM
 * implies it.
 */
export function TextField({
  label,
  error,
  hint,
  id,
  className,
  ...rest
}: {
  label: string
  error?: string
  hint?: string
} & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId()
  const inputId = id ?? generated
  const messageId = `${inputId}-message`
  const message = error ?? hint

  return (
    <div className={className ? `studio-field ${className}` : 'studio-field'}>
      <label className="studio-field__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        aria-describedby={message ? messageId : undefined}
        aria-invalid={error ? true : undefined}
        className="studio-field__input"
        data-state={error ? 'error' : 'default'}
        id={inputId}
        {...rest}
      />
      {message ? (
        <p className="studio-field__message" data-tone={error ? 'danger' : 'muted'} id={messageId}>
          {message}
        </p>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Append the CSS**

```css
.studio-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.studio-field__label {
  color: var(--text-secondary);
  font-size: var(--text-caption);
  font-weight: var(--weight-medium);
}

.studio-field__input {
  background: var(--surface);
  border: var(--border-width-hairline) solid var(--border-strong);
  border-radius: var(--radius-md);
  color: var(--fg);
  font-family: inherit;
  font-size: var(--text-body);
  line-height: var(--leading-tight);
  padding-block: var(--control-pad-block);
  padding-inline: var(--field-pad-inline);
}

.studio-field__input::placeholder {
  color: var(--text-muted);
}

.studio-field__input:focus-visible {
  border-color: var(--fg);
  border-width: var(--border-width-strong);
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}

.studio-field__input[data-state='error'] {
  border-color: var(--danger);
  border-width: var(--border-width-strong);
}

.studio-field__message {
  font-size: var(--text-caption);
  margin: 0;
}

.studio-field__message[data-tone='danger'] {
  color: var(--danger);
}

.studio-field__message[data-tone='muted'] {
  color: var(--text-muted);
}
```

- [ ] **Step 5: Run the test and confirm it passes.**
- [ ] **Step 6: Export, typecheck, lint, commit**

```bash
cd .. && git add web/packages/ui/src/primitives/TextField.tsx web/packages/ui/src/primitives/TextField.test.tsx web/packages/ui/src/primitives/primitives.css web/packages/ui/src/index.ts
git commit -m "feat(ui): TextField — 4h's four field states, error announced not just coloured"
```

---

## Task 11: `BeltBar` — D7 and G10, with the ring in a place a test can read

**Files:**
- Create: `web/packages/ui/src/primitives/BeltBar.tsx`, `BeltBar.test.tsx`
- Modify: `primitives.css`, `index.ts`

**Interfaces:**
- Produces: `BeltBar` — props `{ colorHex: string; label: string; secondaryColorHex?: string }`.

**This is the task G10 exists for.** Three things make it different from every other primitive here:

1. **There is no fill-only variant, and there is no prop that could produce one.** The ring is not configurable. A `ringed?: boolean` prop, even defaulting to true, is a thing a later lane can set to false at 2am.
2. **The ring is applied inline, not through the stylesheet.** jsdom applies no stylesheet rules, so a CSS-only ring would be invisible to every test — the rule would be asserted nowhere. Inline, `element.style.boxShadow` is directly readable, which turns D7 from a rule into a gate.
3. **Belt colours are props, not tokens.** `belt_rank.color_hex` is per-studio data (D3, §5.9). The token layer owns `--belt-ring` and `--belt-ring-width` and nothing else about belts.

`box-shadow: inset` rather than `border`: a border shrinks the content box, so the 8px bar would render 6px of fill; the inset shadow keeps the geometry exact. It is also inherently direction-agnostic, so it cannot become the `border-left` that D10 exists to prevent.

**On bi-colour belts.** Artboard `4h` shows seven solid belts and no bi-colour ones — those live on `5b`, and M7 owns the belt system. `secondaryColorHex` is included here anyway, deliberately: `5b` is captioned *"כולל חגורות דו-צבעיות"* and bi-colour grades are correct for children's judo, so M7 *will* need them. If `BeltBar` cannot render one, M7 writes its own bar — and reintroduces exactly the fill-only bug D7 exists to prevent. One optional prop now is cheaper than that.

- [ ] **Step 1: Write the failing test**

```tsx
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../contrast'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { BeltBar } from './BeltBar'

/** The belts the contrast audit measured. Per-studio data, never tokens (D3, §5.9). */
const BELTS = {
  white: '#fffefb',
  yellow: '#d9a800',
  orange: '#c76a1e',
  green: '#1f6b3f',
  blue: '#2f6fa8',
  brown: '#6f4a2f',
  black: '#17150f',
} as const

describe.each(DIRECTIONS)('BeltBar in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('is announced by its rank name, not by its colour', () => {
      // SC 1.4.1 — colour is never the only carrier of meaning. A screen reader must
      // say "חגורה כתומה", never "orange rectangle".
      renderIn(<BeltBar colorHex={BELTS.orange} label="חגורה כתומה" />, { locale, theme })
      expect(screen.getByRole('img', { name: 'חגורה כתומה' })).toBeInTheDocument()
      expect(document.documentElement.dir).toBe(dir)
    })

    it('does not mirror with direction — a belt has no inherent direction (§9)', () => {
      renderIn(<BeltBar colorHex={BELTS.blue} label="חגורה כחולה" />, { locale, theme })
      const bar = screen.getByRole('img')
      expect(bar.style.transform).toBe('')
    })
  })
})

describe('D7/G10 — every belt bar carries a 1px ring, and nothing can turn it off', () => {
  it.each(Object.entries(BELTS))('rings the %s belt', (_name, hex) => {
    renderIn(<BeltBar colorHex={hex} label="belt" />)
    const bar = screen.getByRole('img')
    // Inline, so it is observable here. A stylesheet ring would be asserted nowhere:
    // jsdom applies no CSS rules.
    expect(bar.style.boxShadow).toContain('var(--belt-ring)')
    expect(bar.style.boxShadow).toContain('var(--belt-ring-width)')
    expect(bar.style.boxShadow).toContain('inset')
  })

  it('rings a bi-colour belt too', () => {
    renderIn(<BeltBar colorHex={BELTS.white} label="לבנה-צהובה" secondaryColorHex={BELTS.yellow} />)
    expect(screen.getByRole('img').style.boxShadow).toContain('var(--belt-ring)')
  })

  it('exposes no prop that could produce a fill-only bar', () => {
    // G10: "there is NO fill-only variant to reach for". Asserted structurally so the
    // next person to want one has to delete this test and explain themselves.
    const props = Object.keys(BeltBar.length === 1 ? {} : {})
    expect(props).toEqual([])
    const source = BeltBar.toString()
    expect(source).not.toMatch(/ring(ed)?\s*[=:]/i)
  })

  it('carries the fill it was handed, since belt colour is per-studio data', () => {
    renderIn(<BeltBar colorHex="#d9a800" label="צהובה" />)
    // jsdom normalises hex to rgb() in inline styles.
    expect(screen.getByRole('img').style.background).toContain('rgb(217, 168, 0)')
  })

  it('renders a bi-colour belt as two halves of one bar', () => {
    renderIn(<BeltBar colorHex="#fffefb" label="לבנה-צהובה" secondaryColorHex="#d9a800" />)
    const style = screen.getByRole('img').style.background
    expect(style).toContain('linear-gradient')
    expect(style).toContain('rgb(255, 254, 251)')
    expect(style).toContain('rgb(217, 168, 0)')
  })
})

describe('why the ring is unconditional — the numbers, recomputed', () => {
  it('fill alone loses white on light and black on dark', () => {
    expect(contrastRatio(BELTS.white, '#f7f5f1')).toBeLessThan(1.1)
    expect(contrastRatio(BELTS.black, '#141311')).toBeLessThan(1.1)
  })

  it('fill alone loses yellow on light even at the 3:1 non-text threshold', () => {
    expect(contrastRatio(BELTS.yellow, '#f7f5f1')).toBeLessThan(3)
  })

  it('and loses brown and green on dark, which the canvas review never measured', () => {
    expect(contrastRatio(BELTS.brown, '#141311')).toBeLessThan(3)
    expect(contrastRatio(BELTS.green, '#141311')).toBeLessThan(3)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails.**

- [ ] **Step 3: Write `BeltBar.tsx`**

```tsx
/**
 * D7 / G10 — a belt bar is NEVER fill-only. It always carries a 1px ring in the current
 * foreground colour: #17150f on light grounds, #fffefb on dark. `--belt-ring` flips with
 * the theme, so one declaration covers both.
 *
 * Why it is unconditional, measured on the real palette:
 *   white  #fffefb on the light ground  1.08:1   invisible
 *   black  #17150f on the dark ground   1.02:1   invisible
 *   yellow #d9a800 on the light ground  2.02:1   fails even the 3:1 non-text threshold
 *   brown  #6f4a2f on the dark ground   2.38:1   fails
 *   green  #1f6b3f on the dark ground   2.86:1   fails
 * Yellow is one of the most common children's grades, so that is not an edge case. The
 * ring measures 16.76:1 on light and 18.41:1 on dark and rescues every row at once. It
 * is also truer to the object — a real judo belt has an edge.
 *
 * THERE IS NO PROP THAT TURNS IT OFF, deliberately. BeltBar.test.tsx asserts that.
 *
 * `box-shadow: inset` rather than a border: a border would shrink the content box and
 * the 8px bar would render 6px of fill. It is also direction-agnostic, so it can never
 * become the `border-left` D10 exists to prevent.
 *
 * The fill is a PROP, not a token: belt_rank.color_hex is per-studio data (D3, SPEC
 * §5.9). D3 rejected belt colours as a brand palette for the same reason.
 */
export function BeltBar({
  colorHex,
  label,
  secondaryColorHex,
}: {
  colorHex: string
  label: string
  secondaryColorHex?: string
}) {
  const background = secondaryColorHex
    ? `linear-gradient(to bottom, ${colorHex} 0 50%, ${secondaryColorHex} 50% 100%)`
    : colorHex

  return (
    <span
      aria-label={label}
      className="studio-belt-bar"
      role="img"
      style={{
        background,
        boxShadow: 'inset 0 0 0 var(--belt-ring-width) var(--belt-ring)',
      }}
    />
  )
}
```

- [ ] **Step 4: Append the CSS**

```css
/* Geometry only. The ring and the fill are inline — see BeltBar.tsx. */
.studio-belt-bar {
  block-size: 42px;
  border-radius: var(--radius-xs);
  display: inline-block;
  flex: none;
  inline-size: 8px;
}

/* The variant used inside a list row: shorter, per 4h's שורת חניך card. */
.studio-belt-bar[data-size='row'] {
  block-size: 26px;
  inline-size: 5px;
}
```

- [ ] **Step 5: Run the test and confirm it passes.**

- [ ] **Step 6: Prove the ring assertion is not vacuous**

```bash
cd web
# In BeltBar.tsx, temporarily delete the boxShadow line from the style object.
npx vitest run packages/ui/src/primitives/BeltBar.test.tsx --reporter=dot
# expect: 8 failures — seven belts plus the bi-colour case.
git checkout packages/ui/src/primitives/BeltBar.tsx
```

- [ ] **Step 7: Export, typecheck, lint, commit**

```bash
cd .. && git add web/packages/ui/src/primitives/BeltBar.tsx web/packages/ui/src/primitives/BeltBar.test.tsx web/packages/ui/src/primitives/primitives.css web/packages/ui/src/index.ts
git commit -m "feat(ui): BeltBar — D7's ring, with no prop that can turn it off

The ring is inline rather than in the stylesheet so a test can actually read it:
jsdom applies no CSS rules, so a stylesheet ring would be asserted nowhere.
Deleting the boxShadow line reds eight cases."
```

---

## Task 12: `StatusChip` — 4h's six statuses, with `#7a766d` corrected

**Files:** Create `primitives/StatusChip.tsx`, `StatusChip.test.tsx`; modify `primitives.css`, `index.ts`.

**Interfaces:** Produces `StatusChip` — props `{ status: ChipStatus; label: string }`, and `type ChipStatus = 'debt' | 'paid' | 'pending' | 'cancelled' | 'unmarked' | 'planned'`.

**One correction carried in from the port.** `4h` draws the בוטל (cancelled) chip's text in `#7a766d` — one of D8's three retired greys, at 4.16:1 on the light ground. It is the *only* instance of a retired grey anywhere on the artboard. `--cancelled` (`#6f6b62` light, `#a8a49a` dark) supersedes it. This is not re-litigating the canvas: D8 postdates the artboard and G11 is a global constraint.

**Borders use `color-mix(in srgb, currentColor 40%, transparent)`** — `4h` draws each chip's outline as its own text colour at 35–45% opacity. Deriving it from `currentColor` means one declaration serves all six statuses and it flips with the theme for free.

- [ ] **Step 1: Write the failing test**

```tsx
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { StatusChip } from './StatusChip'

const STATUSES = ['debt', 'paid', 'pending', 'cancelled', 'unmarked', 'planned'] as const

describe.each(DIRECTIONS)('StatusChip in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it.each(STATUSES)('renders the %s chip with its label as text', (status) => {
      renderIn(<StatusChip label="חוב" status={status} />, { locale, theme })
      expect(screen.getByText('חוב')).toBeVisible()
      expect(document.documentElement.dir).toBe(dir)
    })
  })
})

describe('StatusChip', () => {
  it.each(STATUSES)('exposes %s through data-status', (status) => {
    renderIn(<StatusChip label="x" status={status} />)
    // Only-source-observable: jsdom applies no stylesheet, so the attribute is the
    // testable form of "this chip is drawn in the debt colour".
    expect(screen.getByText('x')).toHaveAttribute('data-status', status)
  })

  it('carries its meaning in text, never in colour alone (SC 1.4.1)', () => {
    // The whole point of a chip: a person who cannot distinguish the red from the green
    // still reads "חוב" and "שולם".
    renderIn(
      <>
        <StatusChip label="חוב" status="debt" />
        <StatusChip label="שולם" status="paid" />
      </>,
    )
    expect(screen.getByText('חוב')).toBeVisible()
    expect(screen.getByText('שולם')).toBeVisible()
  })

  it('takes its label as a prop, so the same status can read differently per screen', () => {
    renderIn(<StatusChip label="חוב של 320₪" status="debt" />)
    expect(screen.getByText('חוב של 320₪')).toBeVisible()
  })

  it('never renders D8s retired grey — 4h draws בוטל in #7a766d, which G11 retires', () => {
    renderIn(<StatusChip label="בוטל" status="cancelled" />)
    const chip = screen.getByText('בוטל')
    expect(chip.getAttribute('style') ?? '').not.toContain('#7a766d')
    expect(chip).toHaveAttribute('data-status', 'cancelled')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails.**

- [ ] **Step 3: Write `StatusChip.tsx`**

```tsx
export type ChipStatus = 'debt' | 'paid' | 'pending' | 'cancelled' | 'unmarked' | 'planned'

/**
 * Artboard 4h, card תגיות מצב. Six statuses.
 *
 * The label is always text, never conveyed by colour alone (SC 1.4.1) — and it is a
 * prop, because "חוב" on a roster and "חוב של 320₪" on a household row are the same
 * status with different copy.
 *
 * 4h draws the בוטל chip in #7a766d. D8 retired that grey outright at 4.16:1, so this
 * uses --cancelled instead. D8 postdates the artboard.
 */
export function StatusChip({ status, label }: { status: ChipStatus; label: string }) {
  return (
    <span className="studio-chip" data-status={status}>
      {label}
    </span>
  )
}
```

- [ ] **Step 4: Append the CSS**

```css
.studio-chip {
  border: var(--border-width-hairline) solid color-mix(in srgb, currentcolor 40%, transparent);
  border-radius: var(--radius-pill);
  display: inline-block;
  font-size: var(--text-caption);
  font-weight: var(--weight-medium);
  line-height: var(--leading-tight);
  padding-block: 6px;
  padding-inline: 11px;
  white-space: nowrap;
}

.studio-chip[data-status='debt'] {
  background: var(--debt-tint);
  color: var(--debt);
}

.studio-chip[data-status='paid'] {
  color: var(--paid);
}

.studio-chip[data-status='pending'] {
  color: var(--pending);
}

.studio-chip[data-status='cancelled'] {
  background: var(--cancelled-tint);
  color: var(--cancelled);
}

.studio-chip[data-status='unmarked'] {
  border-style: dashed;
  color: var(--pending);
}

.studio-chip[data-status='planned'] {
  color: var(--text-secondary);
  font-weight: var(--weight-regular);
}
```

- [ ] **Step 5: Run the test and confirm it passes.**
- [ ] **Step 6: Export, typecheck, lint, commit**

```bash
cd .. && git add web/packages/ui/src/primitives/StatusChip.tsx web/packages/ui/src/primitives/StatusChip.test.tsx web/packages/ui/src/primitives/primitives.css web/packages/ui/src/index.ts
git commit -m "feat(ui): StatusChip — 4h's six statuses, with the retired #7a766d corrected"
```

---

## Task 13: `AttendanceMark`

**Files:** Create `primitives/AttendanceMark.tsx`, `AttendanceMark.test.tsx`; modify `primitives.css`, `index.ts`.

**Interfaces:** Produces `AttendanceMark` — props `{ state: AttendanceState; label: string }`, `type AttendanceState = 'present' | 'absent' | 'notified' | 'unmarked'`.

From `4h`'s מצבי נוכחות card: a 42×42 rounded square. נוכח is a filled `--paid` with a white check; נעדר a filled `--danger` with a white X; הודיעו מראש a 2px solid `--pending` outline with a `--pending` X; לא סומן a 2px **dashed** `--pending` outline with a `--pending` dot.

**The icon shape differs per state, not only the colour** — solid vs dashed border, check vs X vs dot. That is SC 1.4.1 satisfied by form as well as by the `aria-label`, which matters on a roster a coach scans in a hurry. `4h` gets this right and it is worth preserving deliberately.

The artboard draws the corner at 12px; the declared radius scale is 9/11/14, so this uses `--radius-lg` (11px). A one-pixel deviation is cheaper than a token that exists for one component.

- [ ] **Step 1: Write the failing test**

```tsx
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { AttendanceMark } from './AttendanceMark'

const STATES = ['present', 'absent', 'notified', 'unmarked'] as const

describe.each(DIRECTIONS)('AttendanceMark in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it.each(STATES)('announces the %s state by name', (state) => {
      renderIn(<AttendanceMark label="נוכח" state={state} />, { locale, theme })
      expect(screen.getByRole('img', { name: 'נוכח' })).toBeInTheDocument()
      expect(document.documentElement.dir).toBe(dir)
    })
  })
})

describe('AttendanceMark', () => {
  it.each(STATES)('exposes %s through data-state', (state) => {
    renderIn(<AttendanceMark label="x" state={state} />)
    expect(screen.getByRole('img')).toHaveAttribute('data-state', state)
  })

  it('distinguishes the four states by SHAPE, not only by colour (SC 1.4.1)', () => {
    // A coach scanning a roster in a hurry, or anyone with a colour vision deficiency,
    // must be able to tell them apart. 4h draws a check, an X, an outlined X and a dot.
    const shapes = STATES.map((state) => {
      const { unmount } = renderIn(<AttendanceMark label="x" state={state} />)
      const shape = screen.getByRole('img').querySelector('svg')?.dataset.shape
      unmount()
      return shape
    })
    expect(new Set(shapes).size).toBe(4)
    expect(shapes).not.toContain(undefined)
  })

  it('hides the decorative svg from assistive tech — the label carries the meaning', () => {
    renderIn(<AttendanceMark label="נעדר" state="absent" />)
    expect(screen.getByRole('img').querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails.**

- [ ] **Step 3: Write `AttendanceMark.tsx`**

```tsx
export type AttendanceState = 'present' | 'absent' | 'notified' | 'unmarked'

/**
 * Artboard 4h, card מצבי נוכחות.
 *
 * Each state differs in SHAPE as well as colour — a check, a cross, an outlined cross
 * and a dot, with a dashed border on the unmarked case. SC 1.4.1, but also plain
 * usability: a coach reads a roster of thirty in a few seconds.
 *
 * 4h draws the corner at 12px; the declared radius scale is 9/11/14, so this uses
 * --radius-lg. A one-pixel deviation beats a token that exists for one component.
 */
const SHAPES: Record<AttendanceState, { shape: string; path: JSX.Element }> = {
  present: { shape: 'check', path: <path d="M4 10.5 8 14.5 16 5.5" /> },
  absent: { shape: 'cross', path: <path d="M5 5l10 10M15 5L5 15" /> },
  notified: { shape: 'cross-outline', path: <path d="M6 6l8 8M14 6l-8 8" /> },
  unmarked: { shape: 'dot', path: <circle cx="10" cy="10" r="3.2" fill="currentColor" /> },
}

export function AttendanceMark({ state, label }: { state: AttendanceState; label: string }) {
  const { shape, path } = SHAPES[state]
  return (
    <span aria-label={label} className="studio-attendance" data-state={state} role="img">
      <svg
        aria-hidden="true"
        data-shape={shape}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
        viewBox="0 0 20 20"
      >
        {path}
      </svg>
    </span>
  )
}
```

- [ ] **Step 4: Append the CSS**

```css
.studio-attendance {
  align-items: center;
  block-size: 42px;
  border: 2px solid transparent;
  border-radius: var(--radius-lg);
  display: inline-flex;
  flex: none;
  inline-size: 42px;
  justify-content: center;
}

.studio-attendance svg {
  block-size: 20px;
  inline-size: 20px;
}

.studio-attendance[data-state='present'] {
  background: var(--paid);
  color: var(--on-accent);
}

.studio-attendance[data-state='absent'] {
  background: var(--danger);
  color: var(--surface);
}

.studio-attendance[data-state='notified'] {
  border-color: var(--pending);
  color: var(--pending);
}

.studio-attendance[data-state='unmarked'] {
  border-color: var(--pending);
  border-style: dashed;
  color: var(--pending);
}
```

- [ ] **Step 5–6: Run, export, typecheck, lint, commit**

```bash
cd .. && git add web/packages/ui/src/primitives/AttendanceMark.tsx web/packages/ui/src/primitives/AttendanceMark.test.tsx web/packages/ui/src/primitives/primitives.css web/packages/ui/src/index.ts
git commit -m "feat(ui): AttendanceMark — four states told apart by shape, not colour alone"
```

---

## Task 14: `Checkbox`, `Radio` and `Switch`

**Files:** Create `primitives/Checkbox.tsx`, `Radio.tsx`, `Switch.tsx` and a test beside each; modify `primitives.css`, `index.ts`.

**Interfaces:**
- `Checkbox` / `Radio` — `{ label: string }` plus `InputHTMLAttributes<HTMLInputElement>`.
- `Switch` — `{ checked: boolean; onCheckedChange: (next: boolean) => void; label: string; stateLabels: { on: string; off: string } }`.

**`stateLabels` is required, not optional.** `4h` captions this card *"מתגים ובחירה — תמיד עם תווית מצב"*, and `2e` and `3f` both repeat *"לכל מתג יש תווית מצב"*. It came from an Arbox reviewer who could not tell whether a toggle was on ([research/02](../../design/research/02-arbox-dashboard.md)). A prop that can be omitted is a rule that will be broken; a required one cannot be.

`Checkbox` and `Radio` wrap native inputs — they are already accessible, keyboard-operable and form-associated, and reimplementing them with `role="checkbox"` would be strictly worse. `Switch` is a `<button role="switch">` because there is no native element for it.

- [ ] **Step 1: Write the failing tests**

`Checkbox.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { Checkbox } from './Checkbox'

describe.each(DIRECTIONS)('Checkbox in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('is a labelled checkbox', () => {
      renderIn(<Checkbox label="שלח תזכורת" />, { locale, theme })
      expect(screen.getByRole('checkbox', { name: 'שלח תזכורת' })).toBeInTheDocument()
      expect(document.documentElement.dir).toBe(dir)
    })
  })
})

describe('Checkbox', () => {
  it('toggles on click and reports through onChange', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    renderIn(<Checkbox label="x" onChange={onChange} />)
    await user.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledOnce()
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('toggles from the keyboard', async () => {
    const user = userEvent.setup()
    renderIn(<Checkbox label="x" />)
    await user.tab()
    await user.keyboard(' ')
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('does not toggle when disabled', async () => {
    const user = userEvent.setup()
    renderIn(<Checkbox disabled label="x" />)
    await user.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })
})
```

`Radio.test.tsx` — identical shape, with `role="radio"`, plus:

```tsx
  it('behaves as one group when two share a name', async () => {
    const user = userEvent.setup()
    renderIn(
      <>
        <Radio label="א" name="g" value="a" />
        <Radio label="ב" name="g" value="b" />
      </>,
    )
    await user.click(screen.getByRole('radio', { name: 'ב' }))
    expect(screen.getByRole('radio', { name: 'ב' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'א' })).not.toBeChecked()
  })
```

`Switch.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { Switch } from './Switch'

const labels = { on: 'מופעל', off: 'כבוי' }

describe.each(DIRECTIONS)('Switch in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it.each([true, false])('shows a visible state label when checked=%s', (checked) => {
      // 4h: "מתגים ובחירה — תמיד עם תווית מצב". An Arbox reviewer specifically reported
      // being unable to tell whether a toggle was on or off.
      renderIn(
        <Switch checked={checked} label="תזכורות" onCheckedChange={() => {}} stateLabels={labels} />,
        { locale, theme },
      )
      expect(screen.getByText(checked ? labels.on : labels.off)).toBeVisible()
      expect(document.documentElement.dir).toBe(dir)
    })
  })
})

describe('Switch', () => {
  it('is a switch with its checked state in the accessibility tree', () => {
    renderIn(
      <Switch checked label="תזכורות" onCheckedChange={() => {}} stateLabels={labels} />,
    )
    const el = screen.getByRole('switch', { name: /תזכורות/ })
    expect(el).toHaveAttribute('aria-checked', 'true')
  })

  it('reports the NEXT value, not the current one', async () => {
    const onCheckedChange = vi.fn()
    const user = userEvent.setup()
    renderIn(
      <Switch checked={false} label="x" onCheckedChange={onCheckedChange} stateLabels={labels} />,
    )
    await user.click(screen.getByRole('switch'))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('toggles from the keyboard', async () => {
    const onCheckedChange = vi.fn()
    const user = userEvent.setup()
    renderIn(
      <Switch checked={false} label="x" onCheckedChange={onCheckedChange} stateLabels={labels} />,
    )
    await user.tab()
    await user.keyboard(' ')
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })
})
```

- [ ] **Step 2: Run all three and confirm they fail.**

- [ ] **Step 3: Write the three components**

`Checkbox.tsx`:

```tsx
import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'

/** Artboard 4h, card מתגים ובחירה. A native input: accessible and form-associated already. */
export function Checkbox({
  label,
  id,
  ...rest
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId()
  const inputId = id ?? generated
  return (
    <span className="studio-choice">
      <input className="studio-choice__input" id={inputId} type="checkbox" {...rest} />
      <label className="studio-choice__label" htmlFor={inputId}>
        {label}
      </label>
    </span>
  )
}
```

`Radio.tsx` — identical, with `type="radio"` and `className="studio-choice studio-choice--radio"`.

`Switch.tsx`:

```tsx
/**
 * Artboard 4h, card מתגים ובחירה — captioned "תמיד עם תווית מצב".
 *
 * `stateLabels` is REQUIRED. 2e and 3f both repeat "לכל מתג יש תווית מצב", and it came
 * from an Arbox reviewer who could not tell whether a toggle was on. An optional prop is
 * a rule that gets broken; a required one cannot be.
 *
 * A button with role="switch" because there is no native element for one. Space and
 * Enter come free from the button; aria-checked carries the state to a screen reader,
 * and the visible label carries it to everyone else.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  stateLabels,
  disabled,
}: {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  label: string
  stateLabels: { on: string; off: string }
  disabled?: boolean
}) {
  const state = checked ? stateLabels.on : stateLabels.off
  return (
    <span className="studio-switch">
      <button
        aria-checked={checked}
        className="studio-switch__track"
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        role="switch"
        type="button"
      >
        <span className="studio-switch__label">{label}</span>
        <span aria-hidden="true" className="studio-switch__knob" />
      </button>
      <span className="studio-switch__state" data-on={checked}>
        {state}
      </span>
    </span>
  )
}
```

- [ ] **Step 4: Append the CSS**

```css
.studio-choice {
  align-items: center;
  display: inline-flex;
  gap: var(--space-2);
}

.studio-choice__input {
  accent-color: var(--fg);
  block-size: 20px;
  flex: none;
  inline-size: 20px;
  margin: 0;
}

.studio-choice__input:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.studio-choice__label {
  color: var(--fg);
  font-size: var(--text-label);
}

.studio-switch {
  align-items: center;
  display: inline-flex;
  gap: var(--space-2);
}

.studio-switch__track {
  align-items: center;
  background: transparent;
  block-size: 27px;
  border: var(--border-width-strong) solid var(--border-strong);
  border-radius: 14px;
  cursor: pointer;
  display: inline-flex;
  inline-size: 46px;
  justify-content: flex-start;
  padding: 2px;
  transition:
    background var(--motion-fast) var(--ease-standard),
    justify-content var(--motion-fast) var(--ease-standard);
}

.studio-switch__track[aria-checked='true'] {
  background: var(--accent);
  border-color: var(--accent);
  justify-content: flex-end;
}

.studio-switch__track:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

/* The accessible name lives here, off-screen — never display:none, which would remove
 * it from the accessibility tree along with the button's name. */
.studio-switch__label {
  block-size: 1px;
  clip-path: inset(50%);
  inline-size: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
}

.studio-switch__knob {
  background: var(--fg);
  block-size: 19px;
  border-radius: var(--radius-circle);
  display: block;
  inline-size: 19px;
}

.studio-switch__track[aria-checked='true'] .studio-switch__knob {
  background: var(--on-accent);
}

.studio-switch__state {
  color: var(--text-muted);
  font-size: var(--text-label);
  font-weight: var(--weight-medium);
}

.studio-switch__state[data-on='true'] {
  color: var(--accent);
}
```

`justify-content: flex-start` / `flex-end` rather than an inset offset: flexbox alignment is already flow-relative, so the knob sits on the correct edge in both directions with no `left`/`right` anywhere.

- [ ] **Step 5–6: Run all three, export, typecheck, lint, commit**

```bash
cd .. && git add web/packages/ui/src/primitives/Checkbox.tsx web/packages/ui/src/primitives/Checkbox.test.tsx \
  web/packages/ui/src/primitives/Radio.tsx web/packages/ui/src/primitives/Radio.test.tsx \
  web/packages/ui/src/primitives/Switch.tsx web/packages/ui/src/primitives/Switch.test.tsx \
  web/packages/ui/src/primitives/primitives.css web/packages/ui/src/index.ts
git commit -m "feat(ui): Checkbox, Radio and Switch — the state label is a required prop"
```

---

## Task 15: `SegmentedControl`

**Files:** Create `primitives/SegmentedControl.tsx`, `SegmentedControl.test.tsx`; modify `primitives.css`, `index.ts`.

**Interfaces:** Produces `SegmentedControl` — props `{ legend: string; value: string; options: readonly { value: string; label: string }[]; onValueChange: (next: string) => void }`.

`4h`'s two-way שבוע / חודש switcher. D5's calendar has three views, so this must not be hard-wired to two.

**The one physical CSS declaration the port found lives here** — `4h`'s segmented-control wrapper uses `margin-right: 8px`. It is not reproduced. Spacing between this control and its neighbour is the caller's `gap`, which is flow-relative and needs no override.

- [ ] **Step 1: Write the failing test**

```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { SegmentedControl } from './SegmentedControl'

const OPTIONS = [
  { value: 'day', label: 'יום' },
  { value: 'week', label: 'שבוע' },
  { value: 'month', label: 'חודש' },
] as const

describe.each(DIRECTIONS)('SegmentedControl in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('is one radio group with every option', () => {
      renderIn(
        <SegmentedControl legend="תצוגה" onValueChange={() => {}} options={OPTIONS} value="week" />,
        { locale, theme },
      )
      expect(screen.getByRole('radiogroup', { name: 'תצוגה' })).toBeInTheDocument()
      expect(screen.getAllByRole('radio')).toHaveLength(3)
      expect(document.documentElement.dir).toBe(dir)
    })

    it('marks exactly the current value as selected', () => {
      renderIn(
        <SegmentedControl legend="תצוגה" onValueChange={() => {}} options={OPTIONS} value="week" />,
        { locale, theme },
      )
      expect(screen.getByRole('radio', { name: 'שבוע' })).toBeChecked()
      expect(screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1)
    })
  })
})

describe('SegmentedControl', () => {
  it('reports the newly chosen value', async () => {
    const onValueChange = vi.fn()
    const user = userEvent.setup()
    renderIn(
      <SegmentedControl legend="תצוגה" onValueChange={onValueChange} options={OPTIONS} value="week" />,
    )
    await user.click(screen.getByRole('radio', { name: 'חודש' }))
    expect(onValueChange).toHaveBeenCalledWith('month')
  })

  it('supports more than two options — D5s calendar has three views', () => {
    renderIn(
      <SegmentedControl legend="תצוגה" onValueChange={() => {}} options={OPTIONS} value="day" />,
    )
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })

  it('gives each instance its own group name, so two controls do not interfere', () => {
    renderIn(
      <>
        <SegmentedControl legend="A" onValueChange={() => {}} options={OPTIONS} value="day" />
        <SegmentedControl legend="B" onValueChange={() => {}} options={OPTIONS} value="week" />
      </>,
    )
    expect(screen.getByRole('radio', { name: 'יום', ...{} })).toBeInTheDocument()
    const checked = screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked)
    expect(checked).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails.**

- [ ] **Step 3: Write `SegmentedControl.tsx`**

```tsx
import { useId } from 'react'

/**
 * Artboard 4h's שבוע / חודש switcher, generalised: D5 specifies three calendar views —
 * day, week and month — so this takes an options list rather than a pair.
 *
 * 4h's own wrapper carries `margin-right: 8px`, the single physical CSS declaration in
 * this artboard. It is deliberately not reproduced: spacing from a neighbour is the
 * caller's `gap`, which is flow-relative (D10, SPEC §9).
 */
export function SegmentedControl({
  legend,
  value,
  options,
  onValueChange,
}: {
  legend: string
  value: string
  options: readonly { value: string; label: string }[]
  onValueChange: (next: string) => void
}) {
  const name = useId()
  return (
    <fieldset className="studio-segmented">
      <legend className="studio-segmented__legend">{legend}</legend>
      <div className="studio-segmented__track">
        {options.map((option) => (
          <label
            className="studio-segmented__option"
            data-selected={option.value === value}
            key={option.value}
          >
            <input
              checked={option.value === value}
              className="studio-segmented__input"
              name={name}
              onChange={() => onValueChange(option.value)}
              type="radio"
              value={option.value}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
```

- [ ] **Step 4: Append the CSS** — the same shape as `.studio-theme-control`, which `4h` draws identically:

```css
.studio-segmented {
  border: 0;
  margin: 0;
  padding: 0;
}

/* The legend names the group for assistive tech; 4h shows the control bare. */
.studio-segmented__legend {
  block-size: 1px;
  clip-path: inset(50%);
  inline-size: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
}

.studio-segmented__track {
  background: var(--ground);
  border-radius: var(--radius-md);
  display: inline-flex;
  gap: var(--space-1);
  padding: 3px;
}

.studio-segmented__option {
  border-radius: 7px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--text-label);
  font-weight: var(--weight-regular);
  padding-block: 7px;
  padding-inline: 13px;
}

.studio-segmented__option[data-selected='true'] {
  background: var(--fg);
  color: var(--on-fg);
  font-weight: var(--weight-medium);
}

.studio-segmented__input {
  block-size: 1px;
  clip-path: inset(50%);
  inline-size: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
}

.studio-segmented__option:has(.studio-segmented__input:focus-visible) {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
```

- [ ] **Step 5–6: Run, export, typecheck, lint, commit**

```bash
cd .. && git add web/packages/ui/src/primitives/SegmentedControl.tsx web/packages/ui/src/primitives/SegmentedControl.test.tsx web/packages/ui/src/primitives/primitives.css web/packages/ui/src/index.ts
git commit -m "feat(ui): SegmentedControl — n options, not 4h's two, because D5 needs three"
```

---

## Task 16: `EmptyState` and `Alert`

**Files:** Create `primitives/EmptyState.tsx`, `EmptyState.test.tsx`, `Alert.tsx`, `Alert.test.tsx`; modify `primitives.css`, `index.ts`.

**Interfaces:**
- `EmptyState` — `{ title: string; description?: string; action?: ReactNode }`.
- `Alert` — `{ tone: AlertTone; children: ReactNode; iconLabel: string; live?: boolean }`, `type AlertTone = 'danger' | 'pending' | 'paid'`.

From `4h`'s מצב ריק והתראה card: a dashed 12px container with a centred icon, a 15px/500 title (*"אין שיעורים ביום זה"*) and a 12px secondary subtitle (*"השיעור הקרוב: יום א׳ 17:00"*); and a banner on a 6%-danger ground with a 30%-danger hairline, a warning triangle, and 13px/1.4 body text (*"הצהרת בריאות חסרה — נדרשת לפני האימון הבא"*).

**`live` defaults to false.** `4h`'s banner is static page content — a declaration that was already missing when the screen loaded. Wrapping static content in `role="alert"` makes a screen reader interrupt itself on every render, which trains people to ignore it. `live` is opt-in for the cases that genuinely appear in response to something the user just did.

**The artboard's third red is not reproduced.** `4h` draws the banner's body text in `#8f1f19`, a hex that appears nowhere else and is not a token. `--danger` measures 5.88:1 on the banner's own tinted ground, comfortably past AA, so the extra value buys nothing and would need its own role and audit entry.

- [ ] **Step 1: Write the failing tests**

`EmptyState.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { EmptyState } from './EmptyState'

describe.each(DIRECTIONS)('EmptyState in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('shows its title as a heading and its description as text', () => {
      renderIn(
        <EmptyState description="השיעור הקרוב: יום א׳ 17:00" title="אין שיעורים ביום זה" />,
        { locale, theme },
      )
      expect(screen.getByRole('heading', { name: 'אין שיעורים ביום זה' })).toBeInTheDocument()
      expect(screen.getByText('השיעור הקרוב: יום א׳ 17:00')).toBeVisible()
      expect(document.documentElement.dir).toBe(dir)
    })
  })
})

describe('EmptyState', () => {
  it('renders without a description', () => {
    renderIn(<EmptyState title="ריק" />)
    expect(screen.getByRole('heading', { name: 'ריק' })).toBeInTheDocument()
  })

  it('renders a caller-supplied action', () => {
    renderIn(<EmptyState action={<button type="button">הוסף</button>} title="ריק" />)
    expect(screen.getByRole('button', { name: 'הוסף' })).toBeInTheDocument()
  })

  it('hides its decorative icon from assistive tech', () => {
    const { container } = renderIn(<EmptyState title="ריק" />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
```

`Alert.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { Alert } from './Alert'

const TONES = ['danger', 'pending', 'paid'] as const

describe.each(DIRECTIONS)('Alert in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it.each(TONES)('renders the %s tone with its message', (tone) => {
      renderIn(
        <Alert iconLabel="אזהרה" tone={tone}>
          הצהרת בריאות חסרה — נדרשת לפני האימון הבא
        </Alert>,
        { locale, theme },
      )
      expect(screen.getByText(/הצהרת בריאות חסרה/)).toBeVisible()
      expect(document.documentElement.dir).toBe(dir)
    })
  })
})

describe('Alert', () => {
  it.each(TONES)('exposes %s through data-tone', (tone) => {
    renderIn(
      <Alert iconLabel="x" tone={tone}>
        m
      </Alert>,
    )
    expect(screen.getByText('m').closest('.studio-alert')).toHaveAttribute('data-tone', tone)
  })

  it('is NOT a live region by default', () => {
    // 4h's banner is static page content. role="alert" on static content makes a screen
    // reader interrupt itself on every render, which teaches people to ignore it.
    renderIn(
      <Alert iconLabel="x" tone="danger">
        m
      </Alert>,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('becomes a live region only when asked', () => {
    renderIn(
      <Alert iconLabel="x" live tone="danger">
        m
      </Alert>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('m')
  })

  it('names its icon, so the tone is not carried by colour alone (SC 1.4.1)', () => {
    renderIn(
      <Alert iconLabel="אזהרה" tone="danger">
        m
      </Alert>,
    )
    expect(screen.getByRole('img', { name: 'אזהרה' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run both and confirm they fail.**

- [ ] **Step 3: Write the two components**

`EmptyState.tsx`:

```tsx
import type { ReactNode } from 'react'

/** Artboard 4h, card מצב ריק והתראה — the dashed container half. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="studio-empty">
      <svg
        aria-hidden="true"
        className="studio-empty__icon"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
      >
        <rect height="15" rx="2" width="18" x="3" y="5" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
      <p className="studio-empty__title" role="heading" aria-level={3}>
        {title}
      </p>
      {description ? <p className="studio-empty__description">{description}</p> : null}
      {action}
    </div>
  )
}
```

`Alert.tsx`:

```tsx
import type { ReactNode } from 'react'

export type AlertTone = 'danger' | 'pending' | 'paid'

/**
 * Artboard 4h, card מצב ריק והתראה — the banner half.
 *
 * `live` is opt-in. 4h's banner is static page content: a declaration that was already
 * missing when the screen loaded. role="alert" on static content makes a screen reader
 * interrupt itself on every render, and people learn to ignore an alert that always
 * fires. Pass `live` only when the banner appears in response to something just done.
 *
 * 4h draws the body text in #8f1f19, a hex used nowhere else and not a token. --danger
 * measures 5.88:1 on this banner's own tinted ground, so the extra value buys nothing.
 */
export function Alert({
  tone,
  iconLabel,
  live = false,
  children,
}: {
  tone: AlertTone
  iconLabel: string
  live?: boolean
  children: ReactNode
}) {
  return (
    <div className="studio-alert" data-tone={tone} {...(live ? { role: 'alert' } : {})}>
      <span aria-label={iconLabel} className="studio-alert__icon" role="img">
        <svg aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 20 20">
          <path d="M10 2.5 18.5 17h-17z" strokeLinejoin="round" />
          <path d="M10 8v3.5M10 14.2v.1" strokeLinecap="round" />
        </svg>
      </span>
      <p className="studio-alert__body">{children}</p>
    </div>
  )
}
```

- [ ] **Step 4: Append the CSS**

```css
.studio-empty {
  align-items: center;
  border: var(--border-width-hairline) dashed var(--border-strong);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 22px;
  text-align: center;
}

.studio-empty__icon {
  block-size: 24px;
  color: var(--text-muted);
  inline-size: 24px;
}

.studio-empty__title {
  color: var(--fg);
  font-size: var(--text-title);
  font-weight: var(--weight-medium);
  margin: 0;
}

.studio-empty__description {
  color: var(--text-secondary);
  font-size: var(--text-caption);
  margin: 0;
}

.studio-alert {
  align-items: flex-start;
  border: var(--border-width-hairline) solid color-mix(in srgb, currentcolor 30%, transparent);
  border-radius: var(--radius-lg);
  display: flex;
  gap: var(--space-2);
  padding-block: var(--control-pad-block);
  padding-inline: var(--field-pad-inline);
}

.studio-alert[data-tone='danger'] {
  background: var(--danger-tint);
  color: var(--danger);
}

.studio-alert[data-tone='pending'] {
  background: color-mix(in srgb, var(--pending) 6%, var(--surface));
  color: var(--pending);
}

.studio-alert[data-tone='paid'] {
  background: color-mix(in srgb, var(--paid) 6%, var(--surface));
  color: var(--paid);
}

.studio-alert__icon svg {
  block-size: 20px;
  display: block;
  inline-size: 20px;
}

.studio-alert__body {
  font-size: var(--text-label);
  line-height: var(--leading-normal);
  margin: 0;
}
```

- [ ] **Step 5–6: Run, export, typecheck, lint, commit**

```bash
cd .. && git add web/packages/ui/src/primitives/EmptyState.tsx web/packages/ui/src/primitives/EmptyState.test.tsx \
  web/packages/ui/src/primitives/Alert.tsx web/packages/ui/src/primitives/Alert.test.tsx \
  web/packages/ui/src/primitives/primitives.css web/packages/ui/src/index.ts
git commit -m "feat(ui): EmptyState and Alert — live regions are opt-in, not the default"
```

---

## Task 17: `ProgressBar` and `Toast`

**Files:** Create `primitives/ProgressBar.tsx`, `ProgressBar.test.tsx`, `Toast.tsx`, `Toast.test.tsx`; modify `primitives.css`, `index.ts`.

**Interfaces:**
- `ProgressBar` — `{ label: string; value: number; max: number; readout?: string }`.
- `Toast` — `{ message: string; action?: { label: string; onAction: () => void } }`.

From `4h`'s last card: an 8px track at radius 5 with an ink fill and a `tabular-nums` `18/25` readout; and an ink-filled toast at radius 11 with a check icon, *"הנוכחות נשמרה · 22 נוכחים"*, and an underlined ביטול action.

**A toast IS a live region** — unlike `Alert`, it exists precisely because something just happened. `role="status"` rather than `role="alert"`: `status` is polite and waits for a pause, which is right for a confirmation. An attendance save is not an emergency.

**`tabular-nums` is not decoration.** The readout sits beside a bar that animates; proportional digits make the number jump sideways as it counts.

- [ ] **Step 1: Write the failing tests**

`ProgressBar.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { ProgressBar } from './ProgressBar'

describe.each(DIRECTIONS)('ProgressBar in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('is a labelled progressbar carrying its value', () => {
      renderIn(<ProgressBar label="נוכחות" max={25} readout="18/25" value={18} />, { locale, theme })
      const bar = screen.getByRole('progressbar', { name: 'נוכחות' })
      expect(bar).toHaveAttribute('aria-valuenow', '18')
      expect(bar).toHaveAttribute('aria-valuemax', '25')
      expect(bar).toHaveAttribute('aria-valuemin', '0')
      expect(document.documentElement.dir).toBe(dir)
    })
  })
})

describe('ProgressBar', () => {
  it('shows the readout as text, so the value is not carried by width alone', () => {
    renderIn(<ProgressBar label="x" max={25} readout="18/25" value={18} />)
    expect(screen.getByText('18/25')).toBeVisible()
  })

  it('sets the fill as a percentage of max', () => {
    renderIn(<ProgressBar label="x" max={25} value={18} />)
    // Inline, because the value is data. 18/25 = 72%, which is what 4h draws.
    expect(screen.getByRole('progressbar').querySelector('.studio-progress__fill')).toHaveStyle({
      inlineSize: '72%',
    })
  })

  it('clamps out-of-range values rather than overflowing the track', () => {
    renderIn(<ProgressBar label="x" max={10} value={99} />)
    expect(screen.getByRole('progressbar').querySelector('.studio-progress__fill')).toHaveStyle({
      inlineSize: '100%',
    })
  })

  it('treats max=0 as empty rather than dividing by zero', () => {
    renderIn(<ProgressBar label="x" max={0} value={0} />)
    expect(screen.getByRole('progressbar').querySelector('.studio-progress__fill')).toHaveStyle({
      inlineSize: '0%',
    })
  })
})
```

`Toast.test.tsx`:

```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { Toast } from './Toast'

describe.each(DIRECTIONS)('Toast in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('announces politely as a status region', () => {
      // status, not alert: a save confirmation waits for a pause. An attendance save is
      // not an emergency, and role="alert" would interrupt whatever is being read.
      renderIn(<Toast message="הנוכחות נשמרה · 22 נוכחים" />, { locale, theme })
      expect(screen.getByRole('status')).toHaveTextContent('הנוכחות נשמרה')
      expect(document.documentElement.dir).toBe(dir)
    })
  })
})

describe('Toast', () => {
  it('renders an action as a real button and calls it', async () => {
    const onAction = vi.fn()
    const user = userEvent.setup()
    renderIn(<Toast action={{ label: 'ביטול', onAction }} message="נשמר" />)
    await user.click(screen.getByRole('button', { name: 'ביטול' }))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('renders without an action', () => {
    renderIn(<Toast message="נשמר" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('hides its decorative icon from assistive tech', () => {
    renderIn(<Toast message="נשמר" />)
    expect(screen.getByRole('status').querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
```

- [ ] **Step 2: Run both and confirm they fail.**

- [ ] **Step 3: Write the two components**

`ProgressBar.tsx`:

```tsx
/**
 * Artboard 4h, card שורת חניך · סרגל התקדמות · הודעת מערכת — the middle third.
 *
 * The readout is text as well as width: SC 1.4.1, and also the plain fact that "how many
 * of the class are here" is a number a coach wants to read, not estimate from a bar.
 */
export function ProgressBar({
  label,
  value,
  max,
  readout,
}: {
  label: string
  value: number
  max: number
  readout?: string
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className="studio-progress">
      <div
        aria-label={label}
        aria-valuemax={max}
        aria-valuemin={0}
        aria-valuenow={value}
        className="studio-progress__track"
        role="progressbar"
      >
        {/* Inline because the width IS the data. */}
        <span className="studio-progress__fill" style={{ inlineSize: `${percent}%` }} />
      </div>
      {readout ? <span className="studio-progress__readout">{readout}</span> : null}
    </div>
  )
}
```

`Toast.tsx`:

```tsx
/**
 * Artboard 4h, card שורת חניך · סרגל התקדמות · הודעת מערכת — the last third.
 *
 * role="status" (polite), not role="alert" (assertive). A toast exists because something
 * just happened, so it IS a live region — but "הנוכחות נשמרה" should wait for a pause
 * rather than interrupt whatever a screen reader is in the middle of.
 */
export function Toast({
  message,
  action,
}: {
  message: string
  action?: { label: string; onAction: () => void }
}) {
  return (
    <div className="studio-toast" role="status">
      <svg
        aria-hidden="true"
        className="studio-toast__icon"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
        viewBox="0 0 20 20"
      >
        <path d="M4 10.5 8 14.5 16 5.5" />
      </svg>
      <span className="studio-toast__message">{message}</span>
      {action ? (
        <button className="studio-toast__action" onClick={action.onAction} type="button">
          {action.label}
        </button>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Append the CSS**

```css
.studio-progress {
  align-items: center;
  display: flex;
  gap: var(--space-3);
}

.studio-progress__track {
  background: color-mix(in srgb, var(--fg) 8%, transparent);
  block-size: 8px;
  border-radius: 5px;
  flex: 1;
  overflow: hidden;
}

.studio-progress__fill {
  background: var(--fg);
  block-size: 100%;
  display: block;
  transition: inline-size var(--motion-base) var(--ease-standard);
}

.studio-progress__readout {
  color: var(--fg);
  font-size: var(--text-label);
  font-variant-numeric: tabular-nums;
  font-weight: var(--weight-medium);
}

.studio-toast {
  align-items: center;
  background: var(--fg);
  border-radius: var(--radius-lg);
  color: var(--on-fg);
  display: flex;
  gap: var(--space-2);
  padding-block: var(--space-3);
  padding-inline: 14px;
}

.studio-toast__icon {
  block-size: 20px;
  flex: none;
  inline-size: 20px;
}

.studio-toast__message {
  font-size: var(--text-body);
}

.studio-toast__action {
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
  font-family: inherit;
  font-size: var(--text-label);
  font-weight: var(--weight-medium);
  margin-inline-start: auto;
  padding: 0;
  text-decoration: underline;
}

.studio-toast__action:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
```

`margin-inline-start: auto` pushes the action to the trailing edge in both directions — the logical form of what `4h` would have written as `margin-left: auto`.

- [ ] **Step 5–6: Run, export, typecheck, lint, commit**

```bash
cd .. && git add web/packages/ui/src/primitives/ProgressBar.tsx web/packages/ui/src/primitives/ProgressBar.test.tsx \
  web/packages/ui/src/primitives/Toast.tsx web/packages/ui/src/primitives/Toast.test.tsx \
  web/packages/ui/src/primitives/primitives.css web/packages/ui/src/index.ts
git commit -m "feat(ui): ProgressBar and Toast — polite status, clamped progress"
```

---

## Task 18: `StudentRow`, the barrel, and the exit gate

**Files:** Create `primitives/StudentRow.tsx`, `StudentRow.test.tsx`; modify `primitives.css`, `index.ts`; modify `docs/design/decisions.md`.

**Interfaces:** Produces `StudentRow` — props `{ name: string; groupLabel: string; belt: { colorHex: string; label: string; secondaryColorHex?: string }; status?: { status: ChipStatus; label: string }; onSelect?: () => void }`.

`4h`'s שורת חניך: a hairline row at radius 11 with a leading 5×26 belt bar, a 15px/500 name, a 12px secondary group line, and a trailing status chip. **It is the first composite** — it uses `BeltBar` and `StatusChip` — and it is the row three later lanes build on (`1c`/`9f` roster, `2c` student card, `3b` students table), which is why getting the belt and the chip *through the primitives* matters more here than anywhere else.

**Bidi isolation.** *"דנה כהן"* beside *"ג'ודו / מתחילים"* is Hebrew, but the same row in M3 carries Latin group names and phone numbers. SPEC §9: mixed-direction text is wrapped in isolation or it reorders. `<bdi>` on both, the same treatment `HelloProof` already uses for its script samples.

- [ ] **Step 1: Write the failing test**

```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DIRECTIONS, THEMES, renderIn } from '../testing'
import { StudentRow } from './StudentRow'

const belt = { colorHex: '#2f6fa8', label: 'חגורה כחולה' }

describe.each(DIRECTIONS)('StudentRow in $locale ($dir)', ({ locale, dir }) => {
  describe.each(THEMES)('under the %s theme', (theme) => {
    it('shows the name, the group and the status', () => {
      renderIn(
        <StudentRow
          belt={belt}
          groupLabel="ג'ודו / מתחילים"
          name="דנה כהן"
          status={{ status: 'debt', label: 'חוב' }}
        />,
        { locale, theme },
      )
      expect(screen.getByText('דנה כהן')).toBeVisible()
      expect(screen.getByText("ג'ודו / מתחילים")).toBeVisible()
      expect(screen.getByText('חוב')).toBeVisible()
      expect(document.documentElement.dir).toBe(dir)
    })

    it('carries the belt through BeltBar, so D7s ring applies here too', () => {
      renderIn(<StudentRow belt={belt} groupLabel="g" name="n" />, { locale, theme })
      const bar = screen.getByRole('img', { name: 'חגורה כחולה' })
      expect(bar.style.boxShadow).toContain('var(--belt-ring)')
    })
  })
})

describe('StudentRow', () => {
  it('isolates mixed-direction text, so a Latin group name cannot reorder the row (§9)', () => {
    renderIn(<StudentRow belt={belt} groupLabel="Judo / Beginners" name="דנה כהן" />)
    expect(screen.getByText('דנה כהן').tagName).toBe('BDI')
    expect(screen.getByText('Judo / Beginners').tagName).toBe('BDI')
  })

  it('is a plain row when it is not selectable', () => {
    renderIn(<StudentRow belt={belt} groupLabel="g" name="n" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('becomes a real button when selectable, named for the student', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    renderIn(<StudentRow belt={belt} groupLabel="g" name="דנה כהן" onSelect={onSelect} />)
    // A div with onClick is not reachable by keyboard. 4h's row opens a student card,
    // so it has to be a button.
    await user.click(screen.getByRole('button', { name: /דנה כהן/ }))
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('is operable from the keyboard when selectable', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    renderIn(<StudentRow belt={belt} groupLabel="g" name="n" onSelect={onSelect} />)
    await user.tab()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('renders without a status', () => {
    renderIn(<StudentRow belt={belt} groupLabel="g" name="n" />)
    expect(screen.getByText('n')).toBeVisible()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails.**

- [ ] **Step 3: Write `StudentRow.tsx`**

```tsx
import { BeltBar } from './BeltBar'
import { StatusChip } from './StatusChip'
import type { ChipStatus } from './StatusChip'

/**
 * Artboard 4h, card שורת חניך. The first composite, and the row three later lanes build
 * on: the 1c/9f roster, the 2c student card and the 3b students table. Composing BeltBar
 * and StatusChip here rather than redrawing them is what carries D7's ring into all
 * three without any of those lanes having to remember it.
 *
 * A <button> when selectable, never a div with onClick: 4h's row opens a student card,
 * and a div is unreachable by keyboard and invisible to assistive tech.
 *
 * <bdi> on the name and the group: this row is Hebrew on 4h, but M3 fills it with Latin
 * group names and phone numbers, and mixed-direction text reorders without isolation
 * (SPEC §9).
 */
export function StudentRow({
  name,
  groupLabel,
  belt,
  status,
  onSelect,
}: {
  name: string
  groupLabel: string
  belt: { colorHex: string; label: string; secondaryColorHex?: string }
  status?: { status: ChipStatus; label: string }
  onSelect?: () => void
}) {
  const content = (
    <>
      <BeltBar
        colorHex={belt.colorHex}
        label={belt.label}
        secondaryColorHex={belt.secondaryColorHex}
      />
      <span className="studio-row__text">
        <bdi className="studio-row__name">{name}</bdi>
        <bdi className="studio-row__group">{groupLabel}</bdi>
      </span>
      {status ? <StatusChip label={status.label} status={status.status} /> : null}
    </>
  )

  return onSelect ? (
    <button className="studio-row" onClick={onSelect} type="button">
      {content}
    </button>
  ) : (
    <div className="studio-row">{content}</div>
  )
}
```

The `data-size="row"` variant of the belt bar is applied by the row's own CSS rather than by a prop, so a caller cannot get the geometry wrong:

```css
.studio-row .studio-belt-bar {
  block-size: 26px;
  inline-size: 5px;
}
```

- [ ] **Step 4: Append the CSS**

```css
.studio-row {
  align-items: center;
  background: var(--surface);
  border: var(--border-width-hairline) solid var(--border);
  border-radius: var(--radius-lg);
  color: var(--fg);
  display: flex;
  font-family: inherit;
  gap: var(--space-3);
  inline-size: 100%;
  padding-block: var(--control-pad-block);
  padding-inline: var(--field-pad-inline);
  text-align: start;
}

button.studio-row {
  cursor: pointer;
}

button.studio-row:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.studio-row__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-inline-size: 0;
}

.studio-row__name {
  font-size: var(--text-title);
  font-weight: var(--weight-medium);
  line-height: var(--leading-snug);
}

.studio-row__group {
  color: var(--text-secondary);
  font-size: var(--text-caption);
  line-height: 1.3;
}

.studio-row .studio-belt-bar {
  block-size: 26px;
  inline-size: 5px;
}
```

`text-align: start`, not `left` — SPEC §9, and stylelint would reject the physical value anyway.

- [ ] **Step 5: Finish the barrel**

`web/packages/ui/src/index.ts` — the complete export surface:

```ts
import './fonts.css'
import './tokens.css'
import './primitives/primitives.css'

export { HelloProof } from './HelloProof'
export { ThemeProvider, useTheme } from './ThemeProvider'
export { THEME_COLOR, THEME_STORAGE_KEY, resolveTheme } from './theme'
export type { ResolvedTheme, ThemePreference } from './theme'
export type { AppManifest, ManifestIcon } from './manifest'
export { registerSlot, useSlot, clearSlot } from './slots'
export type { SlotEntry, SlotId } from './slots'

export { AA_TEXT, NON_TEXT, contrastRatio, meetsAA, meetsNonText, relativeLuminance } from './contrast'
export { GROUND_TOKENS, TIERS, TOKEN_ROLES } from './tokens.roles'
export type { GroundToken, Obligation, Tier, TokenRole } from './tokens.roles'
export { BRAND_TOKENS, applyBrand, brandOverridesFor } from './brand'

export { Alert } from './primitives/Alert'
export type { AlertTone } from './primitives/Alert'
export { AttendanceMark } from './primitives/AttendanceMark'
export type { AttendanceState } from './primitives/AttendanceMark'
export { BeltBar } from './primitives/BeltBar'
export { Button } from './primitives/Button'
export type { ButtonVariant } from './primitives/Button'
export { Card } from './primitives/Card'
export { Checkbox } from './primitives/Checkbox'
export { EmptyState } from './primitives/EmptyState'
export { ProgressBar } from './primitives/ProgressBar'
export { Radio } from './primitives/Radio'
export { SegmentedControl } from './primitives/SegmentedControl'
export { StatusChip } from './primitives/StatusChip'
export type { ChipStatus } from './primitives/StatusChip'
export { StudentRow } from './primitives/StudentRow'
export { Switch } from './primitives/Switch'
export { TextField } from './primitives/TextField'
export { ThemeControl } from './primitives/ThemeControl'
export { Toast } from './primitives/Toast'
```

`./testing` is deliberately **not** exported: it pulls in `@testing-library/react`, which must never reach an app bundle.

- [ ] **Step 6: Run the exit gate in full**

```bash
cd web && npm run typecheck && npx eslint . && npx stylelint "**/*.css" && npm run build && npm test
cd .. && ./scripts/lane-check.sh core
./scripts/ci-local.sh
```

Every one must be green. `ci-local.sh` last — it is the gate before any push.

- [ ] **Step 7: Record the three token corrections in `decisions.md`**

D7 and D8 were both decided *from* the contrast audit, and this session found four values that audit never covered. Append to `docs/design/decisions.md`, immediately before the `## Canvas` section:

```markdown
## D12 — Four token values the canvas audit never measured

**Decided:** 2026-08-24 · from M0.3's computed token audit

[canvas-review.md](canvas-review.md) measured light-mode text against the **ground**
`#f7f5f1`, and dark-mode text against the dark **ground** `#141311`. It never measured
anything against the card **surface** (`#fffefb` / `#1e1d1a`), never measured a chip's
text against its own tinted fill, and never measured belt fills against the dark ground
at all. Four values seeded in M0.1 fail once those pairings are computed:

| Token | Was | Measured | Needs | Now |
|---|---|--:|--:|---|
| `--border-strong` light | `#e5e0d5` | 1.21 | 3.0 | `#8d8674` |
| `--border-strong` dark | `#4a4842` | 1.84 | 3.0 | `#726e65` |
| `--accent` / `--paid` dark | `#3f8f52` | 4.22 on `--surface` | 4.5 | `#4a9b5e` |
| `--cancelled` dark | `#8f8b82` | 4.34 on `--cancelled-tint` | 4.5 | `#a8a49a` |

`--border-strong` had also been seeded one hex unit from `--border`, i.e. no distinction
at all. It now has a job: **`--border` is the decorative hairline and carries no contrast
obligation; `--border-strong` is the boundary of an interactive control and must reach
3:1** (SC 1.4.11). The dark accent change also removes a collision — `#3f8f52` is
artboard `4h`'s **green belt**, and D3 requires belt colours stay distinct from semantics.

**D7 is stronger than it reads.** The audit found three failing belt fills, all on the
light ground. Against the dark ground, brown (2.38) and green (2.86) fail as well, so
five belts across the two modes are invisible or sub-threshold as fills. Nobody should
read D7 as a three-case patch and add a fill-only variant "just for dark".

**Consequence:** ratios are no longer written in comments anywhere in the token layer.
`web/packages/ui/src/tokens.roles.ts` records each token's obligation and
`tokens.audit.test.ts` recomputes every ratio from the live values on every run, so a
new too-light value is caught as well as the ones D8 happened to name.
```

- [ ] **Step 8: Commit**

```bash
git add web/packages/ui/src/primitives/StudentRow.tsx web/packages/ui/src/primitives/StudentRow.test.tsx \
        web/packages/ui/src/primitives/primitives.css web/packages/ui/src/index.ts docs/design/decisions.md
git commit -m "feat(ui): StudentRow, the barrel, and D12

StudentRow composes BeltBar and StatusChip rather than redrawing them, which is
what carries D7's ring into the 1c/9f roster, the 2c student card and the 3b
table without any of those lanes having to remember it."
```

---

## Self-review

**Spec coverage.** Every build item in the M0.3 prompt maps to a task:

| Requirement | Task |
|---|---|
| Token layer in D2's three tiers, extending `tokens.css` | 2 |
| Semantic + structural never overridable, with a test that a studio value cannot reach them | 4 |
| Light and dark as separate token sets | 2 |
| `#a8a49a` / `#8f8b82` dark-only, `#7a766d` retired, `#6f6b62` the light floor | 3 |
| Ground stays `#f7f5f1` | 3 |
| Contrast as a **test**, not a comment | 1, 3 |
| Rubik 300–700, one family, one loading strategy, confirmed in the precache manifest | 6 |
| Light / Dark / System, user-settable, on the apps | 8 |
| The primitives `4h` defines | 7, 9–18 |
| BeltBar's 1px ring, no fill-only variant, three cases asserted | 11 |
| stylelint covers CSS; `inset` and `float` | 5 |
| Every component tested in `he` (RTL) and `en` (LTR) | 7 (harness), 8–18 |
| Strings from `@studio/i18n`; primitives take text as props | 8 (i18n keys), all primitives |
| Prove a new gate fails before trusting it | 2·7, 3·3, 5·7, 7·8, 11·6 |
| `lane-check.sh core` green | 18·6 |

**Gaps deliberately left, and why.**
- **Bi-colour belts beyond a second fill colour.** `5b`'s full belt *system* is M7's. `BeltBar` renders one, which is what stops M7 writing a second bar without the ring.
- **A `--brand-primary` colour picker.** D1 — v1 is logo-only. Task 4 lands the guarded path and its tests; nothing calls it.
- **`background-position: left top`** is not linted. Task 5 records why.
- **Visual regression screenshots.** §13 lists Playwright visual tests; those are M10's sweep, not M0's token layer.
- **The dev bar's own primitives.** M0.4.

**Type consistency check.** `ChipStatus` is defined in `StatusChip.tsx` (Task 12) and imported by `StudentRow.tsx` (Task 18) — same name, same module. `renderIn` / `DIRECTIONS` / `THEMES` are defined once in Task 7 and used unchanged in Tasks 8–18. `contrastRatio` is defined in Task 1 and used in Tasks 3 and 11. `TOKEN_ROLES` is defined in Task 2 and used in Tasks 3, 4 and 6. `ResolvedTheme` / `ThemePreference` come from the existing `theme.ts` and are not redefined.

---

## As built — where execution diverged from this plan, and what it found

Recorded after the fact. Every item was verified, not assumed.

### Nine things the plan did not predict

1. **The bijection parser had the hole it was written to prevent.** Proving the gate fired (Task 2 Step 7) showed a token planted in a *second* `:root { }` block sailed through — `readTokenBlock` read only the first block matching a selector. Fixed to merge every matching block in document order, plus a backstop asserting no custom property is declared outside the two audited blocks at all. **The plant found a bug in the plant's own target.**

2. **The seeded palette failed in seven places, not three.** Task 3 run against M0.1's values produced seven failures — `--border-strong` on four ground/surface pairings, plus dark `--accent`, `--paid` and `--cancelled`. Recorded as **D12**.

3. **`float` was already covered; `clear` and the `border-*-left/right-*` longhands were not.** The session prompt named `inset` and `float`. Probing rather than reading found `float` closed in M0.2 and two holes nobody had named.

4. **`.stylelintrc.json` became `stylelint.config.js`.** JSON cannot express a per-property `message`, and a generic one is what gets worked around. `border-left-width` now reads *"use border-inline-start-width"*. The `message` signature is `(property, value)` — verified by probe after the first attempt printed them reversed.

5. **A bare `<fieldset>` is `role="group"`, not `role="radiogroup"`.** Writing the ThemeControl test first caught it; assistive tech would not have announced "1 of 3". Both `ThemeControl` and `SegmentedControl` carry an explicit role.

6. **One of this plan's own tests was vacuous.** SegmentedControl's "two controls do not interfere" asserted the checked-count, which survives pinning `name` to a constant — React drives `checked` as a controlled prop and forces each input's state on every render. Rewritten to assert distinct `name` attributes, then re-mutated.

7. **`@fontsource-variable/rubik` was in no package.json at all.** It lived in the lockfile as an extraneous entry, so `npm install` for an unrelated devDependency pruned it. The build then emitted `url(@fontsource-variable/rubik/…)` **unresolved** — a 404 in production, tofu on every screen, nothing in the precache manifest. Caught by the Task 6 precache assertion. Now a declared dependency of `@studio/ui`, with a test asserting it stays one. **This is the single most consequential find of the session and it was latent before it.**

8. **`lane-check.sh` gained a sixth scoped gate.** It reported 5 before and 6 now; `margin-left` and `inset` planted in `tokens.css` left it green at exit 0 before Task 5.

9. **`--radius-md` and `--radius-lg` changed value** (10→9, 16→11) to match `4h`'s declared 9/11/14 corners, with `14px` becoming `--radius-xl`.

### Deliberate departures from the written plan

- **`EmptyState`'s title is an `<h3>`,** not a `<p role="heading" aria-level={3}>`. Same semantics, less machinery.
- **`AttendanceMark` types its icons as `ReactElement`,** not `JSX.Element` — the global `JSX` namespace is gone in React 19's types.
- **`brandOverridesFor` uses `Object.hasOwn`,** with a test that a prototype-polluted object cannot smuggle a brand token through.
- **`Radio.test.tsx` was derived from `Checkbox.test.tsx`** and extended with the grouping case, rather than hand-written twice.
- **Task 15 was written test-and-implementation in one step**, breaking fail-first. Recovered by three mutations; the second is finding 6 above.

### Verification, as run

```
./scripts/lane-check.sh core     ✅  6 scoped gates
./scripts/ci-local.sh            ✅  all gates green
npm test                         ✅  526 tests, 39 files
```

Every primitive renders in `he`/RTL and `en`/LTR under both themes. Every contrast floor
from D7 and D8 is a computed assertion over the live token values; none is a comment.
