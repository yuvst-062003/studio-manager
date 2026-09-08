// One trainee, on the one-page booking form: the fields, the two pickers, the parent block
// the birthdate decides on, and the health declaration.
//
// **The card is the whole of a trainee.** The old flow split these across three screens --
// contact, then a panel per child, then a health screen with a popup per child -- so a
// family with two children met the same question in three places and the club got nothing
// at all from anyone who stopped at the last one. Everything one trainee needs is in one
// bordered card here, and adding a second child adds a second card, not a second journey.
//
// **The two pickers are radio groups with a legend**, not clickable divs
// (`.claude/rules/ui-rtl-a11y.md`), and the slot list belongs to the group chosen directly
// above it -- fetched by the page, per group, so two children in the same group share one
// request.
import { useState } from 'react'
import { CalendarClock, Trash2, Users } from 'lucide-react'
import { formatSessionWhen } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { TemplateSchema } from '../health/healthClient'
import { SectionBand, TextField } from '../onboarding/wizard/parts/Field'
import type { SubjectRow } from '../onboarding/familyDraft'
import { TrialHealthBlock } from './TrialHealthBlock'
import type { TrialHealthState } from './TrialHealthBlock'
import type { PublicGroup, TrialSlot } from './landingClient'

/** What a trainee still has to answer. `null` is "fine"; a string is what the parent
 *  reads, and it is linked to the control by `aria-describedby`. */
export type TraineeErrors = {
  firstName: string | null
  lastName: string | null
  birthdate: string | null
  group: string | null
  slot: string | null
  health: string | null
}

/** The one contact this booking records (spec §3: `TrialGuardianIn` is a single guardian).
 *  Shared across every trainee -- see `contactMode`. */
export type TrialContact = { name: string; phone: string; email: string }

export type ContactErrors = { name: string | null; phone: string | null; email: string | null }

/**
 * Which contact control this card shows, decided by the page.
 *
 * - `parent` — the first trainee is a minor: name, phone, email, under the band that says why.
 * - `own` — the first trainee is 18+: their own phone and email, and no "who is this for?"
 *   question, because the birthdate already answered it.
 * - `carried` — a later trainee: a green line saying whose details were used, and a link to
 *   change them. It edits the SAME shared state; one booking records one contact.
 * - `none` — a signed-in caller, who is asked nothing about themselves.
 */
export type ContactMode = 'parent' | 'own' | 'carried' | 'none'

function chipClass(checked: boolean, disabled: boolean): string {
  if (disabled) {
    return 'border-[#dee2f4] bg-[#f2f3ff] text-[#757681] cursor-not-allowed'
  }
  return checked
    ? 'border-[#0056c5] bg-[#0056c5] text-white shadow-xs cursor-pointer'
    : 'border-[#c5c6d2] bg-white text-[#161b28] hover:border-[#0056c5] hover:bg-[#f2f3ff] cursor-pointer'
}

const chipBase =
  'flex flex-col gap-0.5 rounded-xl border-2 px-3.5 py-2.5 text-[13.5px] font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#0056c5]'

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p className="text-[11.5px] text-[#ba1a1a] font-medium" id={id} role="alert">
      {message}
    </p>
  )
}

export function TrialTraineeCard({
  locale,
  index,
  row,
  groups,
  today,
  slots,
  errors,
  onUpdate,
  onRemove,
  removable,
  minorBand,
  contactMode,
  contact,
  contactErrors,
  onContactChange,
  carriedFrom,
  traineeName,
  declaredBy,
  healthSchema,
  healthLoadFailed,
  onHealthRetry,
  health,
  onHealthChange,
  groupFits,
}: {
  locale: Locale
  index: number
  row: SubjectRow
  groups: readonly PublicGroup[]
  today: Date
  /** The chosen group's bookable sessions, or `undefined` while they are still being
   *  fetched -- which is not the same as an empty list, and must not read as one. */
  slots: TrialSlot[] | undefined
  errors: TraineeErrors
  onUpdate: (patch: Partial<SubjectRow>) => void
  onRemove: () => void
  removable: boolean
  /** `bookTrial.minorBand`, already interpolated, or `null` when there is no age to state. */
  minorBand: string | null
  contactMode: ContactMode
  contact: TrialContact
  contactErrors: ContactErrors
  onContactChange: (patch: Partial<TrialContact>) => void
  /** Whose details the `carried` line names. */
  carriedFrom: string
  /** This trainee, as the health sentence names them. */
  traineeName: string
  declaredBy: string
  healthSchema: TemplateSchema | null
  healthLoadFailed: boolean
  onHealthRetry: () => void
  health: TrialHealthState
  onHealthChange: (next: TrialHealthState) => void
  /** `groupFitsAge`, bound to this trainee's birthdate by the page. */
  groupFits: (group: PublicGroup) => boolean
}) {
  const [carriedOpen, setCarriedOpen] = useState(false)
  const chosenGroupId = row.groupIds[0] ?? ''
  const groupErrorId = `trial-group-error-${index}`
  const slotErrorId = `trial-slot-error-${index}`
  const showParentFields = contactMode === 'parent' || (contactMode === 'carried' && carriedOpen)

  return (
    <article
      className="rounded-2xl bg-white border border-[#dee2f4] shadow-xs p-4 sm:p-5 flex flex-col gap-4"
      data-testid={`trial-trainee-${index}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[16px] font-bold text-[#001849]">
          {t(locale, 'people.bookTrial.traineeN').replace('{n}', String(index + 1))}
        </h3>
        {removable ? (
          <button
            className="flex items-center gap-1 text-[12.5px] font-semibold text-[#444650] hover:text-[#ba1a1a] px-2 py-1 rounded-lg hover:bg-[#ffdad6] transition-colors cursor-pointer"
            data-testid={`trial-remove-${index}`}
            onClick={onRemove}
            type="button"
          >
            <Trash2 aria-hidden className="w-4 h-4" />
            {t(locale, 'people.bookTrial.removeTrainee')}
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <TextField
          error={errors.firstName}
          label={t(locale, 'people.bookTrial.firstName')}
          onChange={(event) => onUpdate({ firstName: event.target.value })}
          required
          value={row.firstName}
        />
        <TextField
          error={errors.lastName}
          label={t(locale, 'people.bookTrial.lastName')}
          onChange={(event) => onUpdate({ lastName: event.target.value })}
          required
          value={row.lastName}
        />
        <TextField
          error={errors.birthdate}
          label={t(locale, 'people.bookTrial.birthdate')}
          onChange={(event) =>
            // A new birthdate can make the chosen group unfit, so the choice it filtered
            // goes with it rather than travelling silently into the request.
            onUpdate({ birthdate: event.target.value })
          }
          required
          type="date"
          value={row.birthdate}
        />
      </div>

      {/* The group picker: every group, always, with the reason on the ones that do not
          fit. A parent who cannot see a group cannot tell whether it exists. */}
      <fieldset
        aria-describedby={errors.group ? groupErrorId : undefined}
        className="flex flex-col gap-2"
      >
        <legend className="text-[13px] font-semibold text-[#161b28] mb-1.5">
          {t(locale, 'people.bookTrial.group')}
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {groups.map((group) => {
            const fits = groupFits(group)
            const checked = chosenGroupId === group.id
            return (
              <label className={`${chipBase} ${chipClass(checked, !fits)}`} key={group.id}>
                <input
                  checked={checked}
                  className="sr-only"
                  data-testid={`trial-group-${index}-${group.id}`}
                  disabled={!fits}
                  name={`trial-group-${row.key}`}
                  onChange={() => onUpdate({ groupIds: [group.id], sessionId: null })}
                  type="radio"
                  value={group.id}
                />
                <span>{group.name}</span>
                {!fits ? (
                  <span className="text-[11.5px] font-medium">
                    {t(locale, 'people.landing.tooYoung')}
                  </span>
                ) : null}
              </label>
            )
          })}
        </div>
        {errors.group ? <FieldError id={groupErrorId} message={errors.group} /> : null}
      </fieldset>

      {/* The slot belongs to the group chosen directly above it. */}
      {chosenGroupId ? (
        <fieldset
          aria-describedby={errors.slot ? slotErrorId : undefined}
          className="flex flex-col gap-2"
          data-testid={`trial-slots-${index}`}
        >
          <legend className="text-[13px] font-semibold text-[#161b28] mb-1.5 flex items-center gap-1.5">
            <CalendarClock aria-hidden className="w-4 h-4 text-[#0056c5]" />
            {t(locale, 'people.bookTrial.slot')}
          </legend>
          {slots === undefined ? (
            <p className="text-[12.5px] text-[#444650]">{t(locale, 'health.declaration.loading')}</p>
          ) : slots.length === 0 ? (
            <p className="text-[12.5px] text-[#444650]">
              {t(locale, 'people.join.noSlotsForGroup')}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {slots.map((slot) => {
                const checked = row.sessionId === slot.session_id
                return (
                  <label
                    className={`${chipBase} ${chipClass(checked, !slot.is_bookable)}`}
                    key={slot.session_id}
                  >
                    <input
                      checked={checked}
                      className="sr-only"
                      data-testid={`trial-slot-${index}-${slot.session_id}`}
                      disabled={!slot.is_bookable}
                      name={`trial-slot-${row.key}`}
                      onChange={() => onUpdate({ sessionId: slot.session_id })}
                      type="radio"
                      value={slot.session_id}
                    />
                    {/* G3 — stored UTC, rendered Asia/Jerusalem, as one string: a date and
                        a time in separate nodes reorder in a right-to-left paragraph. */}
                    <span>{formatSessionWhen(slot.starts_at, locale)}</span>
                    {!slot.is_bookable ? (
                      <span className="text-[11.5px] font-medium">
                        {t(locale, 'people.landing.slotUnavailable')}
                      </span>
                    ) : null}
                  </label>
                )
              })}
            </div>
          )}
          {errors.slot ? <FieldError id={slotErrorId} message={errors.slot} /> : null}
        </fieldset>
      ) : null}

      {/* The band that explains why the form just grew. `role="status"` so a screen reader
          hears the reason, rather than only meeting three new fields (§7). */}
      {minorBand ? (
        <p
          className="rounded-xl bg-[#e9edff] border border-[#dae1ff] text-[#001849] text-[12.5px] font-semibold px-3 py-2 flex items-center gap-2"
          data-testid="trial-minor-band"
          role="status"
        >
          <Users aria-hidden className="w-4 h-4 text-[#0056c5] shrink-0" />
          <span>{minorBand}</span>
        </p>
      ) : null}

      {/* The green line, and the change is the line itself -- the sentence ends "שנו כאן",
          so the control it describes is the thing you press. A separate "change" link
          beside it would need a word this feature has no key for, and would leave the
          sentence pointing at nothing. */}
      {contactMode === 'carried' && !carriedOpen ? (
        <button
          className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 flex items-center gap-2 text-start text-[12.5px] text-emerald-900 font-medium hover:bg-emerald-100 transition-colors cursor-pointer"
          data-testid={`trial-parent-change-${index}`}
          onClick={() => setCarriedOpen(true)}
          type="button"
        >
          <Users aria-hidden className="w-4 h-4 text-emerald-700 shrink-0" />
          <span data-testid={`trial-parent-carried-${index}`}>
            {t(locale, 'people.bookTrial.parentCarried').replace('{name}', carriedFrom)}
          </span>
        </button>
      ) : null}

      {showParentFields ? (
        <section className="flex flex-col gap-3" data-testid={contactMode === 'parent' ? 'trial-parent-block' : `trial-parent-block-${index}`}>
          <SectionBand
            icon={<Users className="w-5 h-5" />}
            title={t(locale, 'people.bookTrial.parentSection')}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <TextField
              error={contactErrors.name}
              label={t(locale, 'people.bookTrial.parentName')}
              onChange={(event) => onContactChange({ name: event.target.value })}
              required
              value={contact.name}
            />
            <TextField
              dir="ltr"
              error={contactErrors.phone}
              label={t(locale, 'people.bookTrial.parentPhone')}
              onChange={(event) => onContactChange({ phone: event.target.value })}
              required
              type="tel"
              value={contact.phone}
            />
            <TextField
              dir="ltr"
              error={contactErrors.email}
              label={t(locale, 'people.bookTrial.parentEmail')}
              onChange={(event) => onContactChange({ email: event.target.value })}
              required
              type="email"
              value={contact.email}
            />
          </div>
          <p className="text-[11.5px] text-[#444650]">{t(locale, 'people.bookTrial.emailHint')}</p>
        </section>
      ) : null}

      {/* 18 and over: no parent block, and no "who is this for?" question either -- the
          birthdate already answered it. Their own two lines take its place. */}
      {contactMode === 'own' ? (
        <section className="flex flex-col gap-3" data-testid="trial-own-contact">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextField
              dir="ltr"
              error={contactErrors.phone}
              label={t(locale, 'people.bookTrial.ownPhone')}
              onChange={(event) => onContactChange({ phone: event.target.value })}
              required
              type="tel"
              value={contact.phone}
            />
            <TextField
              dir="ltr"
              error={contactErrors.email}
              label={t(locale, 'people.bookTrial.ownEmail')}
              onChange={(event) => onContactChange({ email: event.target.value })}
              required
              type="email"
              value={contact.email}
            />
          </div>
          <p className="text-[11.5px] text-[#444650]">{t(locale, 'people.bookTrial.emailHint')}</p>
        </section>
      ) : null}

      <TrialHealthBlock
        declaredAt={today}
        declaredBy={declaredBy}
        error={errors.health}
        index={index}
        loadFailed={healthLoadFailed}
        locale={locale}
        onChange={onHealthChange}
        onRetry={onHealthRetry}
        schema={healthSchema}
        state={health}
        traineeName={traineeName}
      />
    </article>
  )
}
