/**
 * WCAG 2.x contrast, used by the token audit and by any primitive that has to prove a
 * colour it was handed is legible (BeltBar, chiefly — belt_rank.color_hex is per-studio
 * data, so it cannot be audited at build time).
 *
 * Kept dependency-free and pure: it runs in the token audit, which has no DOM.
 */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** SC 1.4.3 — normal-size body text. */
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

/** The sRGB transfer function, applied per channel before the weighted sum. */
function linearise(channel: number): number {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG 2.x relative luminance. 0 for black, 1 for white. */
export function relativeLuminance(hex: string): number {
  // Destructured from the tuple rather than mapped over it: `noUncheckedIndexedAccess`
  // widens Array.prototype.map's result to (number | undefined)[].
  const [r, g, b] = channels(hex)
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b)
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
