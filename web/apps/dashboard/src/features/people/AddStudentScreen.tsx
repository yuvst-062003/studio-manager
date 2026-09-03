// Dashboard artboard 3c — הוספת חניך.
//
// **Student-first, three fields** (2026-09-03 onboarding doors spec, decision 20):
// full name · 18 ומעלה? · guardian email. Nothing else. It used to be parent-first —
// parent's own first/last name and phone, then a repeatable list of children each with a
// group and a weekday picker — but "Door C is Door B with one row pre-filled" (spec §3):
// the manager types almost nothing, and the invited parent fills the rest in the wizard.
// A group the manager guessed here is a group the parent then has to correct there.
//
// The artboard's "משק בית" is still a PARENT, not a household — L9, §4.3: "'my children'
// is simply SELECT student_id FROM guardian WHERE person_id = me." No entity for it exists.
//
// **The client never sends a person_id it guessed.** L7 — matching is on a VERIFIED email
// or phone, and a client cannot verify anything. It submits the guardian's email; the
// server decides whether that is somebody it already has.
//
// **No price field** (L2). `price_plan` is W4's table, behind its own screen.
//
// **No group and no weekday picker** (decision 20). Those, and the multi-child list, left
// with the parent-first form. `WeekdayPicker`/`attendsWeekdaysFor` (./WeekdayPicker) are
// untouched — nothing else in this app imports them, but deleting a module is not this
// screen's decision to make alone.
import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Alert, Button, Checkbox, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { CopyButton } from './SharingCards'
import { ImportStudentsPanel } from './ImportStudentsPanel'
import type { DashboardPeopleClient } from './peopleClient'

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  maxInlineSize: '40rem',
}

/** Splits a typed full name on the FIRST whitespace — everything after it is the last
 *  name, so a middle or additional surname stays together ("יעל בת כהן" → "יעל" ·
 *  "בת כהן"). A single word is legal (a mononym, or simply a name typed without a
 *  space): `StudentCreate.last_name` requires at least one character, so a lone space is
 *  used rather than inventing a second name the manager never typed or refusing the
 *  submission outright. */
function splitFullName(fullName: string): { first_name: string; last_name: string } {
  const trimmed = fullName.trim()
  const boundary = trimmed.search(/\s/)
  if (boundary === -1) {
    return { first_name: trimmed, last_name: ' ' }
  }
  return {
    first_name: trimmed.slice(0, boundary),
    last_name: trimmed.slice(boundary + 1).trim() || ' ',
  }
}

export function AddStudentScreen({
  locale,
  client,
  onCreated,
}: {
  locale: Locale
  client: DashboardPeopleClient
  onCreated?: () => void
}) {
  const [fullName, setFullName] = useState('')
  // Decision 12 — the 18+ question is gone from the parent's own wizard, because the
  // wizard always asks for a birthdate and derives age from it. THIS form has no
  // birthdate field, so it has nothing to derive age from, and the question survives
  // here for exactly that reason. Do not "tidy" it away to match the wizard.
  const [isAdult, setIsAdult] = useState(false)
  const [guardianEmail, setGuardianEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [invitationToken, setInvitationToken] = useState<string | null>(null)
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null)
  // Decision 21's visible half. Optional — and left `undefined` rather than defaulted to
  // `false` — because the response body only carries these two fields once the parallel
  // "invitation email" piece lands; until then the client must render nothing about email
  // at all rather than claim a definite failure it does not know happened.
  const [invitationEmailConfigured, setInvitationEmailConfigured] = useState<
    boolean | undefined
  >(undefined)
  const [invitationEmailSent, setInvitationEmailSent] = useState<boolean | undefined>(undefined)
  const [done, setDone] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSending(true)
    setFailed(false)
    try {
      const { first_name, last_name } = splitFullName(fullName)
      const response = await client.createStudent({
        first_name,
        last_name,
        birthdate: null,
        guardian: isAdult
          ? {
              // Decision 20 — "18 ומעלה? means self-guarding: the student IS the
              // guardian and the email is theirs." Reuses the student's own split name
              // rather than asking the manager to type it twice.
              first_name,
              last_name,
              email: guardianEmail || null,
              relation: 'self',
            }
          : {
              // §6's API table — `GuardianCreate` accepts an email with no names, for
              // exactly this form. The manager never types a guardian's name; the parent
              // gives it when they accept the invitation.
              email: guardianEmail || null,
              relation: 'parent',
            },
      })
      if (!response.ok) {
        setFailed(true)
        return
      }
      const body = (await response.json()) as {
        invitation_token?: string | null
        invitation_url?: string | null
        //: Decision 21 — the contract two booleans wide. Both optional: the backend
        //: piece that fills them in is a parallel lane, so a response with neither is
        //: an older/undeployed backend, not a failure to report.
        invitation_email_configured?: boolean
        invitation_email_sent?: boolean
      }
      setInvitationToken(body.invitation_token ?? null)
      setInvitationUrl(body.invitation_url ?? null)
      setInvitationEmailConfigured(body.invitation_email_configured)
      setInvitationEmailSent(body.invitation_email_sent)
      setDone(true)
      onCreated?.()
    } catch {
      setFailed(true)
    } finally {
      setSending(false)
    }
  }

  if (done) {
    return (
      <section aria-labelledby="add-done" data-testid="add-student-done">
        <h2 id="add-done">{t(locale, 'people.student.saved')}</h2>
        {invitationToken ? (
          // §5.4(a) — 'sends the parent an invitation'. Shown once, for a parent standing
          // at the desk; only its hash is stored, so it cannot be shown again. The LINK
          // (2026-08-30) is what the manager actually sends — the bare token stays as the
          // fallback for an environment whose parent host is still PENDING.
          <div data-testid="add-student-invitation" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <p style={{ margin: 0 }}>{t(locale, 'people.invite.linkHint')}</p>
            <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <span data-testid="add-student-invite-url" style={{ overflowWrap: 'anywhere' }}>
                <bdi dir="ltr">{invitationUrl ?? invitationToken}</bdi>
              </span>
              <CopyButton locale={locale} value={invitationUrl ?? invitationToken} />
            </p>
            {/* Decision 21 — the email half must be visible, not silent, either way. */}
            {invitationEmailSent ? (
              <p data-testid="add-student-invite-email-sent">
                {t(locale, 'people.invite.emailSent')}
              </p>
            ) : invitationEmailConfigured === false ? (
              <span data-testid="add-student-invite-email-unavailable">
                <Alert tone="pending" iconLabel={t(locale, 'people.invite.emailNotConfigured')}>
                  {t(locale, 'people.invite.emailNotConfigured')}
                </Alert>
              </span>
            ) : invitationEmailConfigured === true ? (
              <p data-testid="add-student-invite-email-not-sent">
                {t(locale, 'people.invite.emailNotSent')}
              </p>
            ) : null}
          </div>
        ) : (
          // L7 — a matched parent already has a login. §5.4a: 'No second invitation, no
          // second account, no second login.'
          <p data-testid="add-student-matched">{t(locale, 'people.request.matchedPerson')}</p>
        )}
      </section>
    )
  }

  return (
    <>
    <form onSubmit={submit} style={formStyle} aria-labelledby="add-student" data-testid="add-student">
      <h1 id="add-student">{t(locale, 'people.student.add')}</h1>

      <TextField
        label={t(locale, 'people.student.fullName')}
        value={fullName}
        onChange={(event) => setFullName(event.target.value)}
        data-testid="add-student-full-name"
        required
      />

      <Checkbox
        label={t(locale, 'people.student.isAdult')}
        checked={isAdult}
        onChange={(event) => setIsAdult(event.target.checked)}
        data-testid="add-student-is-adult"
      />
      <p data-testid="add-student-is-adult-hint" style={{ margin: 0 }}>
        {t(locale, 'people.student.isAdultHint')}
      </p>

      <TextField
        label={t(locale, 'people.student.guardianEmail')}
        type="email"
        value={guardianEmail}
        onChange={(event) => setGuardianEmail(event.target.value)}
        data-testid="add-student-guardian-email"
      />

      {failed ? (
        <span data-testid="add-student-error">
          <Alert tone="danger" iconLabel={t(locale, 'people.error.generic')}>
            {t(locale, 'people.error.generic')}
          </Alert>
        </span>
      ) : null}

      <Button type="submit" disabled={sending} data-testid="add-student-submit">
        {t(locale, 'people.student.add')}
      </Button>
    </form>
    {/* Owner request 2026-08-30 — 'can import a file'. The same screen, because it is the
        same question ("get these families in") answered at a different volume. */}
    <ImportStudentsPanel locale={locale} client={client} onImported={onCreated} />
    </>
  )
}
