import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiFetch } from '@studio/core'
import { Alert, Button, Card, Checkbox, MoneyDisplay, Radio, SegmentedControl, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { isValidNationalId } from '../health/nationalId'
import {
  coveringPlans,
  emptySubjectRow,
  familyFormValid,
  hasPreviousMinor,
  hasSharedMinors,
  isRowAdult,
  preselectedPlanId,
  resolveRowFamily,
  toJoinFamilyPayload,
  weeklyVolumeForGroups,
  type FamilyPayloadState,
  type PlanOption,
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
  children: {
    first_name: string
    last_name: string
    birthdate: string | null
    group_ids: string[]
    self_student: boolean
    national_id: string | null
    grade: string | null
    /** Decision 14 -- this student's own plan, or `null` when none covers their groups. */
    price_plan_id: string | null
    /** F7 -- per student. `null` for a `self` row or a row 18 or older. */
    other_parent: {
      first_name: string
      last_name: string | null
      national_id: string | null
      phone: string | null
    } | null
    pickup_contacts: { name: string; phone: string }[]
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

const summaryRowStyle: CSSProperties = {
  ...rowStyle,
  justifyContent: 'space-between',
}

const fieldGrid2: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-3)',
  gridTemplateColumns: '1fr 1fr',
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

/** The collapsed list row's summary line -- groups, then the picked plan if any. Empty
 *  strings for anything not chosen yet, joined with the same separator the group picker
 *  itself uses, so an unfinished row reads as "nothing yet" rather than a stray dot. */
function rowSummary(locale: Locale, row: SubjectRow, groups: JoinGroup[], plans: PlanOption[]): string {
  const groupNames = row.groupIds
    .map((id) => groups.find((group) => group.id === id)?.name)
    .filter((name): name is string => Boolean(name))
  const plan = plans.find((candidate) => candidate.id === row.pricePlanId)
  const parts = [groupNames.join(' · '), plan?.name].filter((part): part is string => Boolean(part))
  return parts.join(' · ')
}

function rowDisplayName(locale: Locale, row: SubjectRow, displayName: string): string {
  if (row.kind === 'self') return displayName
  const full = `${row.firstName} ${row.lastName}`.trim()
  return full || t(locale, 'people.join.child')
}

export type JoinFamilyStepProps = {
  displayName: string
  email: string | null
  error?: string | null
  groups: JoinGroup[]
  inFlight?: boolean
  /** Restores a draft saved before the tab closed (Phase 5's sessionStorage draft).
   *  Seeds every field's initial state; ignored after the first render. */
  initialValue?: FamilyPayloadState | null
  locale: Locale
  onBack: () => void
  /** Fired on every change, so the caller can save a draft as the family types --
   *  not just on submit. Not required: a caller with no draft persistence (there is
   *  currently only the one) can leave it out. */
  onChange?: (state: FamilyPayloadState) => void
  onSubmit: (payload: JoinFamilyPayload) => void
  /** §6 -- the join token, resolving this studio's own live plan list
   *  (`GET /public/onboarding/{token}/price-plans`), the plan picker's data source. */
  token: string
}

export function JoinFamilyStep({
  displayName,
  email,
  error,
  groups,
  inFlight = false,
  initialValue,
  locale,
  onBack,
  onChange,
  onSubmit,
  token,
}: JoinFamilyStepProps) {
  const [phone, setPhone] = useState(initialValue?.phone ?? '')
  const [signerNationalId, setSignerNationalId] = useState(initialValue?.signerNationalId ?? '')
  const [address, setAddress] = useState(initialValue?.address ?? '')
  const [city, setCity] = useState(initialValue?.city ?? '')
  const [phoneHome, setPhoneHome] = useState(initialValue?.phoneHome ?? '')
  const [aliyahYear, setAliyahYear] = useState(initialValue?.aliyahYear ?? '')
  const [relation, setRelation] = useState<GuardianRelation>(initialValue?.relation ?? 'mother')
  const [rows, setRows] = useState<SubjectRow[]>(initialValue?.rows ?? [])
  const [showErrors, setShowErrors] = useState(false)
  // F6 -- one panel open at a time. `null` means every row renders collapsed, in the list.
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [plans, setPlans] = useState<PlanOption[]>([])

  useEffect(() => {
    let alive = true
    void apiFetch(`/api/v1/public/onboarding/${token}/price-plans`)
      .then(async (response) => {
        if (!alive || !response.ok) return
        const body = (await response.json()) as {
          items: {
            id: string
            name: string
            monthly_amount_agorot: number
            sessions_per_week: number | null
          }[]
        }
        if (!alive) return
        setPlans(
          body.items.map((item) => ({
            id: item.id,
            name: item.name,
            monthlyAmountAgorot: item.monthly_amount_agorot,
            sessionsPerWeek: item.sessions_per_week,
          })),
        )
      })
      .catch(() => {
        // No plans is a real answer (a studio with none live yet) -- the picker then
        // offers nothing and every row stays unpriced, same as the server's own
        // `plan_for_volume` fallback. Not a reason to block the rest of the step.
      })
    return () => {
      alive = false
    }
  }, [token])

  const shared = hasSharedMinors(rows)
  const hasSelf = rows.some((row) => row.kind === 'self')
  const optional = t(locale, 'people.join.optional')

  const state = { signerNationalId, address, city, phone, rows, relation, phoneHome, aliyahYear }
  const valid = familyFormValid(state)

  useEffect(() => {
    onChange?.(state)
    // `state` is a fresh object every render; the primitives/arrays it is built from
    // are the real dependency list, so listing `state` itself would fire on every
    // render regardless of whether anything changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signerNationalId, address, city, phone, rows, relation, phoneHome, aliyahYear, onChange])

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

  /** Groups changed on a row -- recompute its volume and, if the currently held plan (if
   *  any) no longer covers it, replace it with the new preselected covering plan (or
   *  `null` when nothing covers). A plan that DOES still cover is left alone: this is
   *  what keeps a deliberate pick among several covering options from being silently
   *  reset every time an unrelated group checkbox is touched. */
  function updateGroups(row: SubjectRow, groupIds: string[]) {
    const volume = weeklyVolumeForGroups(groupIds, groups)
    const covering = coveringPlans(volume, plans)
    const stillCovers = covering.some((plan) => plan.id === row.pricePlanId)
    updateRow(row.key, {
      groupIds,
      pricePlanId: stillCovers ? row.pricePlanId : preselectedPlanId(volume, plans),
    })
  }

  function addRow(kind: 'self' | 'child') {
    const row = emptySubjectRow(kind, kind === 'child' && hasPreviousMinor(rows))
    setRows((previous) => [...previous, row])
    setEditingKey(row.key)
  }

  function removeRow(key: string) {
    setRows((previous) => previous.filter((row) => row.key !== key))
    setEditingKey((current) => (current === key ? null : current))
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
          <div style={fieldGrid2}>
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
          <div style={fieldGrid2}>
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

        {/* F6 -- a list of saved (collapsed) students, "+ הוספת תלמיד" opens one panel at
            a time. Save returns to the list; the next add opens the next panel. */}
        <div style={cardTint}>
          <Card>
            <h2 style={{ marginBlockStart: 0 }}>{t(locale, 'people.join.studentsTitle')}</h2>
            {rows.map((row, index) => {
              const isMinor = row.kind === 'child' && !isRowAdult(row)
              const volume = weeklyVolumeForGroups(row.groupIds, groups)
              const covering = coveringPlans(volume, plans)
              const family = resolveRowFamily(rows, index)
              const previousMinorAvailable = rows
                .slice(0, index)
                .some((candidate) => candidate.kind === 'child' && !isRowAdult(candidate))

              if (editingKey !== row.key) {
                return (
                  <div key={row.key} style={summaryRowStyle} data-testid={`join-family-row-${row.key}`}>
                    <div>
                      <strong>
                        <bdi>{rowDisplayName(locale, row, displayName)}</bdi>
                      </strong>
                      <p style={{ ...muted, fontSize: 'var(--text-caption)' }}>
                        {rowSummary(locale, row, groups, plans) || t(locale, 'people.join.required')}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <Button
                        aria-label={t(locale, 'people.join.editStudent')}
                        data-testid={`join-family-edit-${row.key}`}
                        onClick={() => setEditingKey(row.key)}
                        type="button"
                        variant="ghost"
                      >
                        {t(locale, 'people.join.editStudent')}
                      </Button>
                      <Button
                        data-testid={`join-family-remove-${row.key}`}
                        onClick={() => removeRow(row.key)}
                        type="button"
                        variant="ghost"
                      >
                        {t(locale, 'people.join.removeChild')}
                      </Button>
                    </div>
                  </div>
                )
              }

              return (
                <div
                  data-testid={`join-family-panel-${row.key}`}
                  key={row.key}
                  style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
                >
                  {index > 0 ? <hr style={{ border: 0, borderTop: '1px solid var(--border)' }} /> : null}
                  <h3 style={{ margin: 0 }}>
                    {row.kind === 'self'
                      ? t(locale, 'people.join.selfStudentAlso')
                      : t(locale, 'people.join.child')}
                  </h3>
                  {row.kind === 'child' ? (
                    <>
                      <div style={fieldGrid2}>
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
                      <div style={fieldGrid2}>
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

                      {/* Decision 12/F8 -- no 18+ question. `isMinor` is derived from
                          `row.birthdate` above; the family/pickup block below appears or
                          not purely from that, the same visibility rule as before with a
                          different source. */}
                      {isMinor ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                          <div style={rowStyle}>
                            <h4 style={{ margin: 0 }}>{otherParentLabel}</h4>
                            <span style={{ ...muted, marginInlineStart: 'auto' }}>{optional}</span>
                          </div>
                          {previousMinorAvailable ? (
                            <Checkbox
                              checked={row.sameAsPrevious}
                              data-testid={`join-family-same-as-previous-${row.key}`}
                              label={t(locale, 'people.join.sameAsPrevious')}
                              onChange={(event) =>
                                updateRow(row.key, { sameAsPrevious: event.target.checked })
                              }
                            />
                          ) : null}
                          {row.sameAsPrevious && previousMinorAvailable ? (
                            <p style={{ ...muted, fontSize: 'var(--text-caption)' }}>
                              {family.otherFullName ? (
                                <>
                                  {otherParentLabel}: <bdi>{family.otherFullName}</bdi>
                                  {'. '}
                                </>
                              ) : null}
                              {family.pickups.length > 0
                                ? `${t(locale, 'people.join.pickupTitle')}: ${family.pickups
                                    .map((entry) => entry.name)
                                    .join(', ')}`
                                : null}
                            </p>
                          ) : (
                            <>
                              <TextField
                                error={requiredError(row.otherFullName)}
                                hint={relation === 'other' ? undefined : optional}
                                label={t(locale, 'people.join.fullName')}
                                onChange={(event) =>
                                  updateRow(row.key, { otherFullName: event.target.value })
                                }
                                value={row.otherFullName}
                              />
                              <TextField
                                error={idError(row.otherNationalId, relation === 'other')}
                                hint={relation === 'other' ? undefined : optional}
                                inputMode="numeric"
                                label={t(locale, 'people.join.nationalId')}
                                onChange={(event) =>
                                  updateRow(row.key, { otherNationalId: event.target.value })
                                }
                                value={row.otherNationalId}
                              />
                              <TextField
                                hint={optional}
                                inputMode="tel"
                                label={t(locale, 'people.join.phone')}
                                onChange={(event) =>
                                  updateRow(row.key, { otherPhone: event.target.value })
                                }
                                value={row.otherPhone}
                              />
                              {relation !== 'other' ? (
                                <p style={{ ...muted, fontSize: 'var(--text-caption)' }}>
                                  {t(locale, 'people.join.oneParentEnough')}
                                </p>
                              ) : null}

                              <h4 style={{ margin: 0 }}>{t(locale, 'people.join.pickupTitle')}</h4>
                              <p style={{ ...muted, fontSize: 'var(--text-caption)' }}>
                                {t(locale, 'people.join.pickupHint')}
                              </p>
                              {row.pickups.map((entry, pickupIndex) => (
                                <div key={pickupIndex} style={pickupRowStyle}>
                                  <div style={{ flex: '1 1 12rem' }}>
                                    <TextField
                                      label={t(locale, 'people.join.fullName')}
                                      onChange={(event) =>
                                        updateRow(row.key, {
                                          pickups: row.pickups.map((pickup, at) =>
                                            at === pickupIndex
                                              ? { ...pickup, name: event.target.value }
                                              : pickup,
                                          ),
                                        })
                                      }
                                      value={entry.name}
                                    />
                                  </div>
                                  <div style={{ flex: '1 1 10rem' }}>
                                    <TextField
                                      inputMode="tel"
                                      label={t(locale, 'people.join.phone')}
                                      onChange={(event) =>
                                        updateRow(row.key, {
                                          pickups: row.pickups.map((pickup, at) =>
                                            at === pickupIndex
                                              ? { ...pickup, phone: event.target.value }
                                              : pickup,
                                          ),
                                        })
                                      }
                                      value={entry.phone}
                                    />
                                  </div>
                                  <Button
                                    onClick={() =>
                                      updateRow(row.key, {
                                        pickups: row.pickups.filter((_, at) => at !== pickupIndex),
                                      })
                                    }
                                    type="button"
                                    variant="ghost"
                                  >
                                    {t(locale, 'people.join.removeChild')}
                                  </Button>
                                </div>
                              ))}
                              <Button
                                onClick={() =>
                                  updateRow(row.key, {
                                    pickups: [...row.pickups, { name: '', phone: '' }],
                                  })
                                }
                                type="button"
                                variant="secondary"
                              >
                                {t(locale, 'health.registration.pickupAdd')}
                              </Button>
                            </>
                          )}
                        </div>
                      ) : null}
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
                        updateGroups(
                          row,
                          event.target.checked
                            ? [...row.groupIds, group.id]
                            : row.groupIds.filter((id) => id !== group.id),
                        )
                      }
                    />
                  ))}

                  {/* Decision 14 -- each student picks their own plan, only among plans
                      that cover the groups just chosen. */}
                  {volume > 0 ? (
                    <div>
                      <p style={{ margin: 0, fontWeight: 500 }}>{t(locale, 'people.join.planTitle')}</p>
                      {covering.length > 0 ? (
                        covering.map((plan) => (
                          <Radio
                            checked={row.pricePlanId === plan.id}
                            data-testid={`join-plan-${row.key}-${plan.id}`}
                            key={plan.id}
                            label={plan.name}
                            name={`plan-${row.key}`}
                            onChange={() => updateRow(row.key, { pricePlanId: plan.id })}
                          />
                        ))
                      ) : (
                        <p style={{ ...muted, fontSize: 'var(--text-caption)' }}>
                          {t(locale, 'people.join.noCoveringPlan')}
                        </p>
                      )}
                      {row.pricePlanId ? (
                        <p style={muted}>
                          <MoneyDisplay
                            agorot={
                              covering.find((plan) => plan.id === row.pricePlanId)
                                ?.monthlyAmountAgorot ?? 0
                            }
                          />
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <Button
                      data-testid={`join-family-save-${row.key}`}
                      onClick={() => setEditingKey(null)}
                      type="button"
                      variant="primary"
                    >
                      {t(locale, 'people.join.saveStudent')}
                    </Button>
                    <Button
                      onClick={() => removeRow(row.key)}
                      type="button"
                      variant="ghost"
                    >
                      {t(locale, 'people.join.removeChild')}
                    </Button>
                  </div>
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button
                data-testid="join-add-child"
                onClick={() => addRow('child')}
                type="button"
                variant="secondary"
              >
                {t(locale, 'people.join.addStudent')}
              </Button>
              {!hasSelf ? (
                <Button
                  data-testid="join-add-self"
                  onClick={() => addRow('self')}
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
