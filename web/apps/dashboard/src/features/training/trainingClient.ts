// The two switches and one checklist that make a training plan enforceable.
//
// A separate client from `features/schedule/client.ts` on purpose: `group.kind` and
// `group.is_invite_only` are read by the training-plan rules, not by the schedule lane, and
// the routes that write them are deliberately their own (`PATCH /groups/{id}/training-kind`)
// rather than fields on another lane's group shape.
import { apiFetch } from '@studio/core'

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

export type GroupKind = 'base' | 'extra' | 'private'

export type TrainingGroup = {
  id: string
  name: string
  kind: GroupKind
  is_invite_only: boolean
}

export type TrainingClient = {
  groups(): Promise<TrainingGroup[]>
  setKind(groupId: string, patch: { kind?: GroupKind; is_invite_only?: boolean }): Promise<void>
  eligibility(groupId: string): Promise<string[]>
  setEligibility(groupId: string, baseGroupIds: string[]): Promise<void>
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function ok(response: Response): Promise<Response> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return response
}

export function makeTrainingClient(fetcher: Fetcher = apiFetch): TrainingClient {
  return {
    async groups() {
      const response = await ok(await fetcher('/api/v1/groups?limit=200'))
      return ((await response.json()) as { items: TrainingGroup[] }).items
    },
    async setKind(groupId, patch) {
      await ok(
        await fetcher(`/api/v1/groups/${groupId}/training-kind`, {
          method: 'PATCH',
          headers: JSON_HEADERS,
          body: JSON.stringify(patch),
        }),
      )
    },
    async eligibility(groupId) {
      const response = await ok(await fetcher(`/api/v1/groups/${groupId}/eligibility`))
      return ((await response.json()) as { base_group_ids: string[] }).base_group_ids
    },
    // A full replace rather than add/remove: the manager's mental model is a checklist
    // ("Groups 3, 4 and 5"), and two verbs for one checklist is how a half-applied edit
    // happens.
    async setEligibility(groupId, baseGroupIds) {
      await ok(
        await fetcher(`/api/v1/groups/${groupId}/eligibility`, {
          method: 'PUT',
          headers: JSON_HEADERS,
          body: JSON.stringify({ base_group_ids: baseGroupIds }),
        }),
      )
    },
  }
}
