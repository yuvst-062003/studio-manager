// vite-plugin-pwa exposes `virtual:pwa-register` only through this reference.
// Declared once at the workspace root: the per-app tsconfig `types` entry is not
// seen by the root `tsc --noEmit` that CI runs, and overriding `types` globally
// would disable automatic @types resolution.
/// <reference types="vite-plugin-pwa/client" />
