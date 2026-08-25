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

// The token layer. `contrast` is exported because M10's a11y sweep and v2's brand picker
// both need it, and a second implementation would be a second set of numbers.
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

// Primitives, ported from dashboard artboard 4h (ספריית רכיבים).
// `./testing` is deliberately NOT exported: it pulls in @testing-library/react, which
// must never reach an app bundle.
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

// The shell both apps mount (§6.2, §6.3). The drawer is the one component here whose
// layout is direction-dependent, which is why G12 matters most in it.
export { AppShell } from './shell/AppShell'
export { NavDrawer } from './shell/NavDrawer'
export type { NavItem } from './shell/NavDrawer'
export { StudioSwitcher } from './shell/StudioSwitcher'
export type { SwitchableStudio } from './shell/StudioSwitcher'
