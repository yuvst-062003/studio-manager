// Entrance A — the destination §5.4a ④'s "איך היה?" never had.
//
// The follow-up worker has asked a trial family how their lesson went on days 1, 3 and 7
// since M3, with no link and no action, and `TrialHome` has shown the same question with
// nothing to press. After 21 days the same worker marks the student `lost`. So the product
// asked a family whether they enjoyed themselves, three times, and offered them no way to
// answer — the only route in was a manager opening the student card by hand.
//
// **It converts the child who already exists.** `POST /me/students/{id}/join`, not
// `POST /me/students`: reusing the add-a-child door would create a SECOND record for a
// child already on the roster, one `trial` and one `active`.
//
// **The parent picks groups; the server picks the price.** There is no price on this screen
// and no field for one — how much follows the weekly volume across the groups they tick
// (§5.10), and how to PAY is the next step in the sequence (§6.1's payment setup). The
// picker opens with the group they trialled already ticked, and every other public group
// available to add: the owner's decision is that the parent chooses, and a manager telling
// them afterwards to add a second group is a conversation the app has no business
// preventing.
//
// `is_invite_only` and `is_active` are enforced server-side in
// `EnrollmentService.self_service_weekdays`; the Girls Team is not in this list and cannot
// be reached by posting its id either.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, Card, Checkbox } from '@studio/ui'
import { apiFetch } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { PeopleClient, StudentSummary } from './peopleClient'

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '30rem',
  marginInline: 'auto',
  inlineSize: '100%',
}

const captionStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--text-caption)',
  color: 'var(--text-muted)',
}

export type JoinGroupOption = {
  id: string
  name: string
  training_weekdays: number[]
  age_min?: number | null
  age_max?: number | null
}

export function JoinTheClub({
  locale,
  client,
  student,
  trialledGroupId = null,
  groups,
  onJoined,
}: {
  locale: Locale
  client: PeopleClient
  /** The child being converted. §6.3's reduced home is only shown when every child is on a
   *  trial, so there is one join in flight at a time and the screen names whose it is. */
  student: StudentSummary
  /** Pre-ticked. `MyTrialBookingOut.group_id` — the group they have actually been to. */
  trialledGroupId?: string | null
  /** Injected in tests; fetched from the club's public list otherwise. */
  groups?: readonly JoinGroupOption[]
  onJoined?: () => void
}) {
  const [fetched, setFetched] = useState<readonly JoinGroupOption[]>([])
  // Three states, not a boolean. The list CAN come back empty — a failed read, or a club
  // that published no groups — and a legend over nothing reads as the picker being broken.
  const [state, setState] = useState<'loading' | 'ready' | 'empty'>(
    groups ? 'ready' : 'loading',
  )
  const [attempt, setAttempt] = useState(0)
  const [chosen, setChosen] = useState<string[]>(trialledGroupId ? [trialledGroupId] : [])
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (groups) return
    let live = true
    void apiFetch('/api/v1/me/studio')
      .then(async (r) => (r.ok ? ((await r.json()) as { slug: string }).slug : null))
      .then(async (slug) => {
        if (!slug) return [] as JoinGroupOption[]
        const response = await apiFetch(`/api/v1/public/studios/${slug}/groups`)
        return response.ok
          ? ((await response.json()) as { items: JoinGroupOption[] }).items
          : ([] as JoinGroupOption[])
      })
      .then((items) => {
        if (!live) return
        setFetched(items)
        setState(items.length > 0 ? 'ready' : 'empty')
      })
      .catch(() => live && setState('empty'))
    return () => {
      live = false
    }
  }, [groups, attempt])

  const options = groups ?? fetched

  const submit = () => {
    setSending(true)
    setFailed(false)
    client
      .joinTheClub(student.id, { group_ids: chosen })
      .then((response) => {
        // No success screen. The finishing line takes over: once the child is `active`,
        // §5.5's gate holds the full declaration and §6.1's payment step follows it, and a
        // "you have joined" card between them would be a step that asks for nothing.
        if (response.ok) onJoined?.()
        else setFailed(true)
      })
      .catch(() => setFailed(true))
      .finally(() => setSending(false))
  }

  return (
    <section style={pageStyle} aria-labelledby="join-club-title" data-testid="join-the-club">
      <h1 id="join-club-title">{t(locale, 'people.joinClub.title')}</h1>
      <p data-testid="join-club-subtitle">{t(locale, 'people.joinClub.subtitle')}</p>
      <p style={captionStyle} data-testid="join-club-for">
        {t(locale, 'people.joinClub.forWhom')}{' '}
        <bdi>{`${student.first_name} ${student.last_name}`}</bdi>
      </p>

      <fieldset data-testid="join-club-groups">
        <legend>{t(locale, 'people.joinClub.chooseGroups')}</legend>
        {state === 'empty' ? (
          <div data-testid="join-club-no-groups" style={pageStyle}>
            <p style={{ margin: 0 }}>{t(locale, 'people.joinClub.noGroups')}</p>
            <Button
              variant="ghost"
              data-testid="join-club-retry"
              onClick={() => {
                setState('loading')
                setAttempt((n) => n + 1)
              }}
            >
              {t(locale, 'people.joinClub.retryGroups')}
            </Button>
          </div>
        ) : null}
        {options.map((group) => (
          <Card key={group.id}>
            <Checkbox
              checked={chosen.includes(group.id)}
              data-testid={`join-club-group-${group.id}`}
              label={group.name}
              onChange={(event) =>
                setChosen((current) =>
                  event.target.checked
                    ? [...current, group.id]
                    : current.filter((id) => id !== group.id),
                )
              }
              value={group.id}
            />
            {group.id === trialledGroupId ? (
              <p style={captionStyle} data-testid="join-club-trialled">
                {t(locale, 'people.joinClub.trialledHere')}
              </p>
            ) : null}
            {group.training_weekdays.length > 0 ? (
              <p style={captionStyle}>
                {group.training_weekdays
                  .map((weekday) => t(locale, `schedule.weekday.${weekday}`))
                  .join(' · ')}
              </p>
            ) : null}
          </Card>
        ))}
      </fieldset>

      {/* The price is derived, and the screen says so rather than showing a number it does
          not have: the plan is chosen server-side from the weekly volume across the ticks
          above, and it lands on the payments screen. */}
      <p style={captionStyle} data-testid="join-club-price-hint">
        {t(locale, 'people.joinClub.priceHint')}
      </p>

      <section aria-labelledby="join-club-steps">
        <h2 id="join-club-steps" style={{ fontSize: 'var(--text-title)' }}>
          {t(locale, 'people.joinClub.steps.title')}
        </h2>
        <ol data-testid="join-club-steps">
          <li>{t(locale, 'people.joinClub.steps.groups')}</li>
          <li>{t(locale, 'people.joinClub.steps.declaration')}</li>
          <li>{t(locale, 'people.joinClub.steps.payment')}</li>
        </ol>
      </section>

      {failed ? (
        <span data-testid="join-club-error">
          <Alert tone="danger" iconLabel={t(locale, 'people.joinClub.error')}>
            {t(locale, 'people.joinClub.error')}
          </Alert>
        </span>
      ) : null}

      {/* At least one group, because a child with none has no weekly volume and therefore
          no price — the server refuses it, and a button that offers the refusal is worse
          than one that waits. */}
      <Button
        type="button"
        onClick={submit}
        disabled={chosen.length === 0 || sending}
        data-testid="join-club-submit"
      >
        {t(locale, 'people.joinClub.submit')}
      </Button>
      <a href="#/" data-testid="join-club-back">
        {t(locale, 'people.joinClub.back')}
      </a>
    </section>
  )
}
