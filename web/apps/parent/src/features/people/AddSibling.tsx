// Parent artboard 12g — הוספת ילד נוסף.
//
// §5.4(c): "An existing guardian taps `+ הוסף ילד`, fills the child form and picks a group.
// This creates a `registration_request` with `source = 'parent_app'` and
// `matched_person_id` set — **a request, not an enrollment.** The manager approves it,
// consistent with (b): conversion is always a human decision."
//
// So the copy promises **review**, never a place. L6 is the rule; `sibling.pendingHint` is
// how the screen keeps it. The group field is labelled a preference, because §5.4 puts the
// real choice on the manager's decision.
//
// L9 — "the child is added to this same account". No household is created, and the subtitle
// says exactly that: one account, more children.
import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Alert, Button, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { PeopleClient } from './peopleClient'

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  maxInlineSize: '30rem',
  marginInline: 'auto',
  inlineSize: '100%',
}

export type SiblingGroupOption = { id: string; name: string }

export function AddSibling({
  locale,
  client,
  groups = [],
}: {
  locale: Locale
  client: PeopleClient
  groups?: SiblingGroupOption[]
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [groupId, setGroupId] = useState('')
  const [sending, setSending] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [failed, setFailed] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setSending(true)
    setFailed(false)
    client
      .requestSibling({
        first_name: firstName,
        last_name: lastName,
        birthdate: birthdate || null,
        preferred_group_id: groupId || null,
      })
      .then((response) => {
        if (response.ok) setSubmitted(true)
        // The typed values stay. A parent who already hesitated should not have to start
        // again because the network did.
        else setFailed(true)
      })
      .catch(() => setFailed(true))
      .finally(() => setSending(false))
  }

  if (submitted) {
    return (
      <section aria-labelledby="sibling-done" data-testid="sibling-submitted">
        <h2 id="sibling-done">{t(locale, 'people.sibling.title')}</h2>
        {/* L6 — the promise is REVIEW, never a place. */}
        <p data-testid="sibling-pending-hint">{t(locale, 'people.sibling.pendingHint')}</p>
      </section>
    )
  }

  return (
    <form onSubmit={submit} style={formStyle} aria-labelledby="sibling-title" data-testid="add-sibling">
      <h2 id="sibling-title">{t(locale, 'people.sibling.title')}</h2>
      {/* L9 — same account, no household entity anywhere behind it. */}
      <p data-testid="sibling-subtitle">{t(locale, 'people.sibling.subtitle')}</p>

      <TextField
        label={t(locale, 'people.student.firstName')}
        value={firstName}
        onChange={(event) => setFirstName(event.target.value)}
        required
      />
      <TextField
        label={t(locale, 'people.student.lastName')}
        value={lastName}
        onChange={(event) => setLastName(event.target.value)}
        required
      />
      <TextField
        label={t(locale, 'people.student.birthdate')}
        type="date"
        value={birthdate}
        onChange={(event) => setBirthdate(event.target.value)}
      />
      <label>
        {/* A PREFERENCE, not a decision — §5.4 puts the group on the manager's approval. */}
        {t(locale, 'people.landing.chooseGroup')}
        <select
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
          data-testid="sibling-group"
        >
          <option value="">—</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>

      {failed ? (
        <span data-testid="sibling-error">
          <Alert tone="danger" iconLabel={t(locale, 'people.error.generic')}>
            {t(locale, 'people.error.generic')}
          </Alert>
        </span>
      ) : null}

      <Button type="submit" disabled={!firstName || !lastName || sending} data-testid="sibling-submit">
        {t(locale, 'people.sibling.submit')}
      </Button>
    </form>
  )
}
