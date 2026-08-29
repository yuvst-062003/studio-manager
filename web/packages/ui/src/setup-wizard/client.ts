// The four M1 steps talk to endpoints M1.4 and M1.9 shipped. This file is the only place
// that knows their paths, so a step file has no fetch in it and a test can drive one with
// a plain object.
//
// `apiFetch` is not imported here: @studio/ui must not depend on @studio/core (core
// depends on ui's tokens, and the cycle would be real). The app passes its own fetcher in.
import type { SetupProgress, WizardStepId } from './types'
import type { SetupClient } from './SetupWizard'
import type { StudioClient, StudioDetails } from './StudioStep'
import { defaultSeason } from './GroupsStep'
import type { NamedRow, Slot, StructureClient } from './GroupsStep'
import type { StaffClient, StaffInvite } from './StaffStep'
import type { SetupSummary, StudentsClient } from './StudentsStep'

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${response.url}`)
  return (await response.json()) as T
}

export function makeSetupClient(fetcher: Fetcher): SetupClient {
  return {
    read: () => fetcher('/api/v1/setup').then(json<SetupProgress>),
    setStep: (stepId: WizardStepId, status: 'done' | 'skipped' | 'pending') =>
      fetcher(`/api/v1/setup/steps/${stepId}`, {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify({ status }),
      }).then(json<SetupProgress>),
    dismiss: () =>
      fetcher('/api/v1/setup/dismiss', { method: 'POST' }).then(json<SetupProgress>),
  }
}

export function makeStudioClient(fetcher: Fetcher): StudioClient {
  return {
    read: () => fetcher('/api/v1/studio').then(json<StudioDetails>),
    update: (fields) =>
      fetcher('/api/v1/studio', {
        method: 'PATCH',
        headers: JSON_HEADERS,
        body: JSON.stringify(fields),
      }).then(json<StudioDetails>),
    uploadLogo: (file: Blob) => {
      const body = new FormData()
      // No Content-Type header: the browser sets the multipart boundary, and setting it
      // by hand produces a body the server cannot parse.
      body.append('file', file, 'logo.png')
      return fetcher('/api/v1/studio/logo', { method: 'POST', body }).then(
        json<{ logo_url: string }>,
      )
    },
  }
}

type Listed<T> = { items: T[] }

export function makeStructureClient(fetcher: Fetcher): StructureClient {
  const list = (path: string) =>
    fetcher(path)
      .then(json<Listed<NamedRow>>)
      .then((body) => body.items ?? [])
  const create = (path: string, payload: Record<string, unknown>) =>
    fetcher(path, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(payload) }).then(
      json<NamedRow>,
    )

  return {
    listClasses: () => list('/api/v1/classes'),
    listGroups: () => list('/api/v1/groups'),
    listLocations: () => list('/api/v1/locations'),
    createClass: (name) => create('/api/v1/classes', { name }),
    createGroup: (classId, name) => create('/api/v1/groups', { class_id: classId, name }),
    createLocation: (name) => create('/api/v1/locations', { name }),
    ensureTrainingYear: async () => {
      const years = await fetcher('/api/v1/training-years')
        .then(json<Listed<{ id: string; status: string }>>)
        .then((body) => body.items ?? [])
        .catch(() => [])
      if (years.some((year) => year.status === 'active')) return

      const season = defaultSeason(new Date())
      // A draft may already exist from a previous visit to this step; reuse it rather than
      // colliding with `uq_training_year_studio_id_name`.
      const draft = years.find((year) => year.status === 'draft')
      const created: { id: string } =
        draft ??
        (await fetcher('/api/v1/training-years', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify(season),
        }).then(json<{ id: string }>))

      // Activating is the half that matters: `uq_training_year_one_active` makes "the
      // active year" a single row, and a draft is invisible to guardians by design.
      await fetcher(`/api/v1/training-years/${created.id}/activate`, { method: 'POST' })
    },
    readSchedule: (groupId) =>
      fetcher(`/api/v1/groups/${groupId}/schedule`)
        .then(json<{ rules: Slot[] }>)
        .then((body) => body.rules ?? [])
        // A group with no rules yet answers like a group with none: this step's job is to
        // create the first ones, and an unreadable schedule must not block that.
        .catch(() => []),
    putSchedule: (groupId, slots, effectiveFrom) =>
      fetcher(`/api/v1/groups/${groupId}/schedule`, {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({
          // Each rule carries the same start date as the set: §5.6 versions rules by date
          // and never edits one in place, and at setup there is no earlier version.
          rules: slots.map((slot) => ({ ...slot, effective_from: effectiveFrom })),
          effective_from: effectiveFrom,
          // `apply` defaults to FALSE on the server, which returns a preview and writes
          // nothing. During setup there is no existing year to impact, so a preview would
          // be a silent no-op that looks like a save.
          apply: true,
        }),
      }).then(async (response) => {
        // The status is carried, not swallowed: 404 here means "no active training year"
        // — the rules cannot be generated into sessions before a year exists, and no setup
        // step opens one. The step tells a manager that rather than "we could not save".
        if (!response.ok) throw new Error(String(response.status))
      }),
  }
}

export function makeStaffClient(fetcher: Fetcher): StaffClient {
  return {
    listGroups: () =>
      fetcher('/api/v1/groups')
        .then(json<Listed<NamedRow>>)
        .then((body) => body.items ?? []),
    listInvitations: () =>
      fetcher('/api/v1/invitations')
        .then(json<Listed<StaffInvite>>)
        .then((body) => body.items ?? [])
        // An endpoint that does not exist yet must not blank the step. M1.4 shipped the
        // invitation flow; listing pending invitations is not part of it.
        .catch(() => []),
    invite: (email, role, groupId) =>
      fetcher('/api/v1/invitations', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ email, intended_role: role, group_id: groupId }),
      }).then((response) => {
        if (!response.ok) throw new Error(String(response.status))
      }),
  }
}

export function makeStudentsClient(fetcher: Fetcher): StudentsClient {
  return {
    summarise: async (): Promise<SetupSummary> => {
      const [studio, classes, groups, locations] = await Promise.all([
        fetcher('/api/v1/studio').then(json<StudioDetails>),
        fetcher('/api/v1/classes').then(json<Listed<NamedRow>>),
        fetcher('/api/v1/groups').then(json<Listed<NamedRow>>),
        fetcher('/api/v1/locations').then(json<Listed<NamedRow>>),
      ])
      return {
        studioName: studio.name,
        parentLocales: studio.parent_locales,
        classCount: (classes.items ?? []).length,
        groupCount: (groups.items ?? []).length,
        locationCount: (locations.items ?? []).length,
        // M1.4 has no list-invitations endpoint, and inventing one for a summary line
        // would be a route built for a label. Zero until M3 needs the real list.
        invitedStaffCount: 0,
      }
    },
  }
}
