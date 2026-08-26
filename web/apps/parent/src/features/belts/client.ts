// The parent app's belt endpoints: a child's own history, and the ladder it sits on.
//
// Read-only, and that is the whole surface. §3.2 gives a guardian no grading capability at
// all — the award routes exist and this client does not reach them, because a client is a
// statement about what an app does.
import type { components } from '@studio/api-client'

export type StudentBeltOut = components['schemas']['StudentBeltOut']
export type LadderRankOut = components['schemas']['LadderRankOut']

export type Page<T> = { items: T[]; next_cursor: string | null; has_more: boolean }

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

export function makeParentBeltsClient(fetcher: Fetcher) {
  return {
    /** 12d's timeline. Scoped server-side to this guardian's own children. */
    studentBelts: async (studentId: string): Promise<Page<StudentBeltOut>> =>
      json(await fetcher(`/api/v1/students/${studentId}/belts`)),

    /** The class's whole ladder, which is what makes a PROGRESSION renderable: 12d draws
     *  every rung, not only the ones earned, so a parent can see what comes next. */
    ladder: async (classId: string): Promise<Page<LadderRankOut>> =>
      json(await fetcher(`/api/v1/belt-ranks?class_id=${classId}`)),
  }
}

export type ParentBeltsClient = ReturnType<typeof makeParentBeltsClient>

export type SegmentState = 'earned' | 'current' | 'future'

/**
 * How each rung of the ladder is drawn for this child.
 *
 * `current` is the HIGHEST rank held, matching `student.current_belt_id`'s own rule on the
 * server — not the most recently awarded, because back-filling an old grade must not
 * demote a child on the screen any more than it does in the database.
 */
export function segmentStates(
  ladder: LadderRankOut[],
  awards: StudentBeltOut[],
): Map<string, SegmentState> {
  const held = new Set(awards.map((award) => award.belt_rank_id))
  const highest = ladder.filter((rank) => held.has(rank.id)).at(-1)
  const states = new Map<string, SegmentState>()
  for (const rank of ladder) {
    if (rank.id === highest?.id) states.set(rank.id, 'current')
    else if (held.has(rank.id)) states.set(rank.id, 'earned')
    else states.set(rank.id, 'future')
  }
  return states
}

/**
 * The fill for a segment, faded only when the rank has not been reached.
 *
 * **An 8-digit hex, so the FILL carries the alpha and the ring does not.** 12d finding 4:
 * the ring is a contrast obligation (SC 1.4.11) rather than decoration, so it must stay at
 * full strength on a segment whose fill is dimmed. `BeltBar` takes the fill as a prop and
 * reads `--belt-ring` from the theme, which is exactly what makes that separation possible
 * without touching the primitive.
 *
 * `59` is 35% — enough to read as "not yet" beside a solid neighbour, and the ring carries
 * the edge regardless.
 */
export function segmentFill(colorHex: string, state: SegmentState): string {
  return state === 'future' ? `${colorHex}59` : colorHex
}
