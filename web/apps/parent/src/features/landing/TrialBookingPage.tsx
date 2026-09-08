// Door A, on ONE page.
//
// This replaces `BookingFlow`'s three screens (agreements · contact-and-children · health
// with a signature pad per child). Spec: `docs/superpowers/specs/2026-09-08-trial-booking-
// redesign.md`. Two defects drove the rewrite and both are structural rather than cosmetic:
//
//   * **The booking was written last.** `submitBooking` fired from `handleHealthSigned`, so
//     a parent who filled in everything and then abandoned at the signature pad left the
//     club NOTHING -- no name, no email, no lead to ring. The step most likely to be
//     abandoned stood in front of the write. Here there is one write, under one button.
//   * **It was a phone design shown on a desktop.** The landing page lives at
//     `gladiatorclub.co.il`, where most first visits are on a wide screen, and the booking
//     opened as a phone-width modal on top of it. This is a page: form column and aside
//     column from `md` up, one column on a phone.
//
// The decisions `BookingFlow`'s own header recorded are still binding and are still here:
//
//   * **Decision 5 -- anonymous booking survives.** A first lesson is booked the way every
//     club books one, with a form and no account. An anonymous caller can never reach the
//     authenticated `POST /privacy/consents`, so the tick travels inside the SAME write
//     that creates the lead `Person` (`agreements_accepted`; see `TrialService.book_for_self`).
//     What is gone is the SCREEN in front of it: three document cards that asked nothing
//     about the family and whose Continue button waited on a network read.
//   * **Decision 8 -- the trial field set.** First name · surname · birthdate · one group ·
//     one slot. Never ת.ז., never an address: "a stranger booking a free lesson should not
//     hand over a minor's national ID." The emergency number is still asked once per
//     trainee -- inside the health template, and pre-answered from the contact phone the
//     parent already typed rather than asked a second time.
//   * **Decision 9 -- one list, no "you and your children" split.** There is no `אני
//     מתאמן/ת` control any more, because there is nothing left for it to do: the birthdate
//     decides the shape of the form, so an adult booking for themselves simply types their
//     own birthdate and is never shown a parent block.
//   * **F21 -- the declaration carries the REAL answers**, per trainee, never a hardcoded
//     `{ confirmed: true }`.
//
// What is new: no signature pad on this door (spec §2, settled by the owner 2026-09-08 --
// a trial is declared, not signed), and the two keys that record the press instead,
// `declared_by` / `declared_at`.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ExternalLink, Sparkles, UserPlus } from 'lucide-react'
import { apiFetch } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { isAnswered, makePublicHealthClient } from '../health/healthClient'
import type { AnswerValue, TemplateSchema } from '../health/healthClient'
import { emptySubjectRow, toTrialChildPayloads } from '../onboarding/familyDraft'
import type { SubjectRow } from '../onboarding/familyDraft'
import { ageFrom, isMinor } from '../onboarding/wizard/types'
import { BookingConfirmed } from './BookingConfirmed'
import { bookingErrorFor } from './landingClient'
import type {
  BookingError,
  BookingResult,
  LandingClient,
  PublicGroup,
  TrialSlot,
} from './landingClient'
import { landingViewHref } from './route'
import { TrialAside } from './TrialAside'
import { TrialTraineeCard } from './TrialTraineeCard'
import type { ContactErrors, ContactMode, TraineeErrors, TrialContact } from './TrialTraineeCard'
import type { TrialHealthState } from './TrialHealthBlock'

/**
 * §5.4a step 2 -- "groups filtered by the child's age where age_min/age_max are set".
 *
 * Out-of-range groups are returned, not hidden: a parent who cannot see a group cannot
 * tell whether it exists at all, and `landing.tooYoung` says why it is unavailable.
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

/** The template's emergency-number question. The id is a constant of this product's own
 *  health template, not a guess: `PartHealth` names the same three ids in
 *  `WIZARD_OWNED_QUESTIONS`, and `BookingFlow` seeded exactly this one from the contact
 *  phone. A template without it simply has nothing to pre-answer. */
const EMERGENCY_QUESTION_ID = 'emergency_contact'

const EMAIL = /\S+@\S+\.\S+/

const EMPTY_HEALTH: TrialHealthState = { preset: null, answers: {} }

export function TrialBookingPage({
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
  /** The club's own address and phone, from the landing payload -- the aside's "where we
   *  are" and its WhatsApp link, and nothing else. Deliberately NOT seeded into the
   *  parent's own phone field, which `BookingFlow` did: the club's number is not the
   *  family's, and a pre-filled contact phone is a wrong number nobody notices typing. */
  address?: string | null
  phone?: string | null
  /** The group a landing-page picker chose; pre-fills the first trainee. */
  initialGroupId?: string | null
}) {
  const [trainees, setTrainees] = useState<SubjectRow[]>(() => [
    { ...emptySubjectRow('child', false, 'trial'), groupIds: initialGroupId ? [initialGroupId] : [] },
  ])
  const [contact, setContact] = useState<TrialContact>({ name: '', phone: '', email: '' })
  const [health, setHealth] = useState<Record<string, TrialHealthState>>({})
  const [slotsByGroup, setSlotsByGroup] = useState<Record<string, TrialSlot[]>>({})
  const [schema, setSchema] = useState<TemplateSchema | null>(null)
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [templateFailed, setTemplateFailed] = useState(false)
  const [templateAttempt, setTemplateAttempt] = useState(0)
  const [consent, setConsent] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<BookingError | null>(null)
  const [result, setResult] = useState<BookingResult | null>(null)

  const healthClient = useMemo(() => makePublicHealthClient(apiFetch, slug), [slug])
  const requestedGroups = useRef(new Set<string>())

  useEffect(() => {
    document.title = t(locale, 'people.bookTrial.pageTitle')
  }, [locale])

  // The one read this page makes, and nothing waits on it to become USABLE -- the form is
  // typed into while it is in flight; only the health block itself shows a state.
  useEffect(() => {
    let live = true
    healthClient
      .template()
      .then((template) => {
        if (!live) return
        setSchema(template.schema as unknown as TemplateSchema)
        setTemplateId(template.id)
      })
      .catch(() => {
        if (live) setTemplateFailed(true)
      })
    return () => {
      live = false
    }
  }, [healthClient, templateAttempt])

  // Slots belong to the group chosen directly above them, and two trainees who picked the
  // same group share one request. Keyed on the joined ids so the effect's dependency IS
  // the set of chosen groups, rather than a new array identity every render.
  const chosenGroupsKey = trainees.map((row) => row.groupIds[0] ?? '').join('|')
  useEffect(() => {
    for (const groupId of chosenGroupsKey.split('|').filter(Boolean)) {
      if (requestedGroups.current.has(groupId)) continue
      requestedGroups.current.add(groupId)
      void client
        .trialSlots(groupId)
        .then((body) => setSlotsByGroup((previous) => ({ ...previous, [groupId]: body.items })))
        .catch(() => setSlotsByGroup((previous) => ({ ...previous, [groupId]: [] })))
    }
  }, [chosenGroupsKey, client])

  if (result) {
    return <BookingConfirmed address={address} locale={locale} phone={phone} result={result} />
  }

  const first = trainees[0]!
  const firstIsMinor = isMinor(first.birthdate, today)
  //: **Known, which is not the same question as under-18.** `isMinor('')` is deliberately
  //: `true` -- an unknown age is treated as a minor everywhere a safety decision turns on
  //: it, and that default is right. But it must not make this screen ASK for a parent's
  //: details before anyone has typed a birthdate: on a fresh form the parent block used to
  //: be there from the first paint, with no age on screen to justify it (owner,
  //: 2026-09-08). The block waits until the birthdate says which contact it is asking for.
  //:
  //: Only the RENDER is gated. `firstIsMinor`'s other three readers -- `declaredBy`, the
  //: guardian name split and the contact validation -- all run at submit, and a birthdate
  //: is required to get there (`errorsFor` below), so the age is known by then.
  const firstAgeKnown = Number.isFinite(ageFrom(first.birthdate, today))
  const traineeLabel = (index: number) =>
    t(locale, 'people.bookTrial.traineeN').replace('{n}', String(index + 1))
  const nameOf = (row: SubjectRow, index: number) => row.firstName.trim() || traineeLabel(index)
  const adultFullName = `${first.firstName.trim()} ${first.lastName.trim()}`.trim()
  // Who pressed the health preset: the parent who typed their name, or the adult trainee
  // whose own name is the only one on the form. A signed-in caller typed neither -- the
  // server has their verified identity, and this page must not guess a name for them.
  const declaredBy = signedIn ? '' : firstIsMinor ? contact.name.trim() : adultFullName

  function updateRow(key: string, patch: Partial<SubjectRow>) {
    setTrainees((previous) =>
      previous.map((row) => {
        if (row.key !== key) return row
        const next = { ...row, ...patch }
        // A new birthdate can make the chosen group unfit. Dropping the choice with it is
        // what keeps an out-of-range `group_id` from travelling silently into the request
        // while the chip that set it is disabled on screen.
        if (patch.birthdate !== undefined) {
          const chosen = groups.find((group) => group.id === next.groupIds[0])
          if (chosen && !groupFitsAge(chosen, next.birthdate, today)) {
            return { ...next, groupIds: [], sessionId: null }
          }
        }
        return next
      }),
    )
  }

  function slotsFor(row: SubjectRow): TrialSlot[] | undefined {
    const groupId = row.groupIds[0]
    return groupId ? slotsByGroup[groupId] : []
  }

  /** A slot is required only when the chosen group actually has one to offer. The server
   *  accepts `session_id: null`, and refusing to submit a group whose sessions are all
   *  full or unpublished would be a dead end with nothing the family could do about it. */
  function slotMissing(row: SubjectRow): boolean {
    const slots = slotsFor(row)
    if (!slots || slots.length === 0) return false
    if (!slots.some((slot) => slot.is_bookable)) return false
    return row.sessionId === null
  }

  const traineeErrors: TraineeErrors[] = trainees.map((row) => ({
    firstName: row.firstName.trim() ? null : t(locale, 'people.bookTrial.error.firstName'),
    lastName: row.lastName.trim() ? null : t(locale, 'people.bookTrial.error.lastName'),
    birthdate: row.birthdate.trim() ? null : t(locale, 'people.bookTrial.error.birthdate'),
    group: row.groupIds[0] ? null : t(locale, 'people.bookTrial.error.group'),
    slot: slotMissing(row) ? t(locale, 'people.bookTrial.error.slot') : null,
    health: (health[row.key] ?? EMPTY_HEALTH).preset
      ? null
      : t(locale, 'people.bookTrial.error.health'),
  }))

  const contactErrors: ContactErrors = {
    name:
      signedIn || !firstIsMinor || contact.name.trim()
        ? null
        : t(locale, 'people.bookTrial.error.parentName'),
    phone: signedIn || contact.phone.trim() ? null : t(locale, 'people.bookTrial.error.phone'),
    email:
      signedIn || EMAIL.test(contact.email.trim())
        ? null
        : t(locale, 'people.bookTrial.error.email'),
  }
  const consentError = consent ? null : t(locale, 'people.bookTrial.error.consent')

  const valid =
    traineeErrors.every((row) => Object.values(row).every((message) => message === null)) &&
    Object.values(contactErrors).every((message) => message === null) &&
    consentError === null

  function declarationFor(row: SubjectRow): Record<string, unknown> {
    const answers: Record<string, AnswerValue> = { ...(health[row.key] ?? EMPTY_HEALTH).answers }
    // Item 1's "use it rather than asking twice": the number already on this page stands in
    // for the emergency contact, and never overwrites one the family typed themselves.
    if (!isAnswered(answers[EMERGENCY_QUESTION_ID]) && contact.phone.trim()) {
      answers[EMERGENCY_QUESTION_ID] = contact.phone.trim()
    }
    return {
      template_id: templateId,
      answers,
      // Spec §2: no signature on this door. `''` is already an accepted value --
      // `_store_trial_declarations` parks the entry unvalidated.
      signature_image_base64: '',
      // The two new keys, in that same unvalidated blob: who declared, and when. Absent
      // rather than blank for a signed-in caller, who typed no name here.
      ...(declaredBy ? { declared_by: declaredBy } : {}),
      declared_at: today.toISOString(),
    }
  }

  async function submit() {
    setSending(true)
    setError(null)
    const [guardianFirst = '', ...guardianRest] = (firstIsMinor ? contact.name.trim() : adultFullName)
      .split(/\s+/)
      .filter(Boolean)
    // `toTrialChildPayloads` maps the birthdate, the one group and the slot; its own name
    // handling splits a single `firstName` field, which predates this form's two. The two
    // real fields win here -- a surname is never inferred from a space.
    const children = toTrialChildPayloads(trainees).map((child, index) => ({
      ...child,
      first_name: trainees[index]!.firstName.trim(),
      last_name: trainees[index]!.lastName.trim(),
    }))
    try {
      const response = await client.book({
        // Spec §3 -- a signed-in caller is asked nothing about themselves and no guardian
        // key is sent at all; the server uses the address the provider verified, and a
        // typed one must never override it.
        ...(signedIn
          ? {}
          : {
              guardian: {
                first_name: guardianFirst,
                last_name: guardianRest.join(' '),
                email: contact.email.trim(),
                phone: contact.phone.trim() || null,
              },
            }),
        children,
        trial_health_declarations: trainees.map(declarationFor),
        agreements_accepted: consent,
      })
      if (response.ok) {
        setResult((await response.json()) as BookingResult)
        return
      }
      const body = (await response.json().catch(() => ({}))) as { detail?: { code?: string } }
      setError(bookingErrorFor(response.status, body.detail?.code))
    } catch {
      setError('generic')
    } finally {
      setSending(false)
    }
  }

  function handleSubmit(event: { preventDefault: () => void }) {
    event.preventDefault()
    setShowErrors(true)
    if (!valid || sending) return
    void submit()
  }

  const errorKey =
    error === 'already_used'
      ? 'people.landing.alreadyUsed'
      : error === 'rate_limited'
        ? 'people.landing.rateLimited'
        : error === 'schedule_unavailable'
          ? 'people.error.scheduleUnavailable'
          : 'people.landing.error'

  return (
    <div
      className="tw-scope w-full min-h-full bg-[#faf8ff] text-[#161b28]"
      data-testid="trial-booking-page"
    >
      <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6 py-6 sm:py-10 flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <span className="self-start inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#e3e7fa] text-[#0d2c6c] text-[12px] font-semibold">
            <Sparkles aria-hidden className="w-3.5 h-3.5 text-[#0056c5]" />
            {t(locale, 'people.bookTrial.badge')}
          </span>
          <h1 className="text-[26px] sm:text-[32px] font-bold text-[#161b28] tracking-tight">
            {t(locale, 'people.bookTrial.heading')}
          </h1>
          <p className="text-[14px] sm:text-[15px] text-[#444650] leading-relaxed max-w-[46rem]">
            {t(locale, 'people.bookTrial.lede')}
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_20rem] gap-5 items-start">
          <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
            <h2 className="text-[17px] font-bold text-[#001849]">
              {t(locale, 'people.bookTrial.traineeSection')}
            </h2>

            {trainees.map((row, index) => {
              const age = ageFrom(row.birthdate, today)
              const contactMode: ContactMode =
                signedIn || !firstAgeKnown
                  ? 'none'
                  : index > 0
                    ? 'carried'
                    : firstIsMinor
                      ? 'parent'
                      : 'own'
              return (
                <TrialTraineeCard
                  carriedFrom={nameOf(first, 0)}
                  contact={contact}
                  contactErrors={showErrors ? contactErrors : { name: null, phone: null, email: null }}
                  contactMode={contactMode}
                  declaredBy={declaredBy}
                  errors={
                    showErrors
                      ? traineeErrors[index]!
                      : { firstName: null, lastName: null, birthdate: null, group: null, slot: null, health: null }
                  }
                  groupFits={(group) => groupFitsAge(group, row.birthdate, today)}
                  groups={groups}
                  health={health[row.key] ?? EMPTY_HEALTH}
                  healthLoadFailed={templateFailed}
                  healthSchema={schema}
                  index={index}
                  key={row.key}
                  locale={locale}
                  // The band states the age, so it is drawn only when there IS one to
                  // state. A blank birthdate still counts as a minor -- the safe
                  // direction, and the parent block below renders either way.
                  minorBand={
                    contactMode === 'parent' && Number.isFinite(age) && row.firstName.trim()
                      ? t(locale, 'people.bookTrial.minorBand')
                          .replace('{name}', row.firstName.trim())
                          .replace('{age}', String(age))
                      : null
                  }
                  onContactChange={(patch) => setContact((previous) => ({ ...previous, ...patch }))}
                  onHealthChange={(next) => setHealth((previous) => ({ ...previous, [row.key]: next }))}
                  // The failure is cleared HERE rather than at the top of the fetch
                  // effect: a setState in an effect body is a cascading render, and the
                  // press is the only thing that ever starts a second attempt.
                  onHealthRetry={() => {
                    setTemplateFailed(false)
                    setTemplateAttempt((attempt) => attempt + 1)
                  }}
                  onRemove={() => setTrainees((previous) => previous.filter((r) => r.key !== row.key))}
                  onUpdate={(patch) => updateRow(row.key, patch)}
                  removable={trainees.length > 1}
                  row={row}
                  slots={slotsFor(row)}
                  today={today}
                  traineeName={nameOf(row, index)}
                />
              )
            })}

            <button
              className="group w-full py-3 px-4 rounded-xl text-[#0056c5] border-2 border-dashed bg-white hover:bg-[#f2f3ff] border-[#0056c5]/30 hover:border-[#0056c5] flex items-center justify-center gap-2.5 transition-all cursor-pointer"
              data-testid="trial-add-trainee"
              onClick={() =>
                setTrainees((previous) => [...previous, emptySubjectRow('child', false, 'trial')])
              }
              type="button"
            >
              <span className="w-7 h-7 rounded-full bg-[#d9e2ff] flex items-center justify-center text-[#0056c5] group-hover:scale-110 transition-transform">
                <UserPlus aria-hidden className="w-4 h-4" />
              </span>
              <span className="text-[14.5px] font-bold">
                {t(locale, 'people.bookTrial.addTrainee')}
              </span>
            </button>

            <div className="rounded-2xl bg-white border border-[#dee2f4] shadow-xs p-4 flex flex-col gap-2.5">
              <div className="flex items-start gap-2.5">
                {/* The input is a SIBLING of its label, associated by id -- never nested
                    inside it: a checkbox nested in its own label is activated twice by one
                    click and ticks and immediately unticks. */}
                <input
                  aria-describedby={showErrors && consentError ? 'trial-consent-error' : undefined}
                  aria-invalid={showErrors && consentError ? true : undefined}
                  checked={consent}
                  className="mt-0.5 w-4 h-4 shrink-0 accent-[#0056c5]"
                  data-testid="trial-consent"
                  id="trial-consent-box"
                  onChange={(event) => setConsent(event.target.checked)}
                  type="checkbox"
                />
                <label
                  className="text-[13px] text-[#161b28] leading-relaxed cursor-pointer"
                  htmlFor="trial-consent-box"
                >
                  {t(locale, 'people.bookTrial.consent')}
                </label>
              </div>
              {/* Its own row, never inside the label: tapping a label must toggle the box,
                  not navigate. A new tab, so a filled form survives being read. */}
              <a
                className="self-start inline-flex items-center gap-1 text-[12.5px] font-bold text-[#0056c5] hover:underline"
                data-testid="trial-legal-link"
                //: `/legal` at the root of a landing host, `/t/<slug>/legal` under a slug --
                //: derived from the path this page is being served from, so a visitor who
                //: arrived by their club's own link stays inside that club.
                href={landingViewHref(globalThis.location?.pathname ?? '/', 'legal')}
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExternalLink aria-hidden className="w-3.5 h-3.5" />
                {t(locale, 'people.bookTrial.readDocuments')}
              </a>
              {showErrors && consentError ? (
                <p
                  className="text-[11.5px] text-[#ba1a1a] font-medium"
                  id="trial-consent-error"
                  role="alert"
                >
                  {consentError}
                </p>
              ) : null}
            </div>

            {error ? (
              <div
                className="rounded-xl bg-[#ffdad6] border border-[#ba1a1a]/30 p-3.5 flex flex-col gap-2"
                data-testid="trial-error"
                role="alert"
              >
                <p className="text-[13px] text-[#410002] font-semibold flex items-center gap-2">
                  <AlertTriangle aria-hidden className="w-4 h-4 text-[#ba1a1a] shrink-0" />
                  {t(locale, errorKey)}
                </p>
                {/* Never a dead end: the form is still on screen, still filled. */}
                <button
                  className="self-start px-4 py-2 rounded-lg bg-[#001849] hover:bg-[#0056c5] text-white text-[13px] font-bold transition-colors cursor-pointer"
                  data-testid="trial-retry"
                  disabled={sending}
                  onClick={() => void submit()}
                  type="button"
                >
                  {t(locale, 'common.loadFailed.retry')}
                </button>
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <button
                className="h-12 rounded-xl bg-[#001849] hover:bg-[#0056c5] disabled:bg-[#dee2f4] disabled:text-[#757681] disabled:cursor-not-allowed text-white text-[15.5px] font-bold flex items-center justify-center gap-2 transition-colors shadow-md cursor-pointer"
                data-testid="trial-submit"
                disabled={sending}
                type="submit"
              >
                {sending
                  ? t(locale, 'people.bookTrial.submitting')
                  : t(locale, 'people.bookTrial.submit')}
              </button>
              <p className="text-[12px] text-[#444650] text-center">
                {t(locale, 'people.bookTrial.submitNote')}
              </p>
            </div>
          </form>

          <TrialAside address={address} locale={locale} phone={phone} />
        </div>
      </div>
    </div>
  )
}
