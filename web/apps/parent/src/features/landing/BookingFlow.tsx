// §3 Door A (`/t/<slug>`) -- the trial link. §3's own words: "The landing page keeps
// its marketing sections; the booking form inside it becomes the WIZARD, with the trial
// step list." This file used to own its own four steps (you / children / health / slot)
// and its own rail; it is now the same wizard machinery every other door shares --
// `JoinWelcomeStep` for agreements, `JoinHealthStep` for the real health form, this
// file's own compact per-student panel for the trial field set -- with the trial-only
// step list decision 8's table gives: **agreements · students · health, no payment
// step**.
//
// **F21, closed here.** The old step 3 asked one confirmation checkbox per child and
// posted `trial_health_declarations: children.map(() => ({ confirmed: true }))` --
// whatever the parent actually answered, the server got a literal `true`. Step 3 is now
// `JoinHealthStep` unmodified, and the submit below sends each child's REAL collected
// answers.
//
// **Decision 5 -- anonymous booking survives.** The owner's 2026-08-31 decision stands:
// a first lesson is booked the way every club books one, with a form and no account.
// `JoinWelcomeStep` is passed `deferAcceptance` here for exactly that reason -- an
// anonymous caller can never reach the authenticated `POST /privacy/consents`, so the
// three ticks are collected locally and travel inside the SAME write that creates the
// lead `Person` (`agreements_accepted` on the booking body; see
// `TrialService.book_for_self`).
//
// **Decision 8 -- the trial field set.** Full name · birthdate · ONE group · a slot,
// live inside the panel, filtered by the group chosen directly above it. Never ת.ז.,
// never an address -- "a stranger booking a free lesson should not hand over a minor's
// national ID." Emergency phone is asked once per child, inside the health popup itself
// (`emergency_contact`), the same question every other door's health step already asks.
//
// **Decision 9 -- one list, no "you and your children" split.** `אני מתאמן/ת` adds the
// signer as a row like any other, reusing the contact block's own name -- an adult
// training alone never meets a screen about children.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiFetch } from '@studio/core'
import { Alert, Button, Card, Radio, SlotChips, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { makePublicHealthClient } from '../health/healthClient'
import { needsFullDeclaration, type GatedStudent } from '../health/HealthGate'
import { JoinHealthStep } from '../onboarding/JoinHealthStep'
import { JoinWelcomeStep } from '../onboarding/JoinWelcomeStep'
import { OnboardingWizardChrome, stepPosition, type WizardStepKey } from '../onboarding/OnboardingWizardChrome'
import { WizardNavButtons } from '../onboarding/WizardNavButtons'
import { emptySubjectRow, toTrialChildPayloads, type SubjectRow } from '../onboarding/familyDraft'
import type { SubjectHealthDraft } from '../onboarding/healthDraft'
import { makePrivacyClient } from '../privacy/privacyClient'
import { BookingConfirmed } from './BookingConfirmed'
import { bookingErrorFor } from './landingClient'
import type { BookingError, BookingResult, LandingClient, PublicGroup, TrialSlot } from './landingClient'

type Step = 'welcome' | 'family' | 'health'

const TRIAL_STEPS: readonly WizardStepKey[] = ['welcome', 'family', 'health']

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

const fieldGrid2: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-3)',
  gridTemplateColumns: '1fr 1fr',
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
}

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

function localTrialStudents(rows: readonly SubjectRow[]): GatedStudent[] {
  return rows.map((row, index) => ({
    id: `local-${index}`,
    display_name: row.firstName.trim() || t('he', 'people.join.child'),
    status: 'trial',
    health_status: 'missing',
    agreement_complete: false,
  }))
}

/** One trial row's panel -- decision 8's narrow set, live inside the row rather than
 *  split across steps. `groupFitsAge` narrows the choice the same way the old step 2
 *  did; the slot list underneath is exactly the group just picked (`slotsByGroup`, fed
 *  by the caller once per group so two rows sharing a group share one fetch). */
function TrialRowPanel({
  row,
  index,
  groups,
  today,
  locale,
  slotsByGroup,
  onGroupChosen,
  onUpdate,
  onRemove,
  removable,
}: {
  row: SubjectRow
  index: number
  groups: readonly PublicGroup[]
  today: Date
  locale: Locale
  slotsByGroup: Record<string, TrialSlot[]>
  onGroupChosen: (groupId: string) => void
  onUpdate: (patch: Partial<SubjectRow>) => void
  onRemove: () => void
  removable: boolean
}) {
  const chosenGroupId = row.groupIds[0] ?? ''
  const slots = slotsByGroup[chosenGroupId] ?? []
  return (
    <Card>
      <div data-testid={`booking-row-panel-${row.key}`} style={cardStyle}>
      <h3 style={{ margin: 0 }}>
        {row.kind === 'self' ? t(locale, 'people.join.iTrain') : t(locale, 'people.join.child')}
      </h3>
      {row.kind === 'child' ? (
        <div style={fieldGrid2}>
          <TextField
            data-testid={`booking-row-name-${index}`}
            label={t(locale, 'people.join.fullName')}
            onChange={(event) => onUpdate({ firstName: event.target.value })}
            value={row.firstName}
          />
          <TextField
            data-testid={`booking-row-birthdate-${index}`}
            label={t(locale, 'people.join.birthdate')}
            onChange={(event) => onUpdate({ birthdate: event.target.value })}
            type="date"
            value={row.birthdate}
          />
        </div>
      ) : (
        <TextField
          data-testid={`booking-row-birthdate-${index}`}
          hint={t(locale, 'people.join.optional')}
          label={t(locale, 'people.join.birthdate')}
          onChange={(event) => onUpdate({ birthdate: event.target.value })}
          type="date"
          value={row.birthdate}
        />
      )}

      <p style={{ margin: 0, fontWeight: 500 }}>{t(locale, 'people.join.groups')}</p>
      {groups.map((group) => {
        const fits = groupFitsAge(group, row.birthdate, today)
        return (
          <Radio
            checked={chosenGroupId === group.id}
            data-testid={`booking-row-group-${index}-${group.id}`}
            disabled={!fits}
            key={group.id}
            label={fits ? group.name : `${group.name} — ${t(locale, 'people.landing.tooYoung')}`}
            name={`booking-group-${row.key}`}
            onChange={() => {
              onUpdate({ groupIds: [group.id], sessionId: null })
              onGroupChosen(group.id)
            }}
          />
        )
      })}

      {/* Decision 8 -- the slot lives INSIDE the panel, filtered by the group chosen
          directly above it, not a fourth step. */}
      {chosenGroupId ? (
        <div data-testid={`booking-row-slots-${index}`}>
          <p style={{ margin: 0, fontWeight: 500 }}>{t(locale, 'people.join.slotTitle')}</p>
          {slots.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
              {t(locale, 'people.join.noSlotsForGroup')}
            </p>
          ) : (
            <SlotChips
              legend={t(locale, 'people.join.slotTitle')}
              onValueChange={(id) => onUpdate({ sessionId: id })}
              options={slots.map((slot) => ({
                id: slot.session_id,
                label: slot.is_bookable
                  ? new Date(slot.starts_at).toLocaleString(locale === 'he' ? 'he-IL' : 'en-US')
                  : `${new Date(slot.starts_at).toLocaleString(locale === 'he' ? 'he-IL' : 'en-US')} — ${t(locale, 'people.landing.slotUnavailable')}`,
                disabled: !slot.is_bookable,
              }))}
              value={row.sessionId}
            />
          )}
        </div>
      ) : null}

      {removable ? (
        <Button
          data-testid={`booking-row-remove-${index}`}
          onClick={onRemove}
          type="button"
          variant="ghost"
        >
          {t(locale, 'people.join.removeChild')}
        </Button>
      ) : null}
      </div>
    </Card>
  )
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
  /** 13b's when-line address and change-the-time WhatsApp -- from the landing payload. */
  address?: string | null
  phone?: string | null
  /** The group the landing picker chose; pre-fills the first row. */
  initialGroupId?: string | null
}) {
  const [step, setStep] = useState<Step>('welcome')
  const [agreementsAccepted, setAgreementsAccepted] = useState(false)
  // Decision 9's contact block -- name · phone · email, above the list rather than a
  // step of its own. Shown for every caller (never gated on `signedIn`): a signed-in
  // parent's answers here are simply never sent as `guardian` (the server would ignore
  // a typed one in favour of the verified address regardless), but decision 9's "אני
  // מתאמן/ת reuses the name already given" needs SOME typed name to reuse, and a
  // signed-in caller's own display name is not available to this component.
  const [contact, setContact] = useState({ firstName: '', lastName: '', phone: phone ?? '', email: '' })
  const [rows, setRows] = useState<SubjectRow[]>([
    { ...emptySubjectRow('child', false, 'trial'), groupIds: initialGroupId ? [initialGroupId] : [] },
  ])
  const [slotsByGroup, setSlotsByGroup] = useState<Record<string, TrialSlot[]>>({})
  const [healthDrafts, setHealthDrafts] = useState<Record<string, SubjectHealthDraft>>({})
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<BookingError | null>(null)
  const [result, setResult] = useState<BookingResult | null>(null)

  const privacyClient = useMemo(() => makePrivacyClient(apiFetch), [])
  const healthClient = useMemo(() => makePublicHealthClient(apiFetch, slug), [slug])

  function fetchSlotsFor(groupId: string) {
    if (slotsByGroup[groupId]) return
    void client
      .trialSlots(groupId)
      .then((body) => setSlotsByGroup((previous) => ({ ...previous, [groupId]: body.items })))
      .catch(() => setSlotsByGroup((previous) => ({ ...previous, [groupId]: [] })))
  }

  // Pre-fill's own group needs its slots fetched too, on mount.
  useEffect(() => {
    if (initialGroupId) fetchSlotsFor(initialGroupId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (result) {
    return <BookingConfirmed result={result} locale={locale} address={address} phone={phone} />
  }

  const students = localTrialStudents(rows)

  function updateRow(key: string, patch: Partial<SubjectRow>) {
    setRows((previous) => previous.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  const hasSelf = rows.some((row) => row.kind === 'self')
  const studentsValid =
    rows.length > 0 &&
    rows.every(
      (row) =>
        row.groupIds.length > 0 &&
        (row.kind === 'self' || row.firstName.trim() !== ''),
    )
  const contactValid =
    signedIn || (contact.firstName.trim() !== '' && /\S+@\S+\.\S+/.test(contact.email.trim()))

  function submitStudents() {
    if (!studentsValid || !contactValid) return
    setStep('health')
  }

  function handleHealthSigned(draft: SubjectHealthDraft) {
    const next = { ...healthDrafts, [draft.studentId]: draft }
    setHealthDrafts(next)
    const remaining = students.filter(needsFullDeclaration).filter((student) => !next[student.id])
    if (remaining.length === 0) void submitBooking(next)
  }

  async function submitBooking(drafts: Record<string, SubjectHealthDraft>) {
    setSending(true)
    setError(null)
    const trialChildren = toTrialChildPayloads(rows, {
      firstName: contact.firstName,
      lastName: contact.lastName,
    })
    try {
      const response = await client.book({
        ...(signedIn
          ? {}
          : {
              guardian: {
                first_name: contact.firstName.trim(),
                last_name: contact.lastName.trim(),
                email: contact.email.trim(),
                phone: contact.phone.trim() || null,
              },
            }),
        children: trialChildren,
        trial_health_declarations: rows.map((_row, index) => {
          const draft = drafts[`local-${index}`]
          return draft && draft.templateId
            ? {
                template_id: draft.templateId,
                answers: draft.answers,
                signature_image_base64: draft.signatureBase64 ?? '',
              }
            : {}
        }),
        agreements_accepted: agreementsAccepted,
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

  if (step === 'welcome') {
    return (
      <JoinWelcomeStep
        deferAcceptance
        locale={locale}
        logoUrl={null}
        privacyClient={privacyClient}
        steps={TRIAL_STEPS}
        studioName=""
        onAccept={(accepted) => {
          setAgreementsAccepted(accepted)
          setStep('family')
        }}
      />
    )
  }

  if (step === 'family') {
    return (
      <div data-testid="booking-students-step">
        <OnboardingWizardChrome
          locale={locale}
          position={stepPosition('family', TRIAL_STEPS)}
          steps={TRIAL_STEPS}
          title={t(locale, 'people.join.trialStudentsTitle')}
        >
          {/* Decision 9 -- name · phone · email, once, above the list. */}
          <Card>
          <div style={cardStyle}>
            <h3 style={{ margin: 0 }}>{t(locale, 'people.join.contactDetails')}</h3>
            <div style={fieldGrid2}>
              <TextField
                data-testid="booking-contact-first-name"
                label={t(locale, 'people.student.firstName')}
                onChange={(event) => setContact({ ...contact, firstName: event.target.value })}
                value={contact.firstName}
              />
              <TextField
                data-testid="booking-contact-last-name"
                label={t(locale, 'people.student.lastName')}
                onChange={(event) => setContact({ ...contact, lastName: event.target.value })}
                value={contact.lastName}
              />
            </div>
            <div style={fieldGrid2}>
              <TextField
                data-testid="booking-contact-phone"
                label={t(locale, 'people.student.phone')}
                onChange={(event) => setContact({ ...contact, phone: event.target.value })}
                type="tel"
                value={contact.phone}
              />
              <TextField
                data-testid="booking-contact-email"
                label={t(locale, 'people.student.email')}
                onChange={(event) => setContact({ ...contact, email: event.target.value })}
                type="email"
                value={contact.email}
              />
            </div>
          </div>
          </Card>

          {rows.map((row, index) => (
            <TrialRowPanel
              groups={groups}
              index={index}
              key={row.key}
              locale={locale}
              onGroupChosen={fetchSlotsFor}
              onRemove={() => setRows((previous) => previous.filter((r) => r.key !== row.key))}
              onUpdate={(patch) => updateRow(row.key, patch)}
              removable={rows.length > 1}
              row={row}
              slotsByGroup={slotsByGroup}
              today={today}
            />
          ))}

          <div style={actionsStyle}>
            <Button
              data-testid="booking-add-child"
              onClick={() => setRows((previous) => [...previous, emptySubjectRow('child', false, 'trial')])}
              type="button"
              variant="secondary"
            >
              {t(locale, 'people.landing.addChild')}
            </Button>
            {/* Decision 9 -- "אני מתאמן/ת" adds the signer as a row like any other,
                reusing the contact block's own name. An adult training alone never
                meets a "children" step: this is the same list, one more row. */}
            {!hasSelf ? (
              <Button
                data-testid="booking-add-self"
                onClick={() =>
                  setRows((previous) => [...previous, emptySubjectRow('self', false, 'trial')])
                }
                type="button"
                variant="secondary"
              >
                {t(locale, 'people.join.iTrain')}
              </Button>
            ) : null}
          </div>

          {error ? (
            <Alert data-testid="booking-error" iconLabel={t(locale, 'people.error.generic')} tone="danger">
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
          ) : null}

          <WizardNavButtons
            forwardDisabled={!studentsValid || !contactValid}
            forwardTestId="booking-to-health"
            locale={locale}
            onForward={submitStudents}
          />
        </OnboardingWizardChrome>
      </div>
    )
  }

  // The write fires the moment the LAST child's declaration is signed
  // (`handleHealthSigned` above) -- there is no separate confirm gate on this door, so
  // a failure has to be shown somewhere on THIS same screen rather than a step that no
  // longer exists once every kid is done.
  return (
    <div data-testid="booking-health-step">
      <JoinHealthStep
        client={healthClient}
        drafts={healthDrafts}
        locale={locale}
        onBack={() => setStep('family')}
        onSigned={handleHealthSigned}
        signerName={`${contact.firstName} ${contact.lastName}`.trim() || undefined}
        steps={TRIAL_STEPS}
        students={students}
      />
      {sending ? (
        <p data-testid="booking-sending">{t(locale, 'reports.privacy.gate.working')}</p>
      ) : null}
      {error ? (
        <>
          <Alert data-testid="booking-error" iconLabel={t(locale, 'people.error.generic')} tone="danger">
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
          <Button
            data-testid="booking-retry-submit"
            onClick={() => void submitBooking(healthDrafts)}
            type="button"
            variant="secondary"
          >
            {t(locale, 'common.loadFailed.retry')}
          </Button>
        </>
      ) : null}
    </div>
  )
}
