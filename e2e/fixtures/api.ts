/**
 * The §19.4 dev routes, as functions.
 *
 * ── Why the scenario is built through the product and not seeded ──────────────────────
 * `POST /dev/demo/reset` restores `app/services/demo/fixtures.py`'s fixture set, and that
 * set has three layers: `studio`, `personas` and `health_templates`. Everything §19.3
 * promises beyond them — structure, students, health, attendance, money, belts — is still
 * sitting in `PLANNED_LAYERS`, waiting on the milestone that owns it.
 *
 * So a reset gives this suite a clean studio and nine people, and not one group, student,
 * session or charge. `scenario.ts` builds those the only way they can be built: through the
 * product's own API, as a manager and a parent. That is not a second seeding path — it is
 * the product, driven the way §5.4a drives it.
 *
 * ── The reset is called ONCE per run, and that is not a preference ────────────────────
 * See `global-setup.ts`. `audit_log` is `NEVER_WIPED` (append-only by grant), `person` is
 * wiped, and `fk_audit_log_actor_person_id_person` is ON DELETE RESTRICT — so the first
 * audit row carrying an `actor_person_id` makes every later reset raise `RestrictViolation`.
 * One manager action is enough. Per-test reset is therefore impossible today, and each test
 * isolates itself by building its own entities instead.
 */

import type { APIRequestContext } from '@playwright/test'

import { API_ORIGIN } from '../origins'

/** §19.3's nine. There is deliberately no student persona — students have no login in v1. */
export type PersonaKey =
  | 'owner'
  | 'manager'
  | 'lead'
  | 'assistant'
  | 'parent3'
  | 'parent1'
  | 'trial'
  | 'both'
  | 'none'

export type Persona = {
  key: PersonaKey
  person_id: string
  studio_id: string
  label: string
  roles: string[]
  is_guardian: boolean
  tests: string
}

/** §19.5's four shapes, one per §5.10 security requirement. */
export type IpnShape = 'success' | 'amount_mismatch' | 'forged_ref' | 'duplicate'

async function refuse(what: string, response: { status(): number; text(): Promise<string> }) {
  throw new Error(`${what} answered ${response.status()}: ${(await response.text()).slice(0, 400)}`)
}

/**
 * §19.7's reset. Called from `global-setup.ts` and nowhere else — see the module docstring
 * for why once per run rather than once per test.
 */
export async function resetDemoStudio(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${API_ORIGIN}/api/v1/dev/demo/reset`, { data: {} })
  if (!response.ok()) await refuse('POST /dev/demo/reset', response)
}

/**
 * Read after every reset, never captured once and reused. The `personas` fixture layer
 * DELETES and recreates the nine rows, so a `person_id` does not survive a reset — a
 * hardcoded one would address a person who no longer exists.
 */
export async function personas(
  request: APIRequestContext,
): Promise<Record<PersonaKey, Persona>> {
  const response = await request.get(`${API_ORIGIN}/api/v1/dev/personas`)
  if (!response.ok()) await refuse('GET /dev/personas', response)
  const body = (await response.json()) as { items: Persona[] }
  return Object.fromEntries(body.items.map((p) => [p.key, p])) as Record<PersonaKey, Persona>
}

/**
 * §19.5's simulator, fired over the API rather than through the dev bar's tool.
 *
 * Two reasons, and the first one is decisive. `IpnSimulatorTool.tsx` hardcodes
 * `expectedAmountAgorot: 32000`, and `build_ipn_query` sends that value as the amount — so
 * the tool can only ever settle an order that happens to come to ₪320, and an
 * `amount_mismatch` fired from it is off by one agora from ₪320 rather than from the order
 * under test. Fixing it means editing `packages/ui`, which this lane must not touch.
 *
 * The second reason is that this is the honest shape anyway: an IPN is uPay's
 * server-to-server callback, not something a person clicks. Driving it through a UI would
 * be modelling the wrong actor.
 */
export async function simulateIpn(
  request: APIRequestContext,
  options: {
    shape: IpnShape
    orderPublicRef: string
    expectedAmountAgorot: number
    transactionId?: string
  },
): Promise<{ delivered: boolean; webhook_status: number | null; note: string }> {
  const response = await request.post(`${API_ORIGIN}/api/v1/dev/upay/simulate-ipn`, {
    data: {
      shape: options.shape,
      order_public_ref: options.orderPublicRef,
      expected_amount_agorot: options.expectedAmountAgorot,
      ...(options.transactionId ? { transaction_id: options.transactionId } : {}),
    },
  })
  if (!response.ok()) await refuse('POST /dev/upay/simulate-ipn', response)
  return (await response.json()) as {
    delivered: boolean
    webhook_status: number | null
    note: string
  }
}
