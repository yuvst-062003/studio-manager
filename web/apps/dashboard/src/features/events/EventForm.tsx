// Artboard 7b — יצירת אירוע.
//
// **Six type cards, not the canvas's five.** Three of the drawn types are not enum members
// and three members have no card; `EVENT_TYPES` is a CHECK constraint in revision 0008 and
// a lane never runs a migration, so the enum is what a manager may choose from.
//
// **The consent wording has an input.** 7b finding 2: `events.consent.text` and
// `consent.textRequired` both exist, the field is required, and the canvas offers nowhere
// to write it. `event.consent_text` is 4000 characters, which is why `TextField` grew a
// `multiline` mode rather than this form growing a local `<textarea>`.
//
// **Validation mirrors the two model validators, so the CHECK constraints never fire.**
// `EventCreateIn` already refuses consent-without-text and an end before a start; refusing
// them here first is what keeps a constraint violation from reaching the manager as a 500
// with no field attached, which the form could not mark.
//
// **Creating and publishing are two actions.** 7b finding 3 makes publish-and-send one
// button; 9i and 9d both draw a state that button cannot produce — published, invitations
// unsent. Here `save` creates a draft and `publish` creates then publishes, which is the
// shape the API has.
//
// **מי מוזמן was missing entirely, and that made publishing a no-op.** `targets` was a prop
// hardcoded to `[]` at the form's only mount, so `resolve_targets` returned an empty list
// and every event published from the dashboard reached nobody. `EventTargetPicker` is the
// field, and the audience now defaults to the whole club — the canvas's own default, and
// the one wrong answer a manager can see and correct rather than one they cannot.
//
// **פרטים להורים is one field, not the canvas's two.** 7b draws מה להביא and איסוף וסיום as
// separate boxes; §4.3's `event` has a single `description`. Splitting them across one
// column would mean encoding structure into free text and parsing it back out in the parent
// app, so it is one labelled input that says what it is for. איסוף וסיום is a cut.
//
// **תצוגה מקדימה is live and mirrors `7d`.** §4.3 hides a draft from every guardian, so
// without it the first person to see the invitation is a parent, after the send.
//
// **Nothing here has a capacity, a minimum age or a transport field.** The canvas draws all
// three and §4.3 carries no column for any of them.
import { useId, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, Card, Radio, SegmentedControl, Switch, TextField } from '@studio/ui'
import { parseShekels } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { EventPreviewCard } from './EventPreviewCard'
import { EventTargetPicker, reachesNobody } from './EventTargetPicker'
import { EVENT_TYPES } from './client'
import type { DashboardEventsClient, EventCreateIn, EventTargetOut, EventType } from './client'

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
}

const fieldRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
}

const typeGridStyle: CSSProperties = {
  border: 0,
  display: 'grid',
  gap: 'var(--space-2)',
  gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
  margin: 0,
  padding: 0,
}

const legendStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
  fontWeight: 'var(--weight-medium)',
  padding: 0,
}

const hintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
}

/** 7b's two columns. `auto-fit` over `min(100%, …)` rather than a media query, because an
 *  inline style cannot carry one and this file has no stylesheet — the same trick the type
 *  grid above already uses. Below ~48rem the aside falls under the form. */
const splitStyle: CSSProperties = {
  alignItems: 'start',
  display: 'grid',
  gap: 'var(--space-4)',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 22rem), 1fr))',
}

/** The preview is a preview of a PHONE. Left at half a desktop width it would be a
 *  reassuring picture of a layout no parent will ever see. */
const asideStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '26rem',
}

type Errors = Partial<
  Record<'title' | 'starts_at' | 'ends_at' | 'consent_text' | 'fee_agorot', string>
>

/**
 * The two model validators, restated where a form can act on them, plus the required
 * fields the canvas never marks.
 *
 * Exported so the rules are testable without a render, and so there is exactly one place
 * that decides what this form refuses.
 */
export function validate(
  draft: {
    title: string
    startsAt: string
    endsAt: string
    requiresConsent: boolean
    consentText: string
    charges: boolean
    fee: string
  },
  locale: Locale,
): Errors {
  const errors: Errors = {}
  if (!draft.title.trim()) errors.title = t(locale, 'events.form.required')
  if (!draft.startsAt) errors.starts_at = t(locale, 'events.form.required')
  // Only when an end is given: `EventCreateIn.ends_at` is nullable and the service supplies
  // one, because §5.8 lets a manager pencil in a date before the schedule is settled.
  if (draft.endsAt && draft.startsAt && draft.endsAt <= draft.startsAt) {
    errors.ends_at = t(locale, 'events.form.endBeforeStart')
  }
  if (draft.requiresConsent && !draft.consentText.trim()) {
    errors.consent_text = t(locale, 'events.consent.textRequired')
  }
  if (draft.charges) {
    // `parseShekels` is the only parser -- a hand-rolled `Number(fee) * 100` is where a
    // price becomes a float, and G2 says money is counted rather than measured. It throws
    // on an empty string as well as on nonsense, which is the same answer here: a charge
    // toggle turned on with no amount is a required field left blank.
    try {
      parseShekels(draft.fee)
    } catch {
      errors.fee_agorot = t(locale, 'events.form.required')
    }
  }
  return errors
}

/** The canvas's own default chip — כל הקבוצות — and the safer of the two wrong answers: an
 *  event that reached everyone is visible and fixable, one that reached nobody looks exactly
 *  like a successful publish. */
export const DEFAULT_TARGETS: EventTargetOut[] = [{ target_type: 'studio', target_id: null }]

export function EventForm({
  client,
  initialTargets = DEFAULT_TARGETS,
  locale,
  onSaved,
}: {
  client: DashboardEventsClient
  /** §5.8's targeting, as the form OPENS. It was a fixed `targets` prop and every caller
   *  passed `[]`, which is why nothing the dashboard published ever reached anybody; the
   *  audience is now edited here, on the screen that decides it. */
  initialTargets?: EventTargetOut[]
  locale: Locale
  onSaved: (eventId: string) => void
}) {
  const [type, setType] = useState<EventType>('competition')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [atClub, setAtClub] = useState('club')
  const [locationText, setLocationText] = useState('')
  const [rsvpDeadline, setRsvpDeadline] = useState('')
  const [requiresConsent, setRequiresConsent] = useState(false)
  const [consentText, setConsentText] = useState('')
  const [charges, setCharges] = useState(false)
  const [fee, setFee] = useState('')
  const [targets, setTargets] = useState<EventTargetOut[]>(initialTargets)
  // The preview is a landmark, not a decoration: `aria-labelledby` on the section makes it
  // a named region a screen reader can jump to and leave, which is the whole difference
  // between "a copy of the parent's screen" and an unexplained second card.
  const previewHeadingId = useId()
  const [errors, setErrors] = useState<Errors>({})
  const [failed, setFailed] = useState(false)
  // Separate from `Errors`, which is keyed by field: the audience is a whole section rather
  // than an input, and there is nothing for `aria-describedby` to point at.
  const [reachesNobodyOnPublish, setReachesNobodyOnPublish] = useState(false)
  const [registered, setRegistered] = useState<number | null>(null)

  const draft = { title, startsAt, endsAt, requiresConsent, consentText, charges, fee }

  const body = (): EventCreateIn => ({
    type,
    title: title.trim(),
    description: description.trim() || null,
    starts_at: new Date(startsAt).toISOString(),
    ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    location_id: null,
    // §5.8's external venue. A competition in another city is not one of the studio's own
    // locations, which is why this is free text rather than a picklist.
    location_text: atClub === 'club' ? null : locationText.trim() || null,
    rsvp_deadline: rsvpDeadline ? new Date(rsvpDeadline).toISOString() : null,
    // NULL is a free event and zero is not — a zero-fee event would create a zero charge
    // and a receipt for nothing. G2: the wire carries agorot, never shekels.
    fee_agorot: charges ? parseShekels(fee) : null,
    requires_consent: requiresConsent,
    consent_text: requiresConsent ? consentText.trim() : null,
    targets,
  })

  const submit = async (thenPublish: boolean) => {
    const found = validate(draft, locale)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    // A DRAFT with no audience is an ordinary half-built event and saves freely. Publishing
    // one is the unrecoverable version: `EventPublishService.publish` materialises the
    // roster exactly once and refuses a second publish, so an event published to nobody can
    // never be invited to anybody -- and it returns 200 and looks like it worked.
    setReachesNobodyOnPublish(thenPublish && reachesNobody(targets))
    if (thenPublish && reachesNobody(targets)) return
    setFailed(false)
    try {
      const created = await client.create(body())
      if (thenPublish) {
        const published = await client.publish(created.id)
        setRegistered(published.registrations_created)
      }
      onSaved(created.id)
    } catch {
      // Not the exception's message: a 409's text is not copy (§11.7).
      setFailed(true)
    }
  }

  return (
    <div style={columnStyle}>
      <h2 style={{ margin: 0 }}>{t(locale, 'events.form.title')}</h2>

      {failed ? (
        <Alert iconLabel={t(locale, 'events.form.errorTitle')} live tone="danger">
          {t(locale, 'events.form.errorTitle')}
        </Alert>
      ) : null}

      {/* `live`: this one appears in response to the press, unlike the picker's own
          standing warning, and a manager who just pressed פרסום needs telling. */}
      {reachesNobodyOnPublish ? (
        <Alert iconLabel={t(locale, 'events.target.title')} live tone="danger">
          {t(locale, 'events.target.required')}
        </Alert>
      ) : null}

      <div style={splitStyle}>
        <div style={columnStyle}>
          <Card>
            {/* Radio inside Card: each option carries a title, and SegmentedControl cannot.
            The audit's own mapping. */}
            {/* `role="radiogroup"` explicitly: a bare fieldset maps to `group`, which tells a
            screen reader these controls belong together but not that exactly one of them
            will be chosen. The legend names it either way. */}
            <fieldset role="radiogroup" style={typeGridStyle}>
              <legend style={legendStyle}>{t(locale, 'events.form.type')}</legend>
              {EVENT_TYPES.map((member) => (
                <Radio
                  checked={type === member}
                  key={member}
                  label={t(locale, `events.type.${member}`)}
                  name="event-type"
                  onChange={() => setType(member)}
                  value={member}
                />
              ))}
            </fieldset>
          </Card>

          <Card>
            <div style={columnStyle}>
              <TextField
                error={errors.title}
                label={t(locale, 'events.form.name')}
                onChange={(e) => setTitle(e.target.value)}
                value={title}
              />
              <div style={fieldRowStyle}>
                <TextField
                  error={errors.starts_at}
                  label={t(locale, 'events.form.startsAt')}
                  onChange={(e) => setStartsAt(e.target.value)}
                  type="datetime-local"
                  value={startsAt}
                />
                <TextField
                  error={errors.ends_at}
                  label={t(locale, 'events.form.endsAt')}
                  onChange={(e) => setEndsAt(e.target.value)}
                  type="datetime-local"
                  value={endsAt}
                />
                <TextField
                  label={t(locale, 'events.form.rsvpDeadline')}
                  onChange={(e) => setRsvpDeadline(e.target.value)}
                  type="datetime-local"
                  value={rsvpDeadline}
                />
              </div>

              <SegmentedControl
                legend={t(locale, 'events.form.location')}
                onValueChange={setAtClub}
                options={[
                  { value: 'club', label: t(locale, 'events.form.locationClub') },
                  { value: 'external', label: t(locale, 'events.form.locationExternal') },
                ]}
                value={atClub}
              />
              {atClub === 'external' ? (
                <TextField
                  hint={t(locale, 'events.form.locationExternalHint')}
                  label={t(locale, 'events.form.locationExternal')}
                  onChange={(e) => setLocationText(e.target.value)}
                  value={locationText}
                />
              ) : null}
            </div>
          </Card>

          {/* מי מוזמן. The field the form did not have, and the reason a published event
          reached nobody. */}
          <EventTargetPicker
            client={client}
            locale={locale}
            onChange={setTargets}
            value={targets}
          />

          <Card>
            <div style={columnStyle}>
              <Switch
                checked={requiresConsent}
                label={t(locale, 'events.consent.required')}
                onCheckedChange={setRequiresConsent}
                stateLabels={{
                  on: t(locale, 'events.consent.required'),
                  off: t(locale, 'events.consent.required'),
                }}
              />
              {requiresConsent ? (
                <>
                  {/* 7b finding 10 — the key exists and the canvas does not draw it, on the
                  screen that configures the thing it describes. */}
                  <p style={hintStyle}>{t(locale, 'events.consent.blocksConfirmation')}</p>
                  <TextField
                    error={errors.consent_text}
                    label={t(locale, 'events.consent.text')}
                    maxLength={4000}
                    multiline
                    onChange={(e) => setConsentText(e.target.value)}
                    rows={4}
                    value={consentText}
                  />
                </>
              ) : null}

              <Switch
                checked={charges}
                label={t(locale, 'events.fee.label')}
                onCheckedChange={setCharges}
                stateLabels={{
                  on: t(locale, 'events.fee.label'),
                  off: t(locale, 'events.fee.free'),
                }}
              />
              {charges ? (
                <>
                  <p style={hintStyle}>{t(locale, 'events.fee.chargeOnConfirm')}</p>
                  <TextField
                    error={errors.fee_agorot}
                    inputMode="decimal"
                    label={t(locale, 'events.fee.label')}
                    onChange={(e) => setFee(e.target.value)}
                    value={fee}
                  />
                </>
              ) : null}
            </div>
          </Card>
        </div>

        <aside style={asideStyle}>
          {/* פרטים להורים. One field where the canvas draws two — see the module docstring
              on why איסוף וסיום is a cut rather than a second half of one column. */}
          <Card>
            <div style={columnStyle}>
              <h3 style={{ fontSize: 'var(--text-title)', margin: 0 }}>
                {t(locale, 'events.parentDetails.title')}
              </h3>
              {/* Multi-line: 7b's what-to-bring copy is a paragraph a parent reads. */}
              <TextField
                hint={t(locale, 'events.parentDetails.hint')}
                label={t(locale, 'events.parentDetails.field')}
                maxLength={4000}
                multiline
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                value={description}
              />
            </div>
          </Card>

          <section aria-labelledby={previewHeadingId}>
            <h3 id={previewHeadingId} style={{ fontSize: 'var(--text-title)', margin: 0 }}>
              {t(locale, 'events.preview.title')}
            </h3>
            <p style={hintStyle}>{t(locale, 'events.preview.hint')}</p>
            <EventPreviewCard
              draft={{
                charges,
                consentText,
                description,
                endsAt,
                fee,
                locationText: atClub === 'external' ? locationText : '',
                requiresConsent,
                startsAt,
                targets,
                title,
                type,
              }}
              locale={locale}
            />
          </section>
        </aside>
      </div>

      {registered !== null ? (
        <p style={hintStyle}>
          {t(locale, 'events.published')} · {registered}
        </p>
      ) : null}

      <div style={actionsStyle}>
        <Button onClick={() => void submit(false)} variant="secondary">
          {t(locale, 'events.form.save')}
        </Button>
        <Button onClick={() => void submit(true)} variant="primary">
          {t(locale, 'events.publish')}
        </Button>
      </div>
    </div>
  )
}
