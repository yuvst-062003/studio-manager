// The button half of the import. Deliberately the SAME three calls the by-hand screen
// makes, in the same order and for the same reasons (`AddStudentScreen.tsx`'s `create`):
//
//   1. `POST /students` — without the group, because creating with one enrols the child and
//      `convert` would then refuse; the conversion is what sets the price and records the
//      prepaid method, so it has to be the call that names the group.
//   2. `convert` — only when a group was chosen. Dated today, never a date from the file: a
//      conversion raises a prorated first-month charge on its start date, and a veteran's
//      2023 would raise two years of debt.
//   3. the belt — only when one was chosen and the conversion landed.
//
// Sequential on purpose: rows of one family share a parent, and the server's match-by-email
// needs the first sibling's guardian committed before the second arrives. Parallel writes
// would race that match into duplicate people.
//
// No second create path exists on the server, so nothing here can drift from the form.
//
// **Nothing is emailed.** Every create carries `send_invitation: false` (owner, 2026-09-23):
// a club is loaded from the office's own spreadsheet weeks before its parents are told the
// app exists, and a hundred invitations landing that afternoon is the one outcome nobody
// wanted. The token is still minted and `invitation_url` still comes back, so a family can
// be handed their link across the desk today and the whole club can be invited later
// through `/invitation/resend` — which re-issues the token and refreshes its expiry, so the
// weeks in between cost nothing.
import type { DashboardPeopleClient } from '../peopleClient'
import type { Draft, Family } from './review'
import { isAdult } from './review'

export type ImportClient = Pick<DashboardPeopleClient, 'createStudent' | 'convert' | 'awardBelt'>

export type RowState = 'sending' | 'added' | 'failed'

export type RowOutcome = {
  studentId: string | null
  /** What did not land, if anything. A student may exist while the conversion failed —
   *  saying so beats a green tick over a half-written row. */
  problem: 'create' | 'convert' | 'belt' | null
}

/** What became of the family's invitation, read off the first member that was created —
 *  siblings match onto that guardian and mint nothing new.
 *  - `held`: the token is minted and waiting, and nothing was sent. The normal outcome of
 *    an import, and the reason this type no longer has `sent`, `failed` or `unconfigured`:
 *    the runner never asks for a send, so none of the three can happen here.
 *  - `not_needed`: the guardian matched an account that already exists; they sign in as
 *    usual and there is nothing to invite them to.
 *  - `none`: no member of the family was created. */
export type InvitationOutcome = 'held' | 'not_needed' | 'none'

export type FamilyOutcome = { invitation: InvitationOutcome; studentId: string | null }

export type ImportResult = {
  rows: Map<string, RowOutcome>
  families: Map<string, FamilyOutcome>
}

type CreateBody = Parameters<DashboardPeopleClient['createStudent']>[0]

/** Only the parts this runner reads. The server also answers with
 *  `invitation_email_configured` and `invitation_email_sent`, and both are omitted on
 *  purpose: nothing here asks for a send, so neither can say anything but "no". */
type CreateAnswer = {
  student?: { id?: string }
  invitation_token?: string | null
  invitation_url?: string | null
}

const blankToUndefined = (value: string) => (value.trim() === '' ? undefined : value.trim())

/** `StudentCreate.last_name` requires at least one character; a lone space is what the
 *  by-hand screen sends for a name typed without one, and it is used here for the same
 *  reason — never a second name the manager did not write. */
const lastNameOrSpace = (value: string) => value.trim() || ' '

export function createBodyFor(draft: Draft, family: Family): CreateBody {
  const first_name = draft.first_name.trim()
  const last_name = lastNameOrSpace(draft.last_name)
  const email = blankToUndefined(draft.email) ?? null
  const phone = blankToUndefined(draft.phone) ?? null
  return {
    first_name,
    last_name,
    birthdate: /^\d{4}-\d{2}-\d{2}$/.test(draft.birthdate) ? draft.birthdate : null,
    // The whole point of the import. See the note at the top of this file.
    send_invitation: false,
    guardian: isAdult(draft)
      ? // 18 and over is self-guarding: the trainee IS the guardian and the email is
        // theirs. Their own name is reused so an adult never becomes two Person rows.
        { first_name, last_name, email, phone, relation: 'self' }
      : {
          first_name: blankToUndefined(draft.parent_first),
          last_name: blankToUndefined(draft.parent_last),
          email: email ?? blankToUndefined(family.email) ?? null,
          phone,
          relation: 'parent',
        },
  }
}

function invitationFrom(answer: CreateAnswer): InvitationOutcome {
  // No token and no link means the server matched an existing, signed-in guardian and
  // minted nothing — §5.4a's `match_person`. Anything else is a credential sitting ready.
  return !answer.invitation_token && !answer.invitation_url ? 'not_needed' : 'held'
}

export async function runImport(
  families: readonly Family[],
  client: ImportClient,
  opts: { today: string; beltNote: string; onRow?: (draftId: string, state: RowState) => void },
): Promise<ImportResult> {
  const rows = new Map<string, RowOutcome>()
  const familyOutcomes = new Map<string, FamilyOutcome>()

  for (const family of families) {
    let familyOutcome: FamilyOutcome = { invitation: 'none', studentId: null }
    for (const draft of family.members) {
      opts.onRow?.(draft.id, 'sending')
      const outcome: RowOutcome = { studentId: null, problem: null }
      rows.set(draft.id, outcome)
      try {
        const created = await client.createStudent(createBodyFor(draft, family))
        if (!created.ok) {
          outcome.problem = 'create'
          opts.onRow?.(draft.id, 'failed')
          continue
        }
        const answer = (await created.json()) as CreateAnswer
        outcome.studentId = answer.student?.id ?? null
        if (familyOutcome.studentId === null && outcome.studentId) {
          familyOutcome = { invitation: invitationFrom(answer), studentId: outcome.studentId }
        }

        if (outcome.studentId && draft.group_id) {
          const converted = await client.convert(outcome.studentId, {
            group_id: draft.group_id,
            started_on: opts.today,
            price_plan_id: draft.plan_id || null,
            payment_received: draft.payment || null,
          })
          if (!converted.ok) outcome.problem = 'convert'
        }

        if (outcome.studentId && draft.belt_rank_id && outcome.problem === null) {
          const awarded = await client.awardBelt(outcome.studentId, {
            belt_rank_id: draft.belt_rank_id,
            awarded_on: opts.today,
            note: opts.beltNote,
          })
          if (!awarded.ok) outcome.problem = 'belt'
        }
      } catch {
        if (outcome.studentId === null) outcome.problem = 'create'
        else if (outcome.problem === null) outcome.problem = draft.group_id ? 'convert' : 'create'
      }
      opts.onRow?.(draft.id, outcome.problem === 'create' ? 'failed' : 'added')
    }
    familyOutcomes.set(family.key, familyOutcome)
  }
  return { rows, families: familyOutcomes }
}
