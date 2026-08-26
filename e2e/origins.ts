/**
 * The three app origins, in one place.
 *
 * ── Why this file exists, and not just three `baseURL`s ───────────────────────────────
 * `playwright.config.ts` gives each project its own `baseURL`, which is what a project
 * needs to walk *one* app. But four of the five flows are cross-app inside a single test:
 * `02-offline-attendance.spec.ts`'s first test marks a roster at `/staff/today` (5173) and
 * then asserts the result at `/dashboard/attendance` (5175) on the same `page`. A project's
 * `baseURL` is one origin, so a relative `page.goto()` cannot address both — no arrangement
 * of projects fixes that, because the requirement is two origins in one test, not two
 * projects.
 *
 * So the second origin has to be absolute, and an absolute URL hardcoded into a spec is a
 * port number copied into five files. This module is the one place it lives:
 *
 *     import { ORIGINS } from './origins'
 *     await page.goto(`${ORIGINS.dashboard}/#/attendance`)
 *
 * The spec bodies do not use it yet. They still carry the M0 path-shaped `goto()` calls
 * that HB-w3-e2e-harness describes, and rewriting them is that holdback's work, not this
 * commit's. This file is the tool that work needs, put in place ahead of it.
 *
 * ── The apps are `localhost` and the API is `127.0.0.1`, and that asymmetry is deliberate ─
 * It looks like an inconsistency someone forgot to tidy. It is not — the two servers bind
 * differently, and this was measured on a running stack rather than reasoned about:
 *
 *     localhost:5173  -> 200      127.0.0.1:5173  -> connection refused
 *     127.0.0.1:8000  -> 200      localhost:8000  -> 200
 *
 * Vite listens on `::1` only, because its default host is `localhost` and Node resolves
 * that to IPv6 first. uvicorn listens on `127.0.0.1` only, because it binds IPv4 — which is
 * the trap every app's `vite.config.ts` already documents for its `/api` proxy target.
 *
 * So each origin here names the address its server actually answers on. Pointing the apps
 * at `127.0.0.1` fails outright; pointing the API at `localhost` works under `curl`, which
 * retries the other family, but not necessarily under Node, which historically does not.
 * Playwright's `webServer` readiness probes are Node.
 *
 * If a dev server is ever given `--host`, this file is what has to change with it.
 */

const env = process.env

export const ORIGINS = {
  /** Managers + coaches. `web/apps/staff` — vite.config.ts `server.port`. */
  staff: env.E2E_STAFF_URL ?? 'http://localhost:5173',
  /** Guardians + adult students. `web/apps/parent`. */
  parent: env.E2E_PARENT_URL ?? 'http://localhost:5174',
  /** Manager web. `web/apps/dashboard`. */
  dashboard: env.E2E_DASHBOARD_URL ?? 'http://localhost:5175',
} as const

/** The API, which every app reaches through its own dev-server proxy on `/api`. */
export const API_ORIGIN = env.E2E_API_URL ?? 'http://127.0.0.1:8000'

export type AppName = keyof typeof ORIGINS
