// The four §18.3 endpoints that have existed since M1 and that nothing in `web/` called.
//
// `app/routers/platform.py` shipped `GET /platform/studios`, `POST /platform/studios`,
// `POST /platform/studios/{id}/invite-owner` and `POST /platform/studios/{id}/suspend`
// in M1, all four tested, and no frontend anywhere issued a single request to any of
// them: provisioning a club was a `railway ssh` away, or `scripts/bootstrap-owner.py`.
// This is the caller. `GET /platform/health` is the one genuinely new route, and it is
// the operations board the studios endpoint's own docstring deferred ("the rows, not the
// health chips -- M9 owns those, and the operations board with them").
import type { apiFetch as ApiFetch } from '@studio/core'

export type PlatformStudio = {
  id: string
  name: string
  slug: string
  timezone: string
  default_locale: string
  status: string
  is_demo: boolean
  created_at: string
}

export type IssuedInvitation = {
  id: string
  email: string
  expires_at: string
  /** Returned exactly once and stored only as a SHA-256, so a screen that does not show
   *  it immediately has lost it. `platform.invite.tokenOnce` says so on screen. */
  token: string
}

export type JobHealth = {
  name: string
  schedule: string
  environment: string
  max_silence_minutes: number
  last_run_at: string | null
  last_success_at: string | null
  last_status: string | null
  overdue: boolean
  failing: boolean
  scheduled_here: boolean
}

export type OpsSignal = {
  id: string
  status: string
  value: number | null
  since: string | null
}

export type OpsHealth = {
  status: string
  checked_at: string
  env: string
  jobs: JobHealth[]
  signals: OpsSignal[]
  email_configured: boolean
}

export type NewStudio = {
  name: string
  slug: string
  timezone: string
  default_locale: string
}

export type OwnerInvite = {
  email: string
  first_name: string
  last_name: string
}

export type PlatformClient = {
  listStudios: () => Promise<PlatformStudio[]>
  createStudio: (body: NewStudio) => Promise<PlatformStudio>
  inviteOwner: (studioId: string, body: OwnerInvite) => Promise<IssuedInvitation>
  suspend: (studioId: string) => Promise<PlatformStudio>
  health: () => Promise<OpsHealth>
}

/** Every call throws on a non-2xx rather than returning a shape the screen has to
 *  inspect. The status rides ON the error, because two of the refusals ARE distinctions
 *  the person reading this screen can act on: a slug already taken and a slug that is
 *  malformed both name one field to change, and both used to render the same "the action
 *  failed". A status only in the message is a string a rendering would have to parse. */
async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw Object.assign(new Error(String(response.status)), { status: response.status })
  }
  return (await response.json()) as T
}

export function makePlatformClient(fetcher: typeof ApiFetch): PlatformClient {
  return {
    listStudios: async () =>
      (await json<{ items: PlatformStudio[] }>(await fetcher('/api/v1/platform/studios'))).items,
    createStudio: async (body) =>
      json<PlatformStudio>(
        await fetcher('/api/v1/platform/studios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      ),
    inviteOwner: async (studioId, body) =>
      json<IssuedInvitation>(
        await fetcher(`/api/v1/platform/studios/${studioId}/invite-owner`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      ),
    suspend: async (studioId) =>
      json<PlatformStudio>(
        await fetcher(`/api/v1/platform/studios/${studioId}/suspend`, { method: 'POST' }),
      ),
    health: async () => json<OpsHealth>(await fetcher('/api/v1/platform/health')),
  }
}
