// The manager dashboard's belt endpoints, in one file.
//
// **`color_hex` is DATA, and this is the one client in the product that carries a raw hex
// legitimately.** D3: a belt colour is per-studio, per-class configuration about a
// real-world object, which is exactly why D3 rejected belt colours as a brand palette.
// G13's "named tokens, never hardcoded hex" governs the *design* layer and does not reach
// here.
import type { components } from '@studio/api-client'

export type BeltRankOut = components['schemas']['BeltRankOut']
export type BeltRankIn = components['schemas']['BeltRankIn']
export type LadderRankOut = components['schemas']['LadderRankOut']
export type BeltPresetOut = components['schemas']['BeltPresetOut']
export type StudentBeltOut = components['schemas']['StudentBeltOut']

export type Page<T> = { items: T[]; next_cursor: string | null; has_more: boolean }

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

export function makeDashboardBeltsClient(fetcher: Fetcher) {
  return {
    /** One class's ladder, whole. `next_rank_id` is derived from the full list, so a page
     *  of it would make the last rung look like the top. The largest preset is twelve. */
    ladder: async (classId: string): Promise<Page<LadderRankOut>> =>
      json(await fetcher(`/api/v1/belt-ranks?class_id=${classId}`)),

    createRank: async (body: BeltRankIn): Promise<LadderRankOut> =>
      json(
        await fetcher('/api/v1/belt-ranks', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify(body),
        }),
      ),

    updateRank: async (rankId: string, body: BeltRankIn): Promise<LadderRankOut> =>
      json(
        await fetcher(`/api/v1/belt-ranks/${rankId}`, {
          method: 'PATCH',
          headers: JSON_HEADERS,
          body: JSON.stringify(body),
        }),
      ),

    /** 409 when students hold the rank — `events.belt.deleteHeld`. The row already shows
     *  the count, so the refusal has its reason on screen. */
    deleteRank: async (rankId: string): Promise<void> => {
      const response = await fetcher(`/api/v1/belt-ranks/${rankId}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(`${response.status} ${response.url}`)
    },

    /** The whole finished order. A pairwise swap through `uq_belt_rank_class_order` has to
     *  pass through a colliding intermediate state; a full rewrite does not. */
    reorder: async (classId: string, orderedIds: string[]): Promise<Page<LadderRankOut>> =>
      json(
        await fetcher('/api/v1/belt-ranks/reorder', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ class_id: classId, ordered_ids: orderedIds }),
        }),
      ),

    /** §5.9's seeded sets, for `5d`'s cards and `5b`'s load-a-preset button. */
    presets: async (): Promise<Page<BeltPresetOut>> => json(await fetcher('/api/v1/belt-presets')),

    seed: async (classId: string, presetKey: string): Promise<Page<LadderRankOut>> =>
      json(
        await fetcher('/api/v1/belt-ranks/seed', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ class_id: classId, preset_key: presetKey }),
        }),
      ),

    /** `12d`'s timeline and `4d`'s history column. */
    studentBelts: async (studentId: string): Promise<Page<StudentBeltOut>> =>
      json(await fetcher(`/api/v1/students/${studentId}/belts`)),
  }
}

export type DashboardBeltsClient = ReturnType<typeof makeDashboardBeltsClient>

/**
 * The bounded palette `5b`'s picker offers, and the reason it is bounded.
 *
 * D1 forbids a studio choosing an arbitrary *brand* colour in v1, because an arbitrary hex
 * can fail a contrast check. A belt colour is different — it is per-class data (D3, §5.9),
 * and a bounded set keeps it auditable. That is what makes a picker legitimate here at all,
 * and it is why there is no hex field beside it.
 *
 * These are the eight `app/services/belts/presets.py` seeds from, so a studio that starts
 * from a preset and then edits a rank stays inside one palette.
 */
export const BELT_PALETTE: readonly string[] = [
  '#FFFFFF',
  '#F7E017',
  '#F08A24',
  '#2E8B4A',
  '#2B6CB0',
  '#6B46C1',
  '#6F4A2F',
  '#111111',
]
