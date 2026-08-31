// Parent artboard 13a, steps 1-5 — §5.4a's booking flow, in its stated order:
//
//   1 הפרטים שלכם  who is booking — name and a way to reach them
//   2 פרטי הילדים  name · birthdate · group, [ + הוסף ילד נוסף ]
//   3 הצהרת בריאות the SHORT trial form, per child
//   4 בחירת שיעור  the next N sessions of the chosen group
//   5 אישור        handled by BookingConfirmed
//
// **Step 1 was a sign-in wall until 2026-08-31** (owner's decision). §5.4a's "the parent
// authenticates BEFORE entering child details" was written to stop somebody typing a whole
// form and losing it at a login prompt — a real problem — but it paid for that by charging
// a Google account at the only self-service door in the product, and a parent who did not
// want one could not book a first lesson at all. Every other club takes a name, an email
// and a phone number.
//
// What the ordering protected is kept: who-you-are is still asked first, so nothing typed
// is ever thrown away. What changed is that answering it is a form rather than an account.
// Sign-in survives on this step as an OFFER — a family that already has an account should
// reach their own record instead of creating a second lead.
//
// The address is the load-bearing field. It is how the club replies, and §6.1 step 3
// attaches this booking to whoever later signs in with it verified — so the children are
// already there when the family opens the app. The server treats a typed address as
// unverified and makes a lead, never an account (see `_resolve_parent`).
//
// L6 — nothing in this flow enrols anybody. The group choice picks which trial lesson to
// attend; the manager decides membership later (§5.4).
import { useEffect, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Alert, Button, Checkbox, SelectField, SlotChips, TextField } from '@studio/ui'
import { apiUrl, formatDateInStudioZone, formatTimeInStudioZone } from '@studio/core'
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
type Step = 'you' | 'children' | 'health' | 'slot'

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

/**
 * One child, in a frame of their own.
 *
 * The fields used to be a bare wrapping flex row, which put the group select shoulder to
 * shoulder with "המשך" — and the first child's group arrives PRE-FILLED from the landing
 * page, so that button is live from the moment two names are typed. Reaching for the next
 * field and landing on "continue" was the result, reported as the form "jumping to the
 * next screen" (2026-08-31). A frame per child and a separated action row is the fix:
 * nothing that advances the flow sits in the run of things you are still filling in.
 */
const childCardStyle: CSSProperties = {
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

/** Two columns where there is room for two, one where there is not — without a media
 *  query, which an inline style cannot carry. */
const fieldGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
  gap: 'var(--space-3)',
  alignItems: 'end',
}

/** The group belongs to the CHILD, so it sits inside their frame — on its own row, under
 *  their name, where it reads as part of describing them. */
const childGroupStyle: CSSProperties = {
  borderBlockStart: 'var(--border-width-hairline) solid var(--border)',
  paddingBlockStart: 'var(--space-3)',
}

/** Everything that leaves this step, kept away from everything you type into it. */
const actionsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
  alignItems: 'center',
  marginBlockStart: 'var(--space-5)',
  paddingBlockStart: 'var(--space-4)',
  borderBlockStart: 'var(--border-width-hairline) solid var(--border)',
}

/** The forward action goes last in the reading order and pushes to the far end, so "back"
 *  and "add another child" are never where the eye expects "continue". */
const actionsSpacerStyle: CSSProperties = { marginInlineStart: 'auto' }

const childNameStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--text-label)',
  fontWeight: 'var(--weight-semibold)',
}

/** The line under a name on the confirmation step: what is actually being confirmed. */
const summaryLineStyle: CSSProperties = {
  margin: 0,
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
}

/** Tells the parent's card apart from a child's, which otherwise look identical. */
const summaryCaptionStyle: CSSProperties = {
  margin: 0,
  color: 'var(--text-muted)',
  fontSize: 'var(--text-micro)',
}

/**
 * `2017-03-15` → `15/03/2017`.
 *
 * Deliberately NOT `formatDateInStudioZone`: a birthdate is a calendar date, not an
 * instant. Passing it through a zone conversion parses it as UTC midnight, which in a
 * negative-offset zone is still the previous day — the one-day-off bug `formatMonthLabel`
 * documents in datetime.ts. There is no instant here to convert, so nothing is converted;
 * the parts are simply reordered.
 */
function asDayMonthYear(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return year && month && day ? `${day}/${month}/${year}` : isoDate
}

const blankChild = (groupId = ''): Child => ({
  first_name: '',
  last_name: '',
  birthdate: '',
  group_id: groupId,
})

const STEPS = ['you', 'children', 'health', 'slot'] as const

const STEP_KEY: Record<Step, string> = {
  you: 'you',
  children: 'children',
  health: 'health',
  slot: 'slot',
}

/** Enough of an address to be worth sending to. The server holds the real rule
 *  (`EMAIL_PATTERN`); this only exists so the reader is told before they press. */
const LOOKS_LIKE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const progressStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--space-2)',
}

const progressItemStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-1)',
  textAlign: 'center',
  fontSize: 'var(--text-micro)',
  color: 'var(--text-muted)',
}

const progressDotStyle: CSSProperties = {
  inlineSize: '26px',
  blockSize: '26px',
  borderRadius: 'var(--radius-circle)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 'var(--text-label)',
  border: 'var(--border-width-hairline) solid var(--border-strong)',
  background: 'var(--surface)',
  color: 'var(--text-muted)',
}

/** A passed step, as the control it now is. Inherits the rail's own type and colour so it
 *  reads as the same thing it was a moment ago — a real button, not a link pretending. */
const stepBackButtonStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-1)',
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
}

/** The four §5.4a steps as a progress rail, the current one marked for AT and eye alike. */
function StepProgress({
  locale,
  current,
  onGo,
  firstStep,
}: {
  locale: Locale
  current: Step
  /** Jump back to a step already passed. */
  onGo: (step: Step) => void
  /** Where this booking begins — `children` for a parent who signed in, so their rail
   *  never offers a details step they were right to skip. */
  firstStep: Step
}) {
  const currentIndex = STEPS.indexOf(current)
  const firstIndex = STEPS.indexOf(firstStep)
  return (
    <ol style={progressStyle} data-testid="booking-progress">
      {STEPS.map((step, index) => {
        const active = step === current
        // Backwards only. A step already answered can be reopened; one still ahead cannot,
        // because reaching it means passing the checks in between — the group a child
        // belongs to, a declaration per child — and a rail that skipped them would be a
        // way around them rather than a way through.
        const canGoBack = index < currentIndex && index >= firstIndex
        const label = t(locale, `people.landing.step.${STEP_KEY[step]}`)
        const dot = (
          <span
            style={
              active
                ? { ...progressDotStyle, background: 'var(--fg)', color: 'var(--on-fg)', border: 'none' }
                : progressDotStyle
            }
            aria-hidden="true"
          >
            {index + 1}
          </span>
        )
        return (
          <li
            key={step}
            aria-current={active ? 'step' : undefined}
            style={
              active
                ? { ...progressItemStyle, color: 'var(--fg)', fontWeight: 'var(--weight-semibold)' }
                : progressItemStyle
            }
          >
            {canGoBack ? (
              <button
                type="button"
                onClick={() => onGo(step)}
                style={stepBackButtonStyle}
                data-testid={`booking-step-${STEP_KEY[step]}`}
              >
                {dot}
                {label}
              </button>
            ) : (
              <>
                {dot}
                {label}
              </>
            )}
          </li>
        )
      })}
    </ol>
  )
}

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
  address = null,
  phone = null,
  initialGroupId = null,
}: {
  slug: string
  locale: Locale
  client: LandingClient
  groups: PublicGroup[]
  signedIn?: boolean
  today?: Date
  /** 13b's when-line address and change-the-time WhatsApp — from the landing payload. */
  address?: string | null
  phone?: string | null
  /** Redesign 2026-08-29 — the group the landing picker chose; pre-fills the first child. */
  initialGroupId?: string | null
}) {
  // A signed-in parent has no details to give — theirs came from the provider — so their
  // booking starts at the children and `you` is not a step they can go back to.
  const firstStep: Step = signedIn ? 'children' : 'you'
  const [step, setStep] = useState<Step>(firstStep)
  // Who is booking, when nobody signed in. A signed-in parent never sees this step and
  // never sends it: the server ignores a typed address in favour of the verified one.
  const [guardian, setGuardian] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
  })
  const [children, setChildren] = useState<Child[]>([blankChild(initialGroupId ?? '')])
  const [confirmed, setConfirmed] = useState<boolean[]>([false])
  // Keyed by group, because §5.4a step 4 offers 'the next N upcoming sessions of EACH
  // chosen group'. Two siblings in one group share one fetch; two siblings in different
  // groups get one each.
  const [slotsByGroup, setSlotsByGroup] = useState<Record<string, TrialSlot[]>>({})
  const [sessionIds, setSessionIds] = useState<string[]>([''])
  const [error, setError] = useState<BookingError | null>(null)
  // P8 — the slots read can fail on a phone network; retrying is a real re-fetch.
  const [slotsAttempt, setSlotsAttempt] = useState(0)
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
  }, [client, groupKey, step, slotsAttempt])

  if (result) {
    return <BookingConfirmed result={result} locale={locale} address={address} phone={phone} />
  }

  // -- step 1: who is booking -------------------------------------------------
  // This step used to be a sign-in wall (owner's decision 2026-08-31 removed it): a Google
  // account stood in front of the only self-service door in the product, and a parent who
  // did not want one could not book a first lesson at all. Every other club takes a name
  // and a way to reach you, so this one does too.
  //
  // The address is not decoration. It is how the club replies, and it is how §6.1 step 3
  // finds this booking if the family signs in later — "verified email hit → attach to the
  // matched Person" — so the children are already there when they open the app.
  if (step === 'you') {
    const complete =
      guardian.first_name.trim().length > 0 && LOOKS_LIKE_EMAIL.test(guardian.email.trim())
    // The provider round trip returns to this exact club, carrying the picked group so the
    // choice survives it (PublicLanding reads `?book=`).
    const returnPath = encodeURIComponent(
      `/t/${slug}${initialGroupId ? `?book=${initialGroupId}` : ''}`,
    )
    return (
      <section aria-labelledby="booking-you" data-testid="booking-you">
        <StepProgress locale={locale} current={step} onGo={setStep} firstStep={firstStep} />
        <h3 id="booking-you">{t(locale, 'people.landing.step.you')}</h3>
        <p>{t(locale, 'people.landing.youHint')}</p>
        <div style={fieldGridStyle}>
          <TextField
            label={t(locale, 'people.student.firstName')}
            value={guardian.first_name}
            onChange={(event) => setGuardian({ ...guardian, first_name: event.target.value })}
            data-testid="booking-you-first-name"
          />
          <TextField
            label={t(locale, 'people.student.lastName')}
            value={guardian.last_name}
            onChange={(event) => setGuardian({ ...guardian, last_name: event.target.value })}
            data-testid="booking-you-last-name"
          />
          <TextField
            label={t(locale, 'people.student.email')}
            type="email"
            value={guardian.email}
            onChange={(event) => setGuardian({ ...guardian, email: event.target.value })}
            data-testid="booking-you-email"
          />
          <TextField
            label={t(locale, 'people.student.phone')}
            type="tel"
            value={guardian.phone}
            onChange={(event) => setGuardian({ ...guardian, phone: event.target.value })}
            data-testid="booking-you-phone"
          />
        </div>
        <div style={actionsStyle}>
          <span style={actionsSpacerStyle}>
            <Button
              disabled={!complete}
              onClick={() => setStep('children')}
              data-testid="booking-to-children"
            >
              {t(locale, 'people.landing.next')}
            </Button>
          </span>
        </div>
        {/* Kept, as an offer rather than a gate. A family that already has an account
            should reach their own record instead of creating a second lead — and this is
            the fast path for them. Through `apiUrl` because it is a TOP-LEVEL NAVIGATION:
            a relative path resolves against the APP's host, which answers with the SPA
            shell and silently reloads the page (2026-08-31). */}
        <p>
          <a
            href={apiUrl(`/api/v1/auth/google/start?app=parent&return_path=${returnPath}`)}
            data-testid="booking-sign-in-link"
          >
            {t(locale, 'people.landing.signInInstead')}
          </a>
        </p>
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
        <StepProgress locale={locale} current={step} onGo={setStep} firstStep={firstStep} />
        <h3 id="booking-children">{t(locale, 'people.landing.step.children')}</h3>
        <ul style={listStyle}>
          {children.map((child, index) => (
            <li key={index} style={childCardStyle} data-testid={`booking-child-${index}`}>
              <div style={fieldGridStyle}>
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
              </div>
              {/* The group, under the child it belongs to and on its own row. It is per
                  child because siblings are often not in the same one — that is what the
                  age filter below is for — and it reads as part of describing this child
                  rather than as a setting for the whole booking.

                  `SelectField`, not a bare `<select>` in a bare `<label>`: this one sits
                  beside `TextField`s and would otherwise render at the user agent's own
                  size, the precise mismatch that primitive was extracted to end. */}
              <div style={childGroupStyle}>
                <SelectField
                  label={t(locale, 'people.landing.chooseGroup')}
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
                </SelectField>
              </div>
              {children.length > 1 ? (
                <div>
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
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <div style={actionsStyle}>
          {/* Step 2 had no way back at all — the only step that did not (2026-08-31).
              Hidden for a signed-in parent, whose booking starts here: a "back" to a
              details step they never saw would be a dead end. */}
          {firstStep !== 'children' ? (
            <Button variant="ghost" onClick={() => setStep('you')} data-testid="booking-to-you">
              {t(locale, 'people.landing.back')}
            </Button>
          ) : null}
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
          <span style={actionsSpacerStyle}>
            <Button
              disabled={!complete}
              onClick={() => setStep('health')}
              data-testid="booking-to-health"
            >
              {t(locale, 'people.landing.next')}
            </Button>
          </span>
        </div>
      </section>
    )
  }

  // -- step 3: the short trial declaration ------------------------------------
  if (step === 'health') {
    const allConfirmed = confirmed.every(Boolean)
    return (
      <section aria-labelledby="booking-health" data-testid="booking-health">
        <StepProgress locale={locale} current={step} onGo={setStep} firstStep={firstStep} />
        <h3 id="booking-health">{t(locale, 'people.trialHealth.title')}</h3>
        <p>{t(locale, 'people.trialHealth.subtitle')}</p>
        {/* "אני מאשר/ת שהפרטים נכונים" over a name and nothing else asks the reader to
            confirm details the screen never showed them (2026-08-31). Everything the
            booking is about to send is written out here — who is booking, and for each
            child their birthdate and the group they are going into — so the tick is a
            statement about something rather than a formality. */}
        <ul style={listStyle}>
          {/* Only when they typed it. A signed-in parent's name and address came from the
              provider, are not editable in this flow, and are not theirs to correct here. */}
          {!signedIn && guardian.first_name.trim() ? (
            <li style={childCardStyle} data-testid="booking-health-guardian">
              <p style={summaryCaptionStyle}>{t(locale, 'people.guardian.one')}</p>
              <p style={childNameStyle}>
                <bdi>{`${guardian.first_name} ${guardian.last_name}`.trim()}</bdi>
              </p>
              <p style={summaryLineStyle}>
                <bdi>
                  {[guardian.email.trim(), guardian.phone.trim()].filter(Boolean).join(' · ')}
                </bdi>
              </p>
            </li>
          ) : null}
          {children.map((child, index) => {
            const group = groups.find((row) => row.id === child.group_id)
            const details = [
              child.birthdate
                ? `${t(locale, 'people.student.birthdate')}: ${asDayMonthYear(child.birthdate)}`
                : null,
              group ? `${t(locale, 'people.student.group')}: ${group.name}` : null,
            ].filter(Boolean)
            return (
              <li key={index} style={childCardStyle} data-testid={`booking-health-${index}`}>
                <p style={childNameStyle}>
                  <bdi>{`${child.first_name} ${child.last_name}`.trim()}</bdi>
                </p>
                {details.length > 0 ? (
                  <p style={summaryLineStyle} data-testid={`booking-health-details-${index}`}>
                    <bdi>{details.join(' · ')}</bdi>
                  </p>
                ) : null}
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
            )
          })}
        </ul>
        {!allConfirmed ? <p>{t(locale, 'people.trialHealth.required')}</p> : null}
        <div style={actionsStyle}>
          <Button variant="ghost" onClick={() => setStep('children')}>
            {t(locale, 'people.landing.back')}
          </Button>
          <span style={actionsSpacerStyle}>
            <Button
              disabled={!allConfirmed}
              onClick={() => setStep('slot')}
              data-testid="booking-to-slot"
            >
              {t(locale, 'people.landing.next')}
            </Button>
          </span>
        </div>
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
        // Only when nobody signed in. A session's verified address wins on the server
        // regardless, so sending this alongside one would be noise at best.
        ...(signedIn
          ? {}
          : {
              guardian: {
                first_name: guardian.first_name.trim(),
                last_name: guardian.last_name.trim(),
                email: guardian.email.trim(),
                phone: guardian.phone.trim() || null,
              },
            }),
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
      <StepProgress locale={locale} current="slot" onGo={setStep} firstStep={firstStep} />
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
        {/* P8 — the slots READ failing is recoverable in place; the submit errors above
            are answered by pressing submit again. */}
        {error === 'schedule_unavailable' ? (
          <Button
            variant="secondary"
            data-testid="booking-retry-slots"
            onClick={() => {
              setError(null)
              setSlotsAttempt((n) => n + 1)
            }}
          >
            {t(locale, 'common.loadFailed.retry')}
          </Button>
        ) : null}
        </span>
      ) : null}

      <div style={actionsStyle}>
        <Button variant="ghost" onClick={() => setStep('health')}>
          {t(locale, 'people.landing.back')}
        </Button>
        <span style={actionsSpacerStyle}>
          <Button
            type="submit"
            disabled={!everyChildHasASlot || sending}
            data-testid="booking-submit"
          >
            {sending ? t(locale, 'people.landing.submitting') : t(locale, 'people.landing.submit')}
          </Button>
        </span>
      </div>
    </form>
  )
}
