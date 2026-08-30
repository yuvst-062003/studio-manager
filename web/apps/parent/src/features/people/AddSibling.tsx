// Parent artboard 12g — הוספת ילד נוסף.
//
// **This door enrols now** (owner decision, 2026-08-30). It used to file a
// `registration_request` a manager approved, on L6's "conversion is always a human
// decision" — while §5.4b's onboarding link, sent to the whole club in one WhatsApp
// message, already created active priced children with no manager at all. A gate on the
// second door while the first stood open protected nothing; it only meant a parent who
// forgot a child at signup waited on the office for something they could have done
// themselves an hour earlier.
//
// So the copy promises a PLACE, not a review, and the groups are a choice rather than a
// preference — the price follows weekly volume across them, which is why the picker is
// multi-select and why at least one is required. `is_invite_only` is enforced server-side
// in `OnboardingService.add_child`; the Girls Team is not in this list and cannot be
// reached by posting its id either.
//
// L9 — "the child is added to this same account". No household is created, and the subtitle
// says exactly that: one account, more children.
import { useEffect, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Alert, Button, Card, Checkbox, TextField } from '@studio/ui'
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
  const [groupIds, setGroupIds] = useState<string[]>([])
  // 12g wants group CARDS with schedule and age band, not a bare dropdown (P6). The
  // list is the same public projection §5.4a's landing shows — the parent's own
  // studio, resolved through /me/studio's slug. No capacity anywhere: the 2026-08-27
  // decision cut group caps from the product.
  const [publicGroups, setPublicGroups] = useState<
    { id: string; name: string; description: string | null; age_min: number | null; age_max: number | null; training_weekdays: number[] }[]
  >([])

  // 2026-08-30 — "parents can't pick a program". The list CAN come back empty (a failed
  // read, or a club that published no groups), and the screen used to render the legend
  // over NOTHING, silently. `groupsState` is what lets it say so and offer a retry.
  const [groupsState, setGroupsState] = useState<'loading' | 'ready' | 'empty'>('loading')
  const [fetchAttempt, setFetchAttempt] = useState(0)

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
      .then((items) => {
        if (!live) return
        setPublicGroups(items)
        setGroupsState(items.length > 0 ? 'ready' : 'empty')
      })
      .catch(() => live && setGroupsState('empty'))
    return () => {
      live = false
    }
  }, [groups.length, fetchAttempt])
  const [sending, setSending] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [failed, setFailed] = useState(false)
  // 422 `duplicate_student` — this child is already on the roster (2026-08-30). Held apart
  // from `failed` because it is not a failure the parent should retry: the useful answer is
  // the child they already have, not the same form again. `studentId` and `displayName` are
  // present only when the server may name them — a caller who is not that child's guardian
  // is told the same thing without the name, because naming them would disclose that a
  // child of that name trains here (§11.1).
  const [duplicate, setDuplicate] = useState<{
    studentId: string | null
    displayName: string | null
  } | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setSending(true)
    setFailed(false)
    setDuplicate(null)
    client
      .requestSibling({
        first_name: firstName,
        last_name: lastName,
        birthdate: birthdate || null,
        group_ids: groupIds,
      })
      .then(async (response) => {
        if (response.ok) {
          setSubmitted(true)
          return
        }
        if (response.status === 422) {
          const body = (await response.json().catch(() => null)) as {
            detail?: { code?: string; student_id?: string; display_name?: string }
          } | null
          if (body?.detail?.code === 'duplicate_student') {
            setDuplicate({
              studentId: body.detail.student_id ?? null,
              displayName: body.detail.display_name ?? null,
            })
            return
          }
        }
        // The typed values stay. A parent who already hesitated should not have to start
        // again because the network did.
        setFailed(true)
      })
      .catch(() => setFailed(true))
      .finally(() => setSending(false))
  }

  if (submitted) {
    return (
      <section aria-labelledby="sibling-done" data-testid="sibling-submitted">
        <h2 id="sibling-done">{t(locale, 'people.sibling.title')}</h2>
        {/* A PLACE, not a review (2026-08-30). The child is enrolled, priced and
            charged already; what is left is the health form and the payment method,
            which is what the copy names. */}
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
      {/* A CHOICE now, and more than one: the price is derived from how many times a week
          the child trains across every group they join. */}
      <fieldset data-testid="sibling-group">
        <legend>{t(locale, 'people.landing.chooseGroup')}</legend>
        {/* Said, never blank (2026-08-30): an empty list under a "choose a group" legend
            read as the picker being broken. The form still submits without a group —
            the manager places the child — and that is said too. */}
        {groups.length === 0 && groupsState === 'empty' ? (
          <div data-testid="sibling-no-groups" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', alignItems: 'start' }}>
            <p style={{ margin: 0 }}>{t(locale, 'people.sibling.noGroups')}</p>
            <Button
              variant="ghost"
              data-testid="sibling-retry-groups"
              onClick={() => {
                setGroupsState('loading')
                setFetchAttempt((n) => n + 1)
              }}
            >
              {t(locale, 'people.sibling.retryGroups')}
            </Button>
          </div>
        ) : null}
        {(groups.length > 0
          ? groups.map((group) => ({ ...group, description: null, age_min: null, age_max: null, training_weekdays: [] as number[] }))
          : publicGroups
        ).map((group) => (
          <Card key={group.id}>
            <Checkbox
              checked={groupIds.includes(group.id)}
              data-testid={`sibling-group-${group.id}`}
              label={group.name}
              onChange={(event) =>
                setGroupIds((current) =>
                  event.target.checked
                    ? [...current, group.id]
                    : current.filter((id) => id !== group.id),
                )
              }
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

      {duplicate ? (
        <span data-testid="sibling-duplicate">
          {/* `pending` and not `danger`: the parent did nothing wrong and nothing is broken
              — the child is already here. */}
          <Alert tone="pending" iconLabel={t(locale, 'people.sibling.duplicate')}>
            {duplicate.displayName
              ? t(locale, 'people.sibling.duplicateNamed').replace(
                  '{name}',
                  duplicate.displayName,
                )
              : t(locale, 'people.sibling.duplicate')}
          </Alert>
          {duplicate.studentId ? (
            <a href={`#/student/${duplicate.studentId}`} data-testid="sibling-duplicate-open">
              {t(locale, 'people.sibling.duplicateOpen')}
            </a>
          ) : null}
        </span>
      ) : null}

      {failed ? (
        <span data-testid="sibling-error">
          <Alert tone="danger" iconLabel={t(locale, 'people.error.generic')}>
            {t(locale, 'people.error.generic')}
          </Alert>
        </span>
      ) : null}

      {/* At least one group, because a child with none has no weekly volume and therefore
          no price — the server refuses it, and a button that offers the refusal is worse
          than one that waits. */}
      <Button
        type="submit"
        disabled={!firstName || !lastName || groupIds.length === 0 || sending}
        data-testid="sibling-submit"
      >
        {t(locale, 'people.sibling.submit')}
      </Button>
    </form>
  )
}
