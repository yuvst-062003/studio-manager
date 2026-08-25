// Dashboard artboard 3c — הוספת חניך: "שיוך למשק בית קיים במקום חשבון חדש".
//
// The artboard says "משק בית". **There is no household** (L9, §4.3): "'My children' is
// simply SELECT student_id FROM guardian WHERE person_id = me." So the screen attaches the
// child to an existing **parent**, and the copy says parent — the artboard's word describes
// the intent, not an entity anybody should build.
//
// **The client never sends a person_id it guessed.** L7 — matching is on a VERIFIED email or
// phone, and a client cannot verify anything. It submits the address; the server decides
// whether that is somebody it already has, which is why `guardian_matched` and not a client
// hint is what ends up in the audit trail.
//
// **No price field** (L2). `price_plan` is W4's table; the conversion screen stores an id,
// and the prices screen is M6's.
import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Alert, Button, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { DashboardPeopleClient } from './peopleClient'

type Child = { first_name: string; last_name: string; birthdate: string }

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  maxInlineSize: '40rem',
}

const blank = (): Child => ({ first_name: '', last_name: '', birthdate: '' })

export function AddStudentScreen({
  locale,
  client,
  onCreated,
}: {
  locale: Locale
  client: DashboardPeopleClient
  onCreated?: () => void
}) {
  const [parentFirst, setParentFirst] = useState('')
  const [parentLast, setParentLast] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [children, setChildren] = useState<Child[]>([blank()])
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [invitationToken, setInvitationToken] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSending(true)
    setFailed(false)
    try {
      let token: string | null = null
      // §5.4a's worked example: "יעל submits one form with דנה and יוסי. The manager
      // approves once." Each child is its own request; the SERVER matches them onto the
      // same parent by the verified address, which is what stops a second Person appearing.
      for (const child of children) {
        const response = await client.createStudent({
          first_name: child.first_name,
          last_name: child.last_name,
          birthdate: child.birthdate || null,
          guardian: {
            first_name: parentFirst,
            last_name: parentLast,
            email: email || null,
            phone: phone || null,
            relation: 'parent',
          },
        })
        if (!response.ok) {
          setFailed(true)
          return
        }
        const body = (await response.json()) as { invitation_token?: string | null }
        token = token ?? body.invitation_token ?? null
      }
      setInvitationToken(token)
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
          // at the desk; only its hash is stored, so it cannot be shown again.
          <p data-testid="add-student-invitation">{invitationToken}</p>
        ) : (
          // L7 — a matched parent already has a login. §5.4a: 'No second invitation, no
          // second account, no second login.'
          <p data-testid="add-student-matched">{t(locale, 'people.request.matchedPerson')}</p>
        )}
      </section>
    )
  }

  return (
    <form onSubmit={submit} style={formStyle} aria-labelledby="add-student" data-testid="add-student">
      <h1 id="add-student">{t(locale, 'people.student.add')}</h1>

      <fieldset>
        <legend>{t(locale, 'people.guardian.one')}</legend>
        {/* The artboard's "משק בית" is a PARENT. L9 — no household entity exists. */}
        <p data-testid="add-student-parent-hint">{t(locale, 'people.request.matchedHint')}</p>
        <TextField
          label={t(locale, 'people.student.firstName')}
          value={parentFirst}
          onChange={(event) => setParentFirst(event.target.value)}
          required
        />
        <TextField
          label={t(locale, 'people.student.lastName')}
          value={parentLast}
          onChange={(event) => setParentLast(event.target.value)}
          required
        />
        <TextField
          label={t(locale, 'people.student.email')}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <TextField
          label={t(locale, 'people.student.phone')}
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </fieldset>

      {children.map((child, index) => (
        <fieldset key={index} data-testid={`add-student-child-${index}`}>
          <legend>{t(locale, 'people.student.one')}</legend>
          <TextField
            label={t(locale, 'people.student.firstName')}
            value={child.first_name}
            onChange={(event) =>
              setChildren((current) =>
                current.map((c, i) =>
                  i === index ? { ...c, first_name: event.target.value } : c,
                ),
              )
            }
            required
          />
          <TextField
            label={t(locale, 'people.student.lastName')}
            value={child.last_name}
            onChange={(event) =>
              setChildren((current) =>
                current.map((c, i) => (i === index ? { ...c, last_name: event.target.value } : c)),
              )
            }
            required
          />
          <TextField
            label={t(locale, 'people.student.birthdate')}
            type="date"
            value={child.birthdate}
            onChange={(event) =>
              setChildren((current) =>
                current.map((c, i) => (i === index ? { ...c, birthdate: event.target.value } : c)),
              )
            }
          />
        </fieldset>
      ))}

      <Button
        variant="secondary"
        onClick={() => setChildren((current) => [...current, blank()])}
        data-testid="add-student-add-child"
      >
        {t(locale, 'people.landing.addChild')}
      </Button>

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
  )
}
