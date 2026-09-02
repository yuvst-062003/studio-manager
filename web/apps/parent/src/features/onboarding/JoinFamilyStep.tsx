import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, Card, Checkbox, SegmentedControl, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { isValidNationalId } from '../health/nationalId'
import { OnboardingWizardChrome } from './OnboardingWizardChrome'
import { WizardNavButtons } from './WizardNavButtons'

type JoinGroup = { id: string; name: string; weekdays: number[] }

export type GuardianRelation = 'mother' | 'father' | 'other'

export type ChildDraft = {
  key: string
  firstName: string
  lastName: string
  birthdate: string
  groupIds: string[]
  selfStudent: boolean
  nationalId: string
  grade: string
}

export type JoinFamilyPayload = {
  first_name: string
  last_name: string
  phone: string | null
  signer: {
    national_id: string
    address: string
    city: string
    phone_home: string | null
    aliyah_year: string | null
    relation: GuardianRelation
  }
  other_parent: {
    first_name: string
    last_name: string | null
    national_id: string | null
    phone: string | null
  } | null
  pickup_contacts: { name: string; phone: string }[]
  children: {
    first_name: string
    last_name: string
    birthdate: string | null
    group_ids: string[]
    self_student: boolean
    national_id: string | null
    grade: string | null
  }[]
}

const cardTint: CSSProperties = {
  background: 'color-mix(in srgb, var(--pending) 6%, var(--surface))',
}

const muted: CSSProperties = { color: 'var(--text-muted)', margin: 0 }

const chipStyle: CSSProperties = {
  alignSelf: 'flex-start',
  background: 'color-mix(in srgb, var(--accent) 12%, var(--surface))',
  borderRadius: '999px',
  color: 'var(--accent)',
  fontSize: 'var(--text-caption)',
  fontWeight: 500,
  padding: 'var(--space-1) var(--space-3)',
}

const rowStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
}

const pickupRowStyle: CSSProperties = {
  alignItems: 'flex-end',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
}

function emptyChild(): ChildDraft {
  return {
    key: crypto.randomUUID(),
    firstName: '',
    lastName: '',
    birthdate: '',
    groupIds: [],
    selfStudent: false,
    nationalId: '',
    grade: '',
  }
}

function splitName(displayName: string): { first: string; last: string } {
  const parts = displayName.trim().split(/\s+/)
  if (parts.length === 0) return { first: '', last: '' }
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') }
}

function weekdaysLabel(locale: Locale, weekdays: number[]): string {
  return weekdays.map((day) => t(locale, `schedule.weekday.${day}`)).join('·')
}

function relationOptions(locale: Locale) {
  return [
    { value: 'mother', label: t(locale, 'people.join.relation.mother') },
    { value: 'father', label: t(locale, 'people.join.relation.father') },
    { value: 'other', label: t(locale, 'people.join.relation.other') },
  ]
}

export type JoinFamilyStepProps = {
  displayName: string
  email: string | null
  error?: string | null
  groups: JoinGroup[]
  inFlight?: boolean
  locale: Locale
  onBack: () => void
  onSubmit: (payload: JoinFamilyPayload) => void
}

export function JoinFamilyStep({
  displayName,
  email,
  error,
  groups,
  inFlight = false,
  locale,
  onBack,
  onSubmit,
}: JoinFamilyStepProps) {
  const parsed = useMemo(() => splitName(displayName), [displayName])
  const [phone, setPhone] = useState('')
  const [signerNationalId, setSignerNationalId] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [phoneHome, setPhoneHome] = useState('')
  const [aliyahYear, setAliyahYear] = useState('')
  const [relation, setRelation] = useState<GuardianRelation>('mother')
  const [otherFullName, setOtherFullName] = useState('')
  const [otherNationalId, setOtherNationalId] = useState('')
  const [otherPhone, setOtherPhone] = useState('')
  const [pickups, setPickups] = useState([{ name: '', phone: '' }])
  const [children, setChildren] = useState<ChildDraft[]>([emptyChild()])
  const [showErrors, setShowErrors] = useState(false)

  const hasMinorChildren = children.some((child) => !child.selfStudent)
  const adultOnly = children.length > 0 && children.every((child) => child.selfStudent)
  const optional = t(locale, 'people.join.optional')

  const otherParentLabel =
    relation === 'mother'
      ? t(locale, 'people.join.relation.father')
      : relation === 'father'
        ? t(locale, 'people.join.relation.mother')
        : t(locale, 'health.registration.otherParent')

  const idError = (value: string, required: boolean): string | undefined => {
    if (!showErrors) return undefined
    if (value.trim() === '') return required ? t(locale, 'people.join.required') : undefined
    return isValidNationalId(value) ? undefined : t(locale, 'people.join.nationalIdInvalid')
  }

  const requiredError = (value: string): string | undefined =>
    showErrors && value.trim() === '' ? t(locale, 'people.join.required') : undefined

  const valid = useMemo(() => {
    if (
      !isValidNationalId(signerNationalId) ||
      address.trim() === '' ||
      city.trim() === '' ||
      phone.trim() === ''
    ) {
      return false
    }
    if (hasMinorChildren) {
      if (relation === 'other') {
        if (otherFullName.trim() === '' || !isValidNationalId(otherNationalId)) return false
      } else if (otherNationalId.trim() !== '' && !isValidNationalId(otherNationalId)) {
        return false
      }
    }
    return children.every((child) => {
      if (child.groupIds.length === 0) return false
      if (child.selfStudent) return true
      return (
        child.firstName.trim() !== '' &&
        child.birthdate.trim() !== '' &&
        isValidNationalId(child.nationalId) &&
        child.grade.trim() !== ''
      )
    })
  }, [
    address,
    children,
    city,
    hasMinorChildren,
    otherFullName,
    otherNationalId,
    phone,
    relation,
    signerNationalId,
  ])

  function submit() {
    setShowErrors(true)
    if (!valid || inFlight) return
    const [otherFirst = '', ...otherRest] = otherFullName.trim().split(/\s+/)
    const pickupContacts = pickups
      .map((entry) => ({ name: entry.name.trim(), phone: entry.phone.trim() }))
      .filter((entry) => entry.name !== '')
    onSubmit({
      first_name: parsed.first,
      last_name: parsed.last,
      phone: phone.trim() || null,
      signer: {
        national_id: signerNationalId.trim(),
        address: address.trim(),
        city: city.trim(),
        phone_home: phoneHome.trim() || null,
        aliyah_year: aliyahYear.trim() || null,
        relation,
      },
      other_parent:
        hasMinorChildren && (otherFullName.trim() || relation === 'other')
          ? {
              first_name: otherFirst,
              last_name: otherRest.join(' ') || null,
              national_id: otherNationalId.trim() || null,
              phone: otherPhone.trim() || null,
            }
          : null,
      pickup_contacts: hasMinorChildren ? pickupContacts : [],
      children: children.map((child) => {
        if (child.selfStudent) {
          return {
            first_name: parsed.first,
            last_name: parsed.last,
            birthdate: null,
            group_ids: child.groupIds,
            self_student: true,
            national_id: null,
            grade: null,
          }
        }
        const [first = '', ...rest] = child.firstName.trim().split(/\s+/)
        return {
          first_name: first,
          last_name: rest.join(' ') || parsed.last,
          birthdate: child.birthdate || null,
          group_ids: child.groupIds,
          self_student: false,
          national_id: child.nationalId.trim() || null,
          grade: child.grade.trim() || null,
        }
      }),
    })
  }

  return (
    <div data-testid="join-family-step">
      <OnboardingWizardChrome
        locale={locale}
        onBack={onBack}
        position={3}
        title={
          adultOnly
            ? t(locale, 'people.join.yourDetailsSolo')
            : t(locale, 'people.join.yourDetails')
        }
      >
        {adultOnly ? <span style={chipStyle}>{t(locale, 'people.join.selfChip')}</span> : null}

        <Card>
          <h2 style={{ marginBlockStart: 0 }}>{t(locale, 'people.join.yourDetails')}</h2>
          <p style={rowStyle}>
            <span aria-hidden>✓</span>
            <strong>
              <bdi>{displayName}</bdi>
            </strong>
            <span style={{ ...muted, marginInlineStart: 'auto' }}>
              {t(locale, 'people.join.fromSignIn')}
            </span>
          </p>
          {hasMinorChildren ? (
            <SegmentedControl
              legend={t(locale, 'people.join.iAm')}
              onValueChange={(value) => setRelation(value as GuardianRelation)}
              options={relationOptions(locale)}
              value={relation}
            />
          ) : null}
          <TextField
            error={idError(signerNationalId, true)}
            inputMode="numeric"
            label={t(locale, 'people.join.nationalId')}
            onChange={(event) => setSignerNationalId(event.target.value)}
            value={signerNationalId}
          />
          <TextField
            error={requiredError(address)}
            label={t(locale, 'people.join.address')}
            onChange={(event) => setAddress(event.target.value)}
            value={address}
          />
          <div style={{ display: 'grid', gap: 'var(--space-3)', gridTemplateColumns: '1fr 1fr' }}>
            <TextField
              error={requiredError(city)}
              label={t(locale, 'people.join.city')}
              onChange={(event) => setCity(event.target.value)}
              value={city}
            />
            <TextField
              error={requiredError(phone)}
              inputMode="tel"
              label={t(locale, 'people.join.phone')}
              onChange={(event) => setPhone(event.target.value)}
              value={phone}
            />
          </div>
          <div style={{ display: 'grid', gap: 'var(--space-3)', gridTemplateColumns: '1fr 1fr' }}>
            <TextField
              hint={optional}
              inputMode="tel"
              label={t(locale, 'people.join.phoneHome')}
              onChange={(event) => setPhoneHome(event.target.value)}
              value={phoneHome}
            />
            <TextField
              hint={optional}
              inputMode="numeric"
              label={t(locale, 'people.join.aliyahYear')}
              onChange={(event) => setAliyahYear(event.target.value)}
              value={aliyahYear}
            />
          </div>
          {email ? (
            <p data-testid="join-email" style={muted}>
              <span aria-hidden>✓</span> <bdi>{email}</bdi> · {t(locale, 'people.join.verifiedEmail')}
            </p>
          ) : null}
        </Card>

        {hasMinorChildren ? (
          <Card>
            <div style={rowStyle}>
              <h2 style={{ margin: 0 }}>{otherParentLabel}</h2>
              <span style={{ ...muted, marginInlineStart: 'auto' }}>{optional}</span>
            </div>
            <TextField
              error={requiredError(otherFullName)}
              hint={relation === 'other' ? undefined : optional}
              label={t(locale, 'people.join.fullName')}
              onChange={(event) => setOtherFullName(event.target.value)}
              value={otherFullName}
            />
            <TextField
              error={idError(otherNationalId, relation === 'other')}
              hint={relation === 'other' ? undefined : optional}
              inputMode="numeric"
              label={t(locale, 'people.join.nationalId')}
              onChange={(event) => setOtherNationalId(event.target.value)}
              value={otherNationalId}
            />
            <TextField
              hint={optional}
              inputMode="tel"
              label={t(locale, 'people.join.phone')}
              onChange={(event) => setOtherPhone(event.target.value)}
              value={otherPhone}
            />
            {relation !== 'other' ? (
              <p style={{ ...muted, fontSize: 'var(--text-caption)' }}>
                {t(locale, 'people.join.oneParentEnough')}
              </p>
            ) : null}
          </Card>
        ) : null}

        {hasMinorChildren ? (
          <Card>
            <h2 style={{ marginBlockStart: 0 }}>{t(locale, 'people.join.pickupTitle')}</h2>
            <p style={{ ...muted, fontSize: 'var(--text-caption)' }}>
              {t(locale, 'people.join.pickupHint')}
            </p>
            {pickups.map((entry, index) => (
              <div key={index} style={pickupRowStyle}>
                <div style={{ flex: '1 1 12rem' }}>
                  <TextField
                    label={t(locale, 'people.join.fullName')}
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
                    label={t(locale, 'people.join.phone')}
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
                    {t(locale, 'people.join.removeChild')}
                  </Button>
                ) : null}
              </div>
            ))}
            <Button
              onClick={() => setPickups((rows) => [...rows, { name: '', phone: '' }])}
              type="button"
              variant="secondary"
            >
              {t(locale, 'health.registration.pickupAdd')}
            </Button>
            <p style={{ ...muted, fontSize: 'var(--text-caption)' }}>
              {t(locale, 'people.join.pickupAppliesAll')}
            </p>
          </Card>
        ) : null}

        <div style={cardTint}>
          <Card>
            <h2 style={{ marginBlockStart: 0 }}>{t(locale, 'people.join.studentsTitle')}</h2>
            {children.map((child, index) => (
              <div key={child.key} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {index > 0 ? <hr style={{ border: 0, borderTop: '1px solid var(--border)' }} /> : null}
              <div style={rowStyle}>
                <h3 style={{ margin: 0, marginInlineEnd: 'auto' }}>
                  {child.selfStudent
                    ? t(locale, 'people.join.selfStudentAlso')
                    : `${t(locale, 'people.join.child')}${children.length > 1 ? ` ${index + 1}` : ''}`}
                </h3>
                {children.length > 1 && !child.selfStudent ? (
                  <Button
                    onClick={() => setChildren((rows) => rows.filter((row) => row.key !== child.key))}
                    type="button"
                    variant="ghost"
                  >
                    {t(locale, 'people.join.removeChild')}
                  </Button>
                ) : null}
              </div>
              {!child.selfStudent ? (
                <>
                  <div style={{ display: 'grid', gap: 'var(--space-3)', gridTemplateColumns: '1fr 1fr' }}>
                    <TextField
                      error={requiredError(child.firstName)}
                      label={t(locale, 'people.join.fullName')}
                      onChange={(event) =>
                        setChildren((rows) =>
                          rows.map((row) =>
                            row.key === child.key ? { ...row, firstName: event.target.value } : row,
                          ),
                        )
                      }
                      value={child.firstName}
                    />
                    <TextField
                      error={requiredError(child.birthdate)}
                      label={t(locale, 'people.join.birthdate')}
                      type="date"
                      onChange={(event) =>
                        setChildren((rows) =>
                          rows.map((row) =>
                            row.key === child.key ? { ...row, birthdate: event.target.value } : row,
                          ),
                        )
                      }
                      value={child.birthdate}
                    />
                  </div>
                  <div style={{ display: 'grid', gap: 'var(--space-3)', gridTemplateColumns: '1fr 1fr' }}>
                    <TextField
                      error={idError(child.nationalId, true)}
                      inputMode="numeric"
                      label={t(locale, 'people.join.nationalId')}
                      onChange={(event) =>
                        setChildren((rows) =>
                          rows.map((row) =>
                            row.key === child.key ? { ...row, nationalId: event.target.value } : row,
                          ),
                        )
                      }
                      value={child.nationalId}
                    />
                    <TextField
                      error={requiredError(child.grade)}
                      label={t(locale, 'people.join.grade')}
                      onChange={(event) =>
                        setChildren((rows) =>
                          rows.map((row) =>
                            row.key === child.key ? { ...row, grade: event.target.value } : row,
                          ),
                        )
                      }
                      value={child.grade}
                    />
                  </div>
                </>
              ) : (
                <p style={{ ...muted, fontSize: 'var(--text-caption)' }}>
                  {t(locale, 'people.join.selfStudentHint')}
                </p>
              )}
              <p style={{ margin: 0, fontWeight: 500 }}>{t(locale, 'people.join.groups')}</p>
              {groups.map((group) => (
                <Checkbox
                  key={group.id}
                  label={`${group.name} · ${weekdaysLabel(locale, group.weekdays)}`}
                  checked={child.groupIds.includes(group.id)}
                  onChange={(event) =>
                    setChildren((rows) =>
                      rows.map((row) =>
                        row.key === child.key
                          ? {
                              ...row,
                              groupIds: event.target.checked
                                ? [...row.groupIds, group.id]
                                : row.groupIds.filter((id) => id !== group.id),
                            }
                          : row,
                      ),
                    )
                  }
                />
              ))}
              </div>
            ))}
            <Button
              onClick={() => setChildren((rows) => [...rows, emptyChild()])}
              type="button"
              variant="secondary"
            >
              {t(locale, 'people.join.addChild')}
            </Button>
            <Checkbox
              checked={children.some((child) => child.selfStudent)}
              label={t(locale, 'people.join.selfStudentAlso')}
              onChange={(event) => {
                const checked = event.target.checked
                setChildren((rows) => {
                  const withoutSelf = rows.filter((row) => !row.selfStudent)
                  if (!checked) return withoutSelf.length > 0 ? withoutSelf : [emptyChild()]
                  return [
                    ...withoutSelf,
                    {
                      key: crypto.randomUUID(),
                      firstName: parsed.first,
                      lastName: parsed.last,
                      birthdate: '',
                      groupIds: [],
                      selfStudent: true,
                      nationalId: '',
                      grade: '',
                    },
                  ]
                })
              }}
            />
          </Card>
        </div>

        {adultOnly ? (
          <div style={cardTint}>
            <Card>
              <p style={{ ...muted, lineHeight: 1.65 }}>{t(locale, 'people.join.soloNote')}</p>
            </Card>
          </div>
        ) : null}

        {showErrors && !valid ? (
          <Alert iconLabel={t(locale, 'people.join.required')} live tone="danger">
            {t(locale, 'people.join.required')}
          </Alert>
        ) : null}
        {error ? (
          <Alert iconLabel={t(locale, 'people.join.title')} live tone="danger">
            {error}
          </Alert>
        ) : null}

        <WizardNavButtons
          forwardDisabled={!valid || inFlight}
          forwardTestId="join-submit"
          locale={locale}
          onBack={onBack}
          onForward={submit}
        />
      </OnboardingWizardChrome>
    </div>
  )
}
