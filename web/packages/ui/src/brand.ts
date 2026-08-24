import { TOKEN_ROLES } from './tokens.roles'

/**
 * D2's tier gate. The ONE path a studio-supplied colour may take into the token layer.
 *
 * D1 means nothing calls this in v1 — a manager may upload a logo, not pick a hue. It
 * exists now so that when v2 adds the colour picker there is already a guarded path and a
 * test suite around it, rather than a second unguarded one written under deadline.
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
 *
 * Object.hasOwn, not `in`: an inherited property is not something the studio sent.
 */
export function brandOverridesFor(input: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const token of BRAND_TOKENS) {
    const value = Object.hasOwn(input, token) ? input[token] : undefined
    if (value !== undefined) out[token] = value
  }
  return out
}

/** Applies the filtered result to an element. The only writer. */
export function applyBrand(el: HTMLElement, input: Record<string, string>): void {
  for (const [token, value] of Object.entries(brandOverridesFor(input))) {
    el.style.setProperty(token, value)
  }
}
