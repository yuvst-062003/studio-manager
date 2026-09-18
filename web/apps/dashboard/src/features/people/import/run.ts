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
// No second create path exists on the server, so nothing here can drift from the form. The
// server also sends the family's invitation email on create, exactly as it does for the
// form (decision 21) — this runner only READS what it said about that, per family.
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

/** What the server said about the family's invitation, read off the first member that
 *  was created — siblings match onto that guardian and mint nothing new.
 *  - `sent`: the email was handed to the SMTP server.
 *  - `not_needed`: the email matched an account that already exists; they sign in as usual.
 *  - `unconfigured`: this deployment cannot send mail at all (`SMTP_PASSWORD` unset).
 *  - `failed`: mail is configured and this one did not go — resend is the remedy.
 *  - `none`: no member of the family was created. */
export type InvitationOutcome = 'sent' | 'not_needed' | 'unconfigured' | 'failed' | 'none'

export type FamilyOutcome = { invitation: InvitationOutcome; studentId: string | null }

export type ImportResult = {
  rows: Map<string, RowOutcome>
  families: Map<string, FamilyOutcome>
}

type CreateBody = Parameters<DashboardPeopleClient['createStudent']>[0]

type CreateAnswer = {
  student?: { id?: string }
  invitation_token?: string | null
  invitation_url?: string | null
  invitation_email_configured?: boolean
  invitation_email_sent?: boolean
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
  if (answer.invitation_email_sent) return 'sent'
  if (!answer.invitation_token && !answer.invitation_url) return 'not_needed'
  if (answer.invitation_email_configured === false) return 'unconfigured'
  return 'failed'
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
