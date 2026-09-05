import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// §9 — Tailwind for the onboarding wizard only. src/tailwind.css imports theme and
// utilities but NOT preflight; see that file for why.
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { manifest } from './manifest.config'
import { workspaceAliases } from '../../tools/workspace-aliases'

export default defineConfig({
  // The same map vitest.config.ts applies. A test-only alias would give a lane green tests
  // and a dev server still serving main's components, which is the worse half of the bug --
  // it looks fixed. See tools/workspace-aliases.ts.
  resolve: { alias: workspaceAliases() },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      manifest,
      workbox: {
        // woff2 is the load-bearing entry: §6.1 primes offline on the assumption
        // that Rubik is already cached before a coach walks into a basement.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5174,
    // The apps call the API on RELATIVE paths (`/api/v1/...` -- see
    // packages/core/src/identity/session.ts and every feature client). Without this the
    // dev server answers those with index.html, so `response.json()` gets the SPA shell
    // and every call fails in a way that looks like an empty API rather than a missing
    // proxy -- which is exactly how the sign-in screen ended up with zero buttons.
    //
    // Proxying rather than pointing the client at the API's own origin is deliberate: it
    // keeps the httpOnly refresh cookie SAME-ORIGIN, so the browser sends it back without
    // depending on third-party-cookie policy. infra/railway/README.md's HB-domain is the
    // same problem in staging, and this is the local shape of its fix.
    //
    // 127.0.0.1 and not localhost: uvicorn binds IPv4 only, while Node resolves
    // localhost to ::1 first -- the proxy would ECONNREFUSED against a running API.
    proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: false } },
  },
})
