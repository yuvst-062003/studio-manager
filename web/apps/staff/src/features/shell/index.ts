// The staff app's shell barrel. Both exports are mounted by `App.tsx` in the very next
// piece of work — see docs/superpowers/specs/2026-09-06-staff-app-redesign.md §3 — which is
// why `web/tools/__tests__/unreachable-screens.test.ts` will flag them as orphans until that
// lands. Do not add a self-reference here to quiet it early; that test exists to catch a
// component wired nowhere, and one wired into this file to satisfy the test is still wired
// nowhere.
export { StaffShell } from './StaffShell'
export { StaffTabBar } from './StaffTabBar'
export type { StaffTab } from './StaffTabBar'
