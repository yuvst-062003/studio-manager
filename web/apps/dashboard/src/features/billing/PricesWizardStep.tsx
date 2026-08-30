// Moved into the shared wizard package (2026-08-30): §5.1 mounts the wizard in BOTH the
// dashboard and the staff app, and a step living in one app's feature directory left the
// other with a dead rail entry. Re-exported so App.tsx and the tests stay put; the full
// DashboardBillingClient satisfies the step's minimal client shape structurally.
export { PRICES_WIZARD_ORDER, PricesWizardStep, registerPricesWizardStep } from '@studio/ui'
