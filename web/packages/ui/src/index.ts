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

export {
  AA_TEXT,
  NON_TEXT,
  contrastRatio,
  meetsAA,
  meetsNonText,
  relativeLuminance,
} from './contrast'

export { GROUND_TOKENS, TIERS, TOKEN_ROLES } from './tokens.roles'
export type { GroundToken, Obligation, Tier, TokenRole } from './tokens.roles'
export { BRAND_TOKENS, applyBrand, brandOverridesFor } from './brand'

export { Card } from './primitives/Card'
