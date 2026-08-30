import './fonts.css'
import './tokens.css'
import './primitives/primitives.css'
import './setup-wizard/setup-wizard.css'

export { HelloProof } from './HelloProof'
export { ThemeProvider, useTheme } from './ThemeProvider'
// Every app calls this once, at its root. Without it `<html dir>` stays on the literal its
// index.html shipped and picking English renders LTR copy inside an RTL document.
export { useDocumentLocale } from './useDocumentLocale'
// `aria-modal="true"` is a promise about the rest of the page. This is what keeps it.
export { useModalDialog } from './useModalDialog'
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
export { AttendanceStrip } from './primitives/AttendanceStrip'
export type { AttendanceStripItem } from './primitives/AttendanceStrip'
export { BeltBar, BeltLadder } from './primitives/BeltBar'
export { SlotChips } from './primitives/SlotChips'
export type { SlotChipOption } from './primitives/SlotChips'
export { Button } from './primitives/Button'
export type { ButtonVariant } from './primitives/Button'
export { Card } from './primitives/Card'
// The composition layer — how primitives sit next to each other. See
// docs/design/proposals/manager-home.md; ActionBar is the fix for RolloverWizard.tsx:366.
export { ActionBar } from './primitives/ActionBar'
export { PageHeader } from './primitives/PageHeader'
export { SectionHeader } from './primitives/SectionHeader'
export { StatTile } from './primitives/StatTile'
export type { StatTone } from './primitives/StatTile'
export { DateRangePicker } from './primitives/DateRangePicker'
export { Checkbox } from './primitives/Checkbox'
export { EmptyState } from './primitives/EmptyState'
export { LoadFailed } from './primitives/LoadFailed'
export { MoneyDisplay } from './primitives/MoneyDisplay'
export type { MoneyTone } from './primitives/MoneyDisplay'
export { ProgressBar } from './primitives/ProgressBar'
// A range is one ltr island. Three separate bidi bugs came from not having this.
export { RangeText } from './primitives/RangeText'
export { Radio } from './primitives/Radio'
export { SegmentedControl } from './primitives/SegmentedControl'
export { StatusChip } from './primitives/StatusChip'
export type { ChipStatus } from './primitives/StatusChip'
export { StudentRow } from './primitives/StudentRow'
export { Table } from './primitives/Table'
export type { TableColumn } from './primitives/Table'
export { Switch } from './primitives/Switch'
export { TextField } from './primitives/TextField'
export { SelectField } from './primitives/SelectField'
export { PlanBadge } from './primitives/PlanBadge'
export { ThemeControl } from './primitives/ThemeControl'
export { Toast } from './primitives/Toast'

// The shell both apps mount (§6.2, §6.3). The drawer is the one component here whose
// layout is direction-dependent, which is why G12 matters most in it.
export { AppShell } from './shell/AppShell'
export { TabBar } from './shell/TabBar'
export type { TabBarItem } from './shell/TabBar'
export { SideNav } from './shell/SideNav'
export type { SideNavBadge, SideNavGroup, SideNavItem } from './shell/SideNav'
export { Icon } from './primitives/Icon'
export type { IconName } from './primitives/Icon'
// Artboard 2e / 9e — language and theme, in the drawer they are drawn in.
export { AccountDrawerFooter } from './shell/AccountDrawerFooter'
export { NavDrawer } from './shell/NavDrawer'
export type { NavItem } from './shell/NavDrawer'
export { StudioSwitcher } from './shell/StudioSwitcher'
export type { SwitchableStudio } from './shell/StudioSwitcher'

// §6.1's first run and §6.5's install walkthrough. Shared because both apps walk the same
// four screens; only the branch AFTER sign-in differs, and that lives in each app's own
// features/identity/Resolve.tsx.
export { LanguagePicker } from './first-run/LanguagePicker'
export { SignIn } from './first-run/SignIn'
export type { SignInProvider } from './first-run/SignIn'
export { RefusalScreen } from './first-run/RefusalScreen'
export { InstallWalkthrough, isIosSafari } from './first-run/InstallWalkthrough'
export type { InstallPromptEvent } from './first-run/InstallWalkthrough'
export { InstallBanner } from './first-run/InstallBanner'
export { UpdateToast } from './sw-update/UpdateToast'
export {
  SW_LAUNCH_GRACE_MS,
  SW_UPDATE_CHECK_INTERVAL_MS,
  SW_UPDATE_EVENT,
  onSwUpdateReady,
} from './sw-update/swUpdate'
export type { SwUpdateDetail } from './sw-update/swUpdate'

// §5.1's setup wizard. The container reads useSlot('setup-wizard') — the id M0 already
// declared — so M7's belts step and M6's prices step land as one file plus one line in
// setup-wizard/register.ts, and SetupWizard.tsx is never reopened.
//
// It lives in @studio/ui and not in an app feature directory because §5.1 says "the staff
// app and dashboard route them into" it: both mount the same wizard in place.
export { SetupWizard } from './setup-wizard/SetupWizard'
export { SetupIncompleteBanner } from './setup-wizard/SetupIncompleteBanner'
export type { SetupClient } from './setup-wizard/SetupWizard'
export { registerM1WizardSteps } from './setup-wizard/register'
// The belts / prices / items steps, moved beside the container (2026-08-30) so BOTH apps
// register them — the staff app had three dead rail entries while they lived in the
// dashboard's feature directories. The dashboard passes its full feature clients (they
// satisfy the minimal shapes structurally); the staff app uses the makeWizard* factories.
export { BeltsWizardStep, SCRATCH, registerBeltsWizardStep } from './setup-wizard/BeltsWizardStep'
export {
  PRICES_WIZARD_ORDER,
  PricesWizardStep,
  registerPricesWizardStep,
} from './setup-wizard/PricesWizardStep'
export {
  ITEMS_WIZARD_ORDER,
  ItemsWizardStep,
  registerItemsWizardStep,
} from './setup-wizard/ItemsWizardStep'
export {
  makeWizardBeltsClient,
  makeWizardItemsClient,
  makeWizardPricesClient,
} from './setup-wizard/step-clients'
export type {
  WizardBeltsClient,
  WizardItemsClient,
  WizardPricesClient,
} from './setup-wizard/step-clients'
export { PlanFrequencyPicker, PlanPreview, frequencyLabel } from './setup-wizard/PlanFrequency'
export {
  BLANK_ITEM,
  ItemForm,
  draftFrom,
  sizesLabel,
  toInput,
  validateItem,
} from './setup-wizard/ItemForm'
export type { ItemDraft, ItemErrors } from './setup-wizard/ItemForm'
export {
  makeSetupClient,
  makeStaffClient,
  makeStructureClient,
  makeStudentsClient,
  makeStudioClient,
} from './setup-wizard/client'
export type { Fetcher } from './setup-wizard/client'
export { WIZARD_STEP_ORDER } from './setup-wizard/types'
export type {
  SetupProgress,
  WizardStep,
  WizardStepId,
  WizardStepProps,
  WizardStepStatus,
} from './setup-wizard/types'
