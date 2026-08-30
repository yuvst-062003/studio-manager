// The staff app's one money read, in one file — the same reason `handoutClient.ts` exists:
// a screen with a fetch in it is a screen a test has to stand up a server for.
//
// MANAGER-ONLY BY ROUTE. §13's third invariant keeps financial fields off coach-scoped
// endpoints, and every path here is `ManagerOrOwner`: a coach gets 403s and the shell
// never links them to the screen that calls them.
import { apiFetch } from '@studio/core'

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

/** A pending promise as the door needs it: who, how much, by which route, since when. */
export type StaffPromiseRow = {
  id: string
  status: string
  method: 'cash' | 'cheque' | 'standing_order'
  total_agorot: number
  /** The program a plan claim is about, or null for an ordinary promise. */
  claimed_plan_name: string | null
  payer_name: string
  charge_count: number
  created_at: string
}

export type PromiseClient = {
  pending(): Promise<StaffPromiseRow[]>
  decide(promiseId: string, how: 'confirm' | 'decline'): Promise<void>
}

export function makePromiseClient(fetcher: Fetcher = apiFetch): PromiseClient {
  return {
    async pending() {
      const response = await fetcher('/api/v1/payment-promises?status=pending')
      if (!response.ok) throw new Error(String(response.status))
      return ((await response.json()) as { items: StaffPromiseRow[] }).items
    },
    async decide(promiseId, how) {
      const response = await fetcher(`/api/v1/payment-promises/${promiseId}/${how}`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error(String(response.status))
    },
  }
}
