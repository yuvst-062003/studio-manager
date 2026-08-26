/**
 * One reset, at the top of the run.
 *
 * ── Why not one reset per test ────────────────────────────────────────────────────────
 * Because `POST /dev/demo/reset` works exactly once, and then 500s for ever. Three
 * decisions meet to produce that, each defensible alone:
 *
 *   * `audit_log` is in `NEVER_WIPED` (`app/services/demo/service.py`) — it is append-only
 *     by grant, and §19.4 audit-logs every persona switch to it, so it is evidence rather
 *     than scratch data.
 *   * `person` IS wiped — the `personas` layer deletes and recreates the nine rows.
 *   * `fk_audit_log_actor_person_id_person` is ON DELETE **RESTRICT**.
 *
 * So the first audit row carrying an `actor_person_id` pins the person it names, and the
 * next wipe raises `RestrictViolation`. Measured, not reasoned about: with an empty
 * `audit_log`, reset answers 200, and answers 200 again with no actions in between; one
 * `POST /locations` (which writes no audit row) leaves it at 200; one `PATCH /studio`
 * (which writes one, with an actor) takes it to 500.
 *
 * That makes §19.7's "restores the fixture set from a versioned seed" unreachable after a
 * single meaningful use, and it is not this lane's to fix — the repair is a migration
 * setting those two actor foreign keys to ON DELETE SET NULL, and `main` owns
 * `alembic/versions/**`. Tracked as a holdback.
 *
 * ── What this file does about it, and what it refuses to do quietly ───────────────────
 * It clears `audit_log` before resetting, and says so on stdout every time. Clearing it
 * destroys exactly the evidence `NEVER_WIPED` exists to protect, so the one thing this must
 * not be is silent: a developer reading the run output should see the workaround and the
 * holdback that will remove it, not discover months later that their audit trail has been
 * truncated by a test run.
 *
 * Because there is only one reset, no test may assume an empty studio. Each builds its own
 * group, its own student and its own charges, and asserts only on ids it created —
 * isolation by construction rather than by teardown, which is the sturdier arrangement in
 * any case.
 */

import { request } from '@playwright/test'

import { API_ORIGIN } from '../origins'
import { resetDemoStudio } from './api'

// `clearAuditLog()` is deliberately gone (ship-audit B6). It truncated `audit_log` here
// because the actor foreign keys were ON DELETE RESTRICT and one audited action broke
// every later `/dev/demo/reset`. Revision 0011 made both actor references SET NULL, so
// the reset now survives its own history and §19.4's persona-switch evidence survives the
// suite — which is what NEVER_WIPED promised all along.
export default async function globalSetup(): Promise<void> {
  const api = await request.newContext({ baseURL: API_ORIGIN })
  try {
    await resetDemoStudio(api)
    console.log('[e2e] demo studio reset — studio, nine personas, two health templates.\n')
  } finally {
    await api.dispose()
  }
}
