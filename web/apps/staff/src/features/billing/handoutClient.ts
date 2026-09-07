// The staff app's one billing endpoint. **Names, never prices.**
//
// §3.2 gives a coach no financial read at all, and invariant 3 enforces it against the
// `coach` router tag — so `GET /products/handout-options` returns `{id, name}` and has no
// money field to leak. That absence is why the endpoint exists instead of reusing
// `/products`, and a backend test asserts it: adding `price_agorot` to that shape makes
// invariant 3 name the exact field.
import type { components } from '@studio/api-client'

export type HandoutOption = components['schemas']['HandoutOptionOut']

/** One shop order this lesson's families have paid for and not yet been given. Carries the
 *  size — `line_note` is the shop's own "גי · 140" — because the family was promised a
 *  hand-over "לאחר וידוא מידה" and a coach who cannot see the size cannot keep that. Like
 *  everything else here it names no money; invariant 3 checks the shape server-side. */
export type AwaitingHandout = components['schemas']['AwaitingHandoutOut']

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

export type HandoutClient = {
  options(): Promise<HandoutOption[]>
  handOut(input: { productId: string; studentId: string; priceAgorot?: never }): Promise<void>
  /** What this lesson's families have already bought and are waiting for. Scoped to the
   *  SESSION, not to a child: per-student it would be one request per person on the mat to
   *  answer a question that is one query. */
  awaiting(sessionId: string): Promise<AwaitingHandout[]>
  /** Settle one of those — the family already paid, the coach is giving them the item.
   *  Answers `false` when the order was handed over by somebody else in the meantime (409),
   *  which is ordinary rather than exceptional: two coaches, one stale list. */
  markHandedOver(chargeId: string): Promise<boolean>
}

export function makeHandoutClient(fetcher: Fetcher): HandoutClient {
  return {
    async options() {
      const response = await fetcher('/api/v1/products/handout-options')
      return (await json<{ items: HandoutOption[] }>(response)).items
    },
    async handOut({ productId, studentId }) {
      // The coach picks the ITEM; the server prices it from `product.price_agorot`. No
      // amount crosses this boundary in either direction, which is what makes the screen
      // safe under §3.2 rather than merely careful — and `priceAgorot?: never` in the type
      // above means a caller that tried to send one would not compile.
      const response = await fetcher('/api/v1/charges/from-product', {
        method: 'POST',
        headers: JSON_HEADERS,
        // No payer either: §4.3 captures it from the student's primary guardian
        // server-side, so a coach could not attribute a charge to the wrong family.
        body: JSON.stringify({ product_id: productId, student_id: studentId }),
      })
      if (!response.ok) throw new Error(`${response.status} ${response.url}`)
    },
    async awaiting(sessionId) {
      const response = await fetcher(`/api/v1/sessions/${sessionId}/awaiting-handout`)
      return (await json<{ items: AwaitingHandout[] }>(response)).items
    },
    async markHandedOver(chargeId) {
      const response = await fetcher(`/api/v1/charges/${chargeId}/hand-over`, { method: 'POST' })
      // A 409 is not a failure the coach has to do anything about — somebody already handed
      // the item over, and the row simply leaves the list. Reported as `false` so the
      // caller can say so rather than showing a red error for a thing that went right.
      if (response.status === 409) return false
      if (!response.ok) throw new Error(`${response.status} ${response.url}`)
      return true
    },
  }
}
