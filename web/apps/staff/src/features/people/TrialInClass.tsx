// Staff artboard 11b — שיעור ניסיון: הוספת חניך חדש תוך כדי שיעור.
//
// §5.4a ①: "A manager can also log a phone enquiry, producing the same rows." This is the
// same act from the mat: a child turned up, and the coach records it before the lesson
// starts rather than after it is forgotten.
//
// **Four fields, and §5.4a is emphatic about why**: "A full registration form — health
// declaration, consents, payment — is an enormous ask of someone whose entire intent is 'my
// kid wants to try judo', and every field is a place to abandon." On a mat, mid-lesson, that
// goes double.
//
// **This enrols nobody** (L6). It records an enquiry; the manager decides membership later.
// No group assignment beyond which lesson they are standing in, and no price.
import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Alert, Button, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { StaffPeopleClient } from './peopleClient'

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

const fieldStyle: CSSProperties = {
  // §6.2 — one-handed, on a mat, in bright light.
  minBlockSize: '44px',
}

export function TrialInClass({
  locale,
  client,
  groupId,
  sessionId,
  canGrantOverride = false,
  onLogged,
}: {
  locale: Locale
  client: StaffPeopleClient
  groupId: string
  sessionId?: string | null
  /** §5.4a — a second free trial is a MANAGER's deliberate act. A coach is told to ask. */
  canGrantOverride?: boolean
  onLogged?: () => void
}) {
  const [childFirst, setChildFirst] = useState('')
  const [childLast, setChildLast] = useState('')
  const [parentName, setParentName] = useState('')
  const [phone, setPhone] = useState('')
  const [sending, setSending] = useState(false)
  const [alreadyUsed, setAlreadyUsed] = useState(false)
  const [failed, setFailed] = useState(false)
  const [done, setDone] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setSending(true)
    setAlreadyUsed(false)
    setFailed(false)
    const [first = parentName, ...rest] = parentName.split(' ')
    client
      .logTrial({
        group_id: groupId,
        session_id: sessionId ?? null,
        child: { first_name: childFirst, last_name: childLast },
        guardian: { first_name: first, last_name: rest.join(' '), phone },
      })
      .then((response) => {
        if (response.ok) {
          setDone(true)
          onLogged?.()
        } else if (response.status === 409) setAlreadyUsed(true)
        else setFailed(true)
      })
      .catch(() => setFailed(true))
      .finally(() => setSending(false))
  }

  if (done) {
    return (
      <p data-testid="trial-logged">{t(locale, 'people.trial.one')}</p>
    )
  }

  return (
    <form onSubmit={submit} style={formStyle} aria-labelledby="trial-in-class" data-testid="trial-in-class">
      <h2 id="trial-in-class">{t(locale, 'people.trial.addDuringClass')}</h2>

      <TextField
        label={t(locale, 'people.student.firstName')}
        value={childFirst}
        style={fieldStyle}
        onChange={(event) => setChildFirst(event.target.value)}
        required
      />
      <TextField
        label={t(locale, 'people.student.lastName')}
        value={childLast}
        style={fieldStyle}
        onChange={(event) => setChildLast(event.target.value)}
        required
      />
      <TextField
        label={t(locale, 'people.guardian.one')}
        value={parentName}
        style={fieldStyle}
        onChange={(event) => setParentName(event.target.value)}
        required
      />
      <TextField
        label={t(locale, 'people.student.phone')}
        type="tel"
        value={phone}
        style={fieldStyle}
        onChange={(event) => setPhone(event.target.value)}
        required
      />

      {alreadyUsed ? (
        <span data-testid="trial-already-used">
          <Alert tone="pending" iconLabel={t(locale, 'people.trial.override')}>
            {/* §5.4a — the override is a manager's deliberate, countable act. A coach on the
                mat is told who can grant it, not handed the power. */}
            {canGrantOverride
              ? t(locale, 'people.trial.overrideHint')
              : t(locale, 'people.landing.alreadyUsed')}
          </Alert>
        </span>
      ) : null}

      {failed ? (
        <span data-testid="trial-error">
          <Alert tone="danger" iconLabel={t(locale, 'people.error.generic')}>
            {t(locale, 'people.error.generic')}
          </Alert>
        </span>
      ) : null}

      <Button
        type="submit"
        disabled={!childFirst || !childLast || !parentName || !phone || sending}
        data-testid="trial-submit"
      >
        {t(locale, 'people.trial.addDuringClass')}
      </Button>
    </form>
  )
}
