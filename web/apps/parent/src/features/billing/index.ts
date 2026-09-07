export { PaymentsScreen } from './PaymentsScreen'
export type { DebtRow, PaymentsScreenProps } from './PaymentsScreen'
export { PaymentHistoryScreen } from './PaymentHistoryScreen'
export { PaymentCompleteScreen } from './PaymentCompleteScreen'
export { instalmentSplit, oldestMonths, selectionTotal } from './billingClient'
export type { BillingClient, ChargeOut, PaymentOut, UpayForm } from './billingClient'
// §6.1's payment step used to live here as `PaymentSetup`, asking a method per child in
// front of the whole app. Deleted 2026-09-07: the wizard's step 3 asks it once, at the one
// moment a family is already thinking about money, and the payments screen changes it
// afterwards. `MandateLink` is the one thing that outlived it — the wizard's done screen
// still shows a הוראת קבע link per child — and it moved to billingClient.ts beside the
// read that produces it.
