import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, Card, Checkbox, SegmentedControl, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { isValidNationalId } from '../health/nationalId'
import {
  emptySubjectRow,
  familyFormValid,
  hasSharedMinors,
  toJoinFamilyPayload,
  type SubjectRow,
} from './familyDraft'
import { OnboardingWizardChrome, stepPosition } from './OnboardingWizardChrome'
import { WizardNavButtons } from './WizardNavButtons'

type JoinGroup = { id: string; name: string; weekdays: number[] }

export type GuardianRelation = 'mother' | 'father' | 'other'

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

const ageOptions = (locale: Locale) => [
  { value: 'yes', label: t(locale, 'health.declaration.yes') },
  { value: 'no', label: t(locale, 'health.declaration.no') },
]

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
  const [rows, setRows] = useState<SubjectRow[]>([])
  const [showErrors, setShowErrors] = useState(false)

  const shared = hasSharedMinors(rows)
  const hasSelf = rows.some((row) => row.kind === 'self')
  const optional = t(locale, 'people.join.optional')

  const state = {
    signerNationalId,
    address,
    city,
    phone,
    rows,
    otherFullName,
    otherNationalId,
    relation,
    phoneHome,
    aliyahYear,
    otherPhone,
    pickups,
  }
  const valid = familyFormValid(state)

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

  function updateRow(key: string, patch: Partial<SubjectRow>) {
    setRows((previous) => previous.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function submit() {
    setShowErrors(true)
    if (!valid || inFlight) return
    onSubmit(toJoinFamilyPayload(displayName, state))
  }

  return (
    <div data-testid="join-family-step">
      <OnboardingWizardChrome
        locale={locale}
        onBack={onBack}
        position={stepPosition('family')}
        title={t(locale, 'people.join.yourDetails')}
      >
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
          {shared ? (
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

        {/* Shared parent-info + pickup, once for every minor in the list -- no
            per-row "same as / different" toggle. `JoinFamilyPayload` carries exactly
            one `other_parent`/`pickup_contacts` pair for the whole submission, so a
            per-child divergence has nowhere to send its answer (2026-09-03
            correction). */}
        {shared ? (
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

        {shared ? (
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

        {/* The subject list -- empty by default (§Step 2 point 2). Two symmetric adds:
            "I train too" (reuses the signer's own name/id/address, only asks groups)
            and "+ add a child" (a full row). */}
        <div style={cardTint}>
          <Card>
            <h2 style={{ marginBlockStart: 0 }}>{t(locale, 'people.join.studentsTitle')}</h2>
            {rows.map((row, index) => (
              <div
                key={row.key}
                style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
              >
                {index > 0 ? <hr style={{ border: 0, borderTop: '1px solid var(--border)' }} /> : null}
                <div style={rowStyle}>
                  <h3 style={{ margin: 0, marginInlineEnd: 'auto' }}>
                    {row.kind === 'self'
                      ? t(locale, 'people.join.selfStudentAlso')
                      : `${t(locale, 'people.join.child')}`}
                  </h3>
                  <Button
                    onClick={() => setRows((prev) => prev.filter((entry) => entry.key !== row.key))}
                    type="button"
                    variant="ghost"
                  >
                    {t(locale, 'people.join.removeChild')}
                  </Button>
                </div>
                {row.kind === 'child' ? (
                  <>
                    <SegmentedControl
                      legend={t(locale, 'people.join.age18Question')}
                      onValueChange={(value) => updateRow(row.key, { isAdult: value === 'yes' })}
                      options={ageOptions(locale)}
                      value={row.isAdult ? 'yes' : 'no'}
                    />
                    <div style={{ display: 'grid', gap: 'var(--space-3)', gridTemplateColumns: '1fr 1fr' }}>
                      <TextField
                        error={requiredError(row.firstName)}
                        label={t(locale, 'people.join.fullName')}
                        onChange={(event) => updateRow(row.key, { firstName: event.target.value })}
                        value={row.firstName}
                      />
                      <TextField
                        error={requiredError(row.birthdate)}
                        label={t(locale, 'people.join.birthdate')}
                        type="date"
                        onChange={(event) => updateRow(row.key, { birthdate: event.target.value })}
                        value={row.birthdate}
                      />
                    </div>
                    <div style={{ display: 'grid', gap: 'var(--space-3)', gridTemplateColumns: '1fr 1fr' }}>
                      <TextField
                        error={idError(row.nationalId, true)}
                        inputMode="numeric"
                        label={t(locale, 'people.join.nationalId')}
                        onChange={(event) => updateRow(row.key, { nationalId: event.target.value })}
                        value={row.nationalId}
                      />
                      <TextField
                        error={requiredError(row.grade)}
                        label={t(locale, 'people.join.grade')}
                        onChange={(event) => updateRow(row.key, { grade: event.target.value })}
                        value={row.grade}
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
                    checked={row.groupIds.includes(group.id)}
                    onChange={(event) =>
                      updateRow(row.key, {
                        groupIds: event.target.checked
                          ? [...row.groupIds, group.id]
                          : row.groupIds.filter((id) => id !== group.id),
                      })
                    }
                  />
                ))}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button
                data-testid="join-add-child"
                onClick={() => setRows((prev) => [...prev, emptySubjectRow('child')])}
                type="button"
                variant="secondary"
              >
                {t(locale, 'people.join.addChild')}
              </Button>
              {!hasSelf ? (
                <Button
                  data-testid="join-add-self"
                  onClick={() => setRows((prev) => [...prev, emptySubjectRow('self')])}
                  type="button"
                  variant="secondary"
                >
                  {t(locale, 'people.join.selfStudentAlso')}
                </Button>
              ) : null}
            </div>
          </Card>
        </div>

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
          forwardDisabled={inFlight}
          forwardTestId="join-submit"
          locale={locale}
          onBack={onBack}
          onForward={submit}
        />
      </OnboardingWizardChrome>
    </div>
  )
}
