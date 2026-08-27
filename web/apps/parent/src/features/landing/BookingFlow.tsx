// Parent artboard 13a, steps 1-5 — §5.4a's booking flow, in its stated order:
//
//   1 התחברות     sign-in FIRST, before any child detail is typed
//   2 פרטי הילדים  name · birthdate · group, [ + הוסף ילד נוסף ]
//   3 הצהרת בריאות the SHORT trial form, per child
//   4 בחירת שיעור  the next N sessions of the chosen group
//   5 אישור        handled by BookingConfirmed
//
// **Step 1 is not negotiable.** §5.4a: "The parent authenticates **before** entering child
// details." Three consequences the spec spells out — no invitation email and no waiting, so
// the funnel has one less place to leak; the profile exists the moment they finish; and
// somebody who abandons after step 1 leaves a Person with no students, which the app renders
// as a resume prompt. Rendering the child form first and asking for sign-in at submit would
// throw away everything they typed.
//
// L6 — nothing in this flow enrols anybody. The group choice picks which trial lesson to
// attend; the manager decides membership later (§5.4).
import { useEffect, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Alert, Button, Checkbox, SlotChips, TextField } from '@studio/ui'
import { formatDateInStudioZone, formatTimeInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { BookingConfirmed } from './BookingConfirmed'
import { bookingErrorFor } from './landingClient'
import type {
  BookingError,
  BookingResult,
  LandingClient,
  PublicGroup,
  TrialSlot,
} from './landingClient'

type Child = { first_name: string; last_name: string; birthdate: string; group_id: string }
type Step = 'sign-in' | 'children' | 'health' | 'slot'

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  alignItems: 'end',
}

const blankChild = (): Child => ({ first_name: '', last_name: '', birthdate: '', group_id: '' })

/**
 * §5.4a step 2 — "groups filtered by the child's age where age_min/age_max are set".
 *
 * Out-of-range groups are returned, not hidden: a parent who cannot see a group cannot tell
 * whether it exists at all, and `landing.tooYoung` says why it is unavailable.
 */
export function groupFitsAge(group: PublicGroup, birthdate: string, today: Date): boolean {
  if (!birthdate) return true
  if (group.age_min == null && group.age_max == null) return true
  const born = new Date(birthdate)
  if (Number.isNaN(born.getTime())) return true
  let age = today.getFullYear() - born.getFullYear()
  const beforeBirthday =
    today.getMonth() < born.getMonth() ||
    (today.getMonth() === born.getMonth() && today.getDate() < born.getDate())
  if (beforeBirthday) age -= 1
  if (group.age_min != null && age < group.age_min) return false
  if (group.age_max != null && age > group.age_max) return false
  return true
}

export function BookingFlow({
  slug,
  locale,
  client,
  groups,
  signedIn = false,
  today = new Date(),
}: {
  slug: string
  locale: Locale
  client: LandingClient
  groups: PublicGroup[]
  signedIn?: boolean
  today?: Date
}) {
  const [step, setStep] = useState<Step>(signedIn ? 'children' : 'sign-in')
  const [children, setChildren] = useState<Child[]>([blankChild()])
  const [confirmed, setConfirmed] = useState<boolean[]>([false])
  // Keyed by group, because §5.4a step 4 offers 'the next N upcoming sessions of EACH
  // chosen group'. Two siblings in one group share one fetch; two siblings in different
  // groups get one each.
  const [slotsByGroup, setSlotsByGroup] = useState<Record<string, TrialSlot[]>>({})
  const [sessionIds, setSessionIds] = useState<string[]>([''])
  const [error, setError] = useState<BookingError | null>(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<BookingResult | null>(null)

  // Sorted and joined so the effect re-runs when the SET of groups changes, not on every
  // render that happens to rebuild the array.
  const groupKey = [...new Set(children.map((child) => child.group_id).filter(Boolean))]
    .sort()
    .join(',')

  useEffect(() => {
    if (step !== 'slot' || !groupKey) return
    let live = true
    Promise.all(
      groupKey.split(',').map((groupId) =>
        client.trialSlots(groupId).then((body) => [groupId, body.items] as const),
      ),
    )
      .then((pairs) => live && setSlotsByGroup(Object.fromEntries(pairs)))
      .catch(() => live && setError('schedule_unavailable'))
    return () => {
      live = false
    }
  }, [client, groupKey, step])

  if (result) return <BookingConfirmed result={result} locale={locale} />

  // -- step 1: sign in, before anything is typed ------------------------------
  if (step === 'sign-in') {
    // `return_path` brings them back to this exact club after the provider round trip, so
    // the flow resumes instead of dropping them on a generic home screen.
    const returnPath = encodeURIComponent(`/t/${slug}`)
    return (
      <section aria-labelledby="booking-signin" data-testid="booking-sign-in">
        <h3 id="booking-signin">{t(locale, 'people.landing.step.signIn')}</h3>
        <p>{t(locale, 'people.landing.signInHint')}</p>
        <a
          href={`/api/v1/auth/google/start?app=parent&return_path=${returnPath}`}
          data-testid="booking-sign-in-link"
        >
          {t(locale, 'people.landing.signInFirst')}
        </a>
      </section>
    )
  }

  const setChild = (index: number, patch: Partial<Child>) =>
    setChildren((current) =>
      current.map((child, i) => (i === index ? { ...child, ...patch } : child)),
    )

  // -- step 2: the children ---------------------------------------------------
  if (step === 'children') {
    const complete = children.every(
      (child) => child.first_name && child.last_name && child.group_id,
    )
    return (
      <section aria-labelledby="booking-children" data-testid="booking-children">
        <h3 id="booking-children">{t(locale, 'people.landing.step.children')}</h3>
        <ul style={listStyle}>
          {children.map((child, index) => (
            <li key={index} style={rowStyle}>
              <TextField
                label={t(locale, 'people.student.firstName')}
                value={child.first_name}
                onChange={(event) => setChild(index, { first_name: event.target.value })}
              />
              <TextField
                label={t(locale, 'people.student.lastName')}
                value={child.last_name}
                onChange={(event) => setChild(index, { last_name: event.target.value })}
              />
              <TextField
                label={t(locale, 'people.student.birthdate')}
                type="date"
                value={child.birthdate}
                onChange={(event) => setChild(index, { birthdate: event.target.value })}
              />
              <label>
                {t(locale, 'people.landing.chooseGroup')}
                <select
                  value={child.group_id}
                  onChange={(event) => setChild(index, { group_id: event.target.value })}
                  data-testid={`booking-group-${index}`}
                >
                  <option value="">—</option>
                  {groups.map((group) => {
                    const fits = groupFitsAge(group, child.birthdate, today)
                    return (
                      <option key={group.id} value={group.id} disabled={!fits}>
                        {/* Shown but disabled, with the reason. A group a parent cannot
                            see is one they cannot ask about. */}
                        {group.name}
                        {fits ? '' : ` — ${t(locale, 'people.landing.tooYoung')}`}
                      </option>
                    )
                  })}
                </select>
              </label>
              {children.length > 1 ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setChildren((current) => current.filter((_, i) => i !== index))
                    setConfirmed((current) => current.filter((_, i) => i !== index))
                    setSessionIds((current) => current.filter((_, i) => i !== index))
                  }}
                  data-testid={`booking-remove-child-${index}`}
                >
                  {t(locale, 'people.landing.removeChild')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          onClick={() => {
            setChildren((current) => [...current, blankChild()])
            setConfirmed((current) => [...current, false])
            setSessionIds((current) => [...current, ''])
          }}
          data-testid="booking-add-child"
        >
          {t(locale, 'people.landing.addChild')}
        </Button>
        <Button
          disabled={!complete}
          onClick={() => setStep('health')}
          data-testid="booking-to-health"
        >
          {t(locale, 'people.landing.next')}
        </Button>
      </section>
    )
  }

  // -- step 3: the short trial declaration ------------------------------------
  if (step === 'health') {
    const allConfirmed = confirmed.every(Boolean)
    return (
      <section aria-labelledby="booking-health" data-testid="booking-health">
        <h3 id="booking-health">{t(locale, 'people.trialHealth.title')}</h3>
        <p>{t(locale, 'people.trialHealth.subtitle')}</p>
        <ul style={listStyle}>
          {children.map((child, index) => (
            <li key={index}>
              <bdi>{`${child.first_name} ${child.last_name}`}</bdi>
              <Checkbox
                label={t(locale, 'people.trialHealth.confirm')}
                checked={confirmed[index] ?? false}
                onChange={(event) =>
                  setConfirmed((current) =>
                    current.map((flag, i) => (i === index ? event.target.checked : flag)),
                  )
                }
              />
            </li>
          ))}
        </ul>
        {!allConfirmed ? <p>{t(locale, 'people.trialHealth.required')}</p> : null}
        <Button variant="ghost" onClick={() => setStep('children')}>
          {t(locale, 'people.landing.back')}
        </Button>
        <Button
          disabled={!allConfirmed}
          onClick={() => setStep('slot')}
          data-testid="booking-to-slot"
        >
          {t(locale, 'people.landing.next')}
        </Button>
      </section>
    )
  }

  // -- step 4: the session picker ---------------------------------------------
  // §5.4a step 4 is 'one pick per child'. A child whose group has no bookable session at
  // all is not a reason to block the others -- the manager can place them by hand, and
  // the backend accepts a booking with no session id.
  const everyChildHasASlot = children.every(
    (child, index) =>
      sessionIds[index] || (slotsByGroup[child.group_id] ?? []).every((slot) => !slot.is_bookable),
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setSending(true)
    setError(null)
    client
      .book({
        children: children.map((child, index) => ({
          first_name: child.first_name,
          last_name: child.last_name,
          birthdate: child.birthdate || null,
          // §5.4a steps 2 and 4 are both per child. Sending one group and one session for
          // the whole booking put every sibling in the eldest's group and slot.
          group_id: child.group_id,
          session_id: sessionIds[index] || null,
        })),
        // One per child, same order — the server validates the pairing.
        trial_health_declarations: children.map(() => ({ confirmed: true })),
      })
      .then(async (response) => {
        if (response.ok) {
          setResult((await response.json()) as BookingResult)
          return
        }
        const body = (await response.json().catch(() => ({}))) as {
          detail?: { code?: string }
        }
        setError(bookingErrorFor(response.status, body.detail?.code))
      })
      .catch(() => setError('generic'))
      .finally(() => setSending(false))
  }

  return (
    <form onSubmit={submit} aria-labelledby="booking-slot" data-testid="booking-slot">
      <h3 id="booking-slot">{t(locale, 'people.landing.chooseSlot')}</h3>
      {children.map((child, index) => {
        const forChild = slotsByGroup[child.group_id] ?? []
        // L2's SlotChips: a wrapping single-select chip group, one per child so the
        // second child's pick cannot clear the first's. §5.4 — a cancelled slot is
        // greyed, never hidden, and the chip label says why.
        const chips =
          forChild.length === 0 ? (
            <p data-testid={`booking-no-slots-${index}`}>{t(locale, 'people.landing.noSlots')}</p>
          ) : (
            <span data-testid={`booking-slot-child-${index}`}>
              <SlotChips
                legend={`${t(locale, 'people.landing.chooseSlot')} — ${child.first_name} ${child.last_name}`}
                options={forChild.map((slot) => ({
                  id: slot.session_id,
                  label: `${formatDateInStudioZone(slot.starts_at, locale)} ${formatTimeInStudioZone(slot.starts_at, locale)}${slot.is_bookable ? '' : ` — ${t(locale, 'people.landing.slotUnavailable')}`}`,
                  disabled: !slot.is_bookable,
                }))}
                value={sessionIds[index] || null}
                onValueChange={(id) =>
                  setSessionIds((current) =>
                    current.map((existing, i) => (i === index ? id : existing)),
                  )
                }
              />
            </span>
          )
        // Decision 3 (2026-08-27): ONE-STEP chips when there is exactly one child — no
        // fieldset naming anybody, the chips are simply the picker. The per-child frame
        // appears with the sibling, which is when a name starts meaning something.
        if (children.length === 1) return <span key={index}>{chips}</span>
        return (
          <fieldset key={index}>
            <legend>
              <bdi>{`${child.first_name} ${child.last_name}`}</bdi>
            </legend>
            {chips}
          </fieldset>
        )
      })}

      {error ? (
        <span data-testid="booking-error">
        <Alert tone="danger" iconLabel={t(locale, 'people.error.generic')}>
          {t(
            locale,
            error === 'already_used'
              ? 'people.landing.alreadyUsed'
              : error === 'rate_limited'
                ? 'people.landing.rateLimited'
                : error === 'schedule_unavailable'
                  ? 'people.error.scheduleUnavailable'
                  : 'people.landing.error',
          )}
        </Alert>
        </span>
      ) : null}

      <Button variant="ghost" onClick={() => setStep('health')}>
        {t(locale, 'people.landing.back')}
      </Button>
      <Button type="submit" disabled={!everyChildHasASlot || sending} data-testid="booking-submit">
        {sending ? t(locale, 'people.landing.submitting') : t(locale, 'people.landing.submit')}
      </Button>
    </form>
  )
}
