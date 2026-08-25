// `import.meta.env.DEV` / `import.meta.env.VITE_DEV_TOOLS` — Task 17's switch in
// packages/ui/src/dev-bar/index.ts folds itself to the absent shapes in a production
// build using these. Declared once at the workspace root for the same reason as
// pwa.d.ts: the per-app tsconfig `types` entry is not seen by the root `tsc --noEmit`
// that CI runs, and overriding `types` globally would disable automatic @types
// resolution.
/// <reference types="vite/client" />
