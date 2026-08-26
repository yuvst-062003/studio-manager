// The staff app's one billing endpoint. **Names, never prices.**
//
// §3.2 gives a coach no financial read at all, and invariant 3 enforces it against the
// `coach` router tag — so `GET /products/handout-options` returns `{id, name}` and has no
// money field to leak. That absence is why the endpoint exists instead of reusing
// `/products`, and a backend test asserts it: adding `price_agorot` to that shape makes
// invariant 3 name the exact field.
import type { components } from '@studio/api-client'

export type HandoutOption = components['schemas']['HandoutOptionOut']

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

export type HandoutClient = {
  options(): Promise<HandoutOption[]>
  handOut(input: { productId: string; studentId: string; priceAgorot?: never }): Promise<void>
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
  }
}
