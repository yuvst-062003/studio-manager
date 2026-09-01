// Step 1 of `הסכם הרשמה` — the club's `טופס הרשמה` blocks 1-4.
//
// **Six required fields, not fourteen.** The paper page asks for a lot, and most of it the app
// already knows or does not need to block on: the child's name and birthdate are pre-filled from
// the record and confirmed rather than typed, and the second parent, the landline, the student's
// own email, the pickup contacts and the aliyah year are all optional — none is needed to insure
// a child or to reach a guardian, and a required field nobody can answer is where a hard gate
// turns into a phone call to the club.
//
// **The ת.ז. is checked here and again on the server.** See `nationalId.ts`: a mistyped ID looks
// exactly like a real one, and learning about it in a 422 after signing is worse than learning
// about it under your thumb.
//
// **G7 applies.** Nothing here logs. The ת.ז., the address and the pickup contacts go into the
// request body and nowhere else; this component owns the draft and hands it over once.
import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Alert, Button, Card, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { isValidNationalId } from './nationalId'
import type { RegistrationIn } from './healthClient'

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '34rem',
  marginInline: 'auto',
  inlineSize: '100%',
}

const fieldsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

const pickupRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  alignItems: 'flex-end',
}

export type PickupDraft = { name: string; phone: string }

export type RegistrationStepProps = {
  locale: Locale
  studentName: string
  onSubmit: (body: RegistrationIn) => void
  onBack?: () => void
  sending?: boolean
  /** A failed save. The step stays on screen with what was typed still in it. */
  error?: string
  /**
   * Whether this student is asked for `כיתה/גן`. Comes from `agreementStatus`, never
   * derived here: a school class is a fact about a school-age child, and the only way to
   * know this student is an adult who is their own guardian is the guardian rows, which
   * the client cannot see. Defaulting to `true` keeps every existing caller unchanged.
   */
  schoolClassRequired?: boolean
}

const EMPTY_PICKUP: PickupDraft = { name: '', phone: '' }

export function RegistrationStep({
  locale,
  studentName,
  onSubmit,
  onBack,
  sending = false,
  error,
  schoolClassRequired = true,
}: RegistrationStepProps) {
  const [childId, setChildId] = useState('')
  const [grade, setGrade] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [phoneHome, setPhoneHome] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [signerId, setSignerId] = useState('')
  const [aliyahYear, setAliyahYear] = useState('')
  const [otherFirst, setOtherFirst] = useState('')
  const [otherLast, setOtherLast] = useState('')
  const [otherId, setOtherId] = useState('')
  const [otherPhone, setOtherPhone] = useState('')
  const [pickups, setPickups] = useState<PickupDraft[]>([EMPTY_PICKUP])
  const [showErrors, setShowErrors] = useState(false)

  const idError = (value: string, required: boolean): string | undefined => {
    if (!showErrors) return undefined
    if (value.trim() === '') {
      return required ? t(locale, 'health.registration.required') : undefined
    }
    return isValidNationalId(value) ? undefined : t(locale, 'health.registration.nationalIdInvalid')
  }

  const requiredError = (value: string): string | undefined =>
    showErrors && value.trim() === '' ? t(locale, 'health.registration.required') : undefined

  const valid =
    isValidNationalId(childId) &&
    isValidNationalId(signerId) &&
    (!schoolClassRequired || grade.trim() !== '') &&
    address.trim() !== '' &&
    city.trim() !== '' &&
    // An optional field that was filled in still has to be right. A second parent's ת.ז. with
    // a typo is exactly as wrong as the child's; it is only optional to PROVIDE.
    (otherId.trim() === '' || isValidNationalId(otherId))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setShowErrors(true)
    if (!valid || sending) return
    const contacts = pickups
      .map((entry) => ({ name: entry.name.trim(), phone: entry.phone.trim() }))
      // A repeatable row the parent tabbed past is not a person.
      .filter((entry) => entry.name !== '')
    onSubmit({
      child: {
        national_id: childId.trim(),
        address: address.trim(),
        city: city.trim(),
        grade: grade.trim(),
        phone_home: phoneHome.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
      },
      signer: {
        national_id: signerId.trim(),
        aliyah_year: aliyahYear.trim() || null,
        first_name: null,
        last_name: null,
        phone: null,
      },
      other_parent: otherFirst.trim()
        ? {
            first_name: otherFirst.trim(),
            last_name: otherLast.trim() || null,
            national_id: otherId.trim() || null,
            phone: otherPhone.trim() || null,
            aliyah_year: null,
          }
        : null,
      pickup_contacts: contacts.map((entry) => ({ ...entry, relation: null })),
    })
  }

  const optional = t(locale, 'health.registration.optional')

  return (
    <form onSubmit={submit} style={formStyle}>
      <header>
        {/* h2, not h1: `AgreementFlow` renders the <h1> above this and a second top-level
            heading makes a screen-reader user hear the page start twice. */}
        <h2>{t(locale, 'health.registration.title')}</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          {t(locale, 'health.declaration.forChild')} <bdi>{studentName}</bdi>
        </p>
      </header>

      <Card>
        <h3>{t(locale, 'health.registration.student')}</h3>
        <div style={fieldsStyle}>
          <TextField
            error={idError(childId, true)}
            inputMode="numeric"
            label={t(locale, 'health.registration.nationalId')}
            onChange={(event) => setChildId(event.target.value)}
            value={childId}
          />
          {/* Not rendered at all for an adult rather than shown and made optional: a grown
              student asked which class they are in at school reads as a broken form, and an
              optional field nobody can answer still invites them to try. */}
          {schoolClassRequired ? (
            <TextField
              error={requiredError(grade)}
              label={t(locale, 'health.registration.grade')}
              onChange={(event) => setGrade(event.target.value)}
              value={grade}
            />
          ) : null}
          <TextField
            error={requiredError(address)}
            label={t(locale, 'health.registration.address')}
            onChange={(event) => setAddress(event.target.value)}
            value={address}
          />
          <TextField
            error={requiredError(city)}
            label={t(locale, 'health.registration.city')}
            onChange={(event) => setCity(event.target.value)}
            value={city}
          />
          <TextField
            hint={optional}
            inputMode="tel"
            label={t(locale, 'health.registration.phoneHome')}
            onChange={(event) => setPhoneHome(event.target.value)}
            value={phoneHome}
          />
          <TextField
            hint={optional}
            inputMode="tel"
            label={t(locale, 'health.registration.phoneMobile')}
            onChange={(event) => setPhone(event.target.value)}
            value={phone}
          />
          <TextField
            hint={optional}
            inputMode="email"
            label={t(locale, 'health.registration.email')}
            onChange={(event) => setEmail(event.target.value)}
            value={email}
          />
        </div>
      </Card>

      <Card>
        <h3>{t(locale, 'health.registration.parents')}</h3>
        <div style={fieldsStyle}>
          <TextField
            error={idError(signerId, true)}
            inputMode="numeric"
            label={t(locale, 'health.registration.nationalId')}
            onChange={(event) => setSignerId(event.target.value)}
            value={signerId}
          />
          <TextField
            hint={t(locale, 'health.registration.aliyahYearHint')}
            inputMode="numeric"
            label={t(locale, 'health.registration.aliyahYear')}
            onChange={(event) => setAliyahYear(event.target.value)}
            value={aliyahYear}
          />
          <TextField
            hint={optional}
            label={`${t(locale, 'health.registration.otherParent')} · ${t(locale, 'health.registration.motherName')}`}
            onChange={(event) => setOtherFirst(event.target.value)}
            value={otherFirst}
          />
          <TextField
            hint={optional}
            label={t(locale, 'health.registration.fatherName')}
            onChange={(event) => setOtherLast(event.target.value)}
            value={otherLast}
          />
          <TextField
            error={idError(otherId, false)}
            hint={optional}
            inputMode="numeric"
            label={`${t(locale, 'health.registration.otherParent')} · ${t(locale, 'health.registration.nationalId')}`}
            onChange={(event) => setOtherId(event.target.value)}
            value={otherId}
          />
          <TextField
            hint={optional}
            inputMode="tel"
            label={`${t(locale, 'health.registration.otherParent')} · ${t(locale, 'health.registration.phoneMobile')}`}
            onChange={(event) => setOtherPhone(event.target.value)}
            value={otherPhone}
          />
        </div>
      </Card>

      <Card>
        <h3>{t(locale, 'health.registration.pickup')}</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>
          {t(locale, 'health.registration.pickupHint')}
        </p>
        <div style={fieldsStyle}>
          {pickups.map((entry, index) => (
            // The index as a key: these rows have no id until they are saved, and reordering
            // is not offered, so it is stable for as long as the list exists. Removal splices
            // the array, which React handles by re-rendering the tail — acceptable for a list
            // that is at most a handful of contacts and holds no focus across a delete.
            <div key={index} style={pickupRowStyle}>
              <div style={{ flex: '1 1 12rem' }}>
                <TextField
                  label={t(locale, 'health.registration.pickup')}
                  onChange={(event) =>
                    setPickups((rows) =>
                      rows.map((row, at) =>
                        at === index ? { ...row, name: event.target.value } : row,
                      ),
                    )
                  }
                  value={entry.name}
                />
              </div>
              <div style={{ flex: '1 1 10rem' }}>
                <TextField
                  inputMode="tel"
                  label={t(locale, 'health.registration.phoneMobile')}
                  onChange={(event) =>
                    setPickups((rows) =>
                      rows.map((row, at) =>
                        at === index ? { ...row, phone: event.target.value } : row,
                      ),
                    )
                  }
                  value={entry.phone}
                />
              </div>
              {pickups.length > 1 ? (
                <Button
                  onClick={() => setPickups((rows) => rows.filter((_, at) => at !== index))}
                  type="button"
                  variant="ghost"
                >
                  {t(locale, 'health.registration.pickupRemove')}
                </Button>
              ) : null}
            </div>
          ))}
          <Button
            onClick={() => setPickups((rows) => [...rows, { ...EMPTY_PICKUP }])}
            type="button"
            variant="secondary"
          >
            {t(locale, 'health.registration.pickupAdd')}
          </Button>
        </div>
      </Card>

      {showErrors && !valid ? (
        <Alert iconLabel={t(locale, 'health.registration.required')} live tone="danger">
          {t(locale, 'health.registration.required')}
        </Alert>
      ) : null}
      {error ? (
        <Alert iconLabel={error} live tone="danger">
          {error}
        </Alert>
      ) : null}

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {onBack ? (
          <Button onClick={onBack} type="button" variant="ghost">
            {t(locale, 'health.agreement.back')}
          </Button>
        ) : null}
        <Button disabled={sending} type="submit" variant="primary">
          {t(locale, 'health.agreement.next')}
        </Button>
      </div>
    </form>
  )
}
