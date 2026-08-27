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
import { useEffect, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Alert, Button, Card, Radio, TextField } from '@studio/ui'
import { apiFetch } from '@studio/core'
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
  // 12g wants group CARDS with schedule and age band, not a bare dropdown (P6). The
  // list is the same public projection §5.4a's landing shows — the parent's own
  // studio, resolved through /me/studio's slug. No capacity anywhere: the 2026-08-27
  // decision cut group caps from the product.
  const [publicGroups, setPublicGroups] = useState<
    { id: string; name: string; description: string | null; age_min: number | null; age_max: number | null; training_weekdays: number[] }[]
  >([])

  useEffect(() => {
    if (groups.length > 0) return
    let live = true
    void apiFetch('/api/v1/me/studio')
      .then(async (r) => (r.ok ? ((await r.json()) as { slug: string }).slug : null))
      .then(async (slug) => {
        if (!slug) return []
        const response = await apiFetch(`/api/v1/public/studios/${slug}/groups`)
        return response.ok
          ? ((await response.json()) as { items: typeof publicGroups }).items
          : []
      })
      .then((items) => live && setPublicGroups(items))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [groups.length])
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
      {/* A PREFERENCE, not a decision — §5.4 puts the group on the manager's approval. */}
      <fieldset data-testid="sibling-group">
        <legend>{t(locale, 'people.landing.chooseGroup')}</legend>
        {(groups.length > 0
          ? groups.map((group) => ({ ...group, description: null, age_min: null, age_max: null, training_weekdays: [] as number[] }))
          : publicGroups
        ).map((group) => (
          <Card key={group.id}>
            <Radio
              checked={groupId === group.id}
              data-testid={`sibling-group-${group.id}`}
              label={group.name}
              name="sibling-group"
              onChange={() => setGroupId(group.id)}
              value={group.id}
            />
            {group.training_weekdays.length > 0 ? (
              <p style={{ margin: 0, fontSize: 'var(--text-caption)', color: 'var(--text-muted)' }}>
                {group.training_weekdays
                  .map((weekday) => t(locale, `schedule.weekday.${weekday}`))
                  .join(' · ')}
              </p>
            ) : null}
            {group.age_min !== null && group.age_max !== null ? (
              <p style={{ margin: 0, fontSize: 'var(--text-caption)', color: 'var(--text-muted)' }}>
                {t(locale, 'people.sibling.ages')
                  .replace('{min}', String(group.age_min))
                  .replace('{max}', String(group.age_max))}
              </p>
            ) : null}
          </Card>
        ))}
      </fieldset>

      {/* The three-step explainer: nothing is charged yet, and the screen says so. */}
      <section aria-labelledby="sibling-steps">
        <h2 id="sibling-steps" style={{ fontSize: 'var(--text-title)' }}>
          {t(locale, 'people.sibling.steps.title')}
        </h2>
        <ol data-testid="sibling-steps">
          <li>{t(locale, 'people.sibling.steps.approve')}</li>
          <li>{t(locale, 'people.sibling.steps.declaration')}</li>
          <li>{t(locale, 'people.sibling.steps.billing')}</li>
        </ol>
      </section>

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
