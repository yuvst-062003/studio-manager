// §19.4 — "the component is tree-shaken out of production client bundles by an env
// flag, so it is not merely hidden."
//
// The flag is folded to a literal at build time (Vite `define`), so the ternary below
// becomes `false ? Real : Absent`, rollup drops the unreachable branch, and every
// module reachable only through it leaves the graph. Measured in M0.4 by building the
// staff app twice and grepping dist/: absent with the flag off, present with it on.
// web/tools/__tests__/dev-bar-bundle.test.ts is that measurement, kept.
//
// `import.meta.env.DEV` covers `npm run dev` without anyone having to remember a flag;
// VITE_DEV_TOOLS=true is the opt-in for a *built* bundle — a staging deploy you want
// the bar on. Both fold statically; the combined expression was measured too.
//
// **`registerDevTool` calls, without a bare side-effect import.** A bare top-level
// `import './devTools'` here is exactly the form DCE does not drop — a side-effect-only
// import survives for the same reason a CSS import does: rollup cannot prove removing it
// is safe. So `./devTools` is never imported from this file. `./DevBar.tsx` imports it
// instead — that puts the registration inside the subtree this module's disabled branch
// makes unreachable, and it leaves with the rest of `RealDevBar` when the flag is off.
// Measured, not assumed: web/tools/__tests__/dev-bar-bundle.test.ts is the arbiter.
//
// **Import the real module directly in tests.** Under vitest neither env var is set, so
// this switch yields the absent shapes and a test importing DevBar from here would
// render nothing and pass for the wrong reason.
import { DevBar as RealDevBar } from './DevBar'
import { devHeaders as realDevHeaders } from './api'
import { AbsentDevBar, absentDevHeaders } from './absent'

const enabled = import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === 'true'

export const DevBar = enabled ? RealDevBar : AbsentDevBar
export const devHeaders = enabled ? realDevHeaders : absentDevHeaders
export type { DevIdentity } from './DevBar'
