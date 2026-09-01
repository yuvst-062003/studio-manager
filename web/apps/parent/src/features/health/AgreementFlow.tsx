// `הסכם הרשמה` — the club's paper form, as three steps and one signature.
//
// The club's `טופס הרשמה` is a single page a family signs once. In this product its six blocks
// have four different homes and four different access rules — registration details on `person`
// and `student`, pickup contacts on their own table, medical answers behind §11.1's health
// boundary, and the `תקנון ותנאי תשלום` acceptance in §11.6's consent ledger. This component is
// where that comes back together as one thing a parent walks through.
//
// **Why three steps rather than one scroll.** The whole form is a hard gate on a phone in RTL,
// and a long scroll at a hard gate is where families stop. Each step is short and shows where it
// sits in the sequence.
//
// **Steps are skipped when already satisfied, and that is the point of computing the status
// server-side.** A parent correcting one asthma answer does not re-enter their address or
// re-read the `תקנון` — `agreementStatus` says which parts are already done and only the rest
// renders. Re-deriving that here from the pieces would eventually disagree with the gate.
//
// **Order matters and is not cosmetic.** Registration, then health, then terms — the signature
// lives on the health step, and it is the last thing that happens because the club's signature
// sentence covers everything above it.
//
// **G7.** Nothing here logs. Each step hands its payload to the client once and keeps no copy.
import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { LoadFailed } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { ClubTermsStep } from './ClubTermsStep'
import { DeclarationForm } from './DeclarationForm'
import { RegistrationStep } from './RegistrationStep'
import type { AgreementStatusOut, HealthClient, RegistrationIn } from './healthClient'

const flowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
}

const stepLabelStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
}

export type AgreementFlowProps = {
  locale: Locale
  client: HealthClient
  studentId: string
  studentName: string
  students?: readonly { id: string; display_name: string; health_status?: string }[]
  signerName?: string
  today?: string
  /** Fired when every part of the agreement has landed — the gate re-reads and opens. */
  onCompleted?: () => void
}

type Step = 'registration' | 'health' | 'terms'

/**
 * The first step this family still owes.
 *
 * **Registration first even though health is the older gate.** The signature sentence names the
 * health declaration AND the תקנון, so it has to come after both; and a parent who filled in an
 * address only to be told the form was incomplete has done the typing twice.
 */
export function nextStep(status: AgreementStatusOut): Step | null {
  if (!status.terms_accepted) return 'terms'
  if (!status.registration_complete) return 'registration'
  if (!status.health_signed) return 'health'
  return null
}

const WIZARD_STEPS = [
  { key: 'consent', label: 'health.onboarding.step.consent' },
  { key: 'terms', label: 'health.onboarding.step.terms' },
  { key: 'registration', label: 'health.onboarding.step.family' },
  { key: 'health', label: 'health.onboarding.step.health' },
  { key: 'payment', label: 'health.onboarding.step.payment' },
] as const

const STEP_POSITION: Record<Step, number> = {
  terms: 2,
  registration: 3,
  health: 4,
}

export function AgreementFlow({
  locale,
  client,
  studentId,
  studentName,
  students = [],
  signerName,
  today,
  onCompleted,
}: AgreementFlowProps) {
  const [status, setStatus] = useState<AgreementStatusOut | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let live = true
    client
      .agreementStatus(studentId)
      .then((next) => {
        if (!live) return
        setStatus(next)
        if (next.complete) onCompleted?.()
      })
      .catch(() => {
        if (live) setLoadFailed(true)
      })
    return () => {
      live = false
    }
    // `onCompleted` is deliberately not a dependency: a parent passing a fresh closure each
    // render would re-fetch the status in a loop, and this effect is about the student.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, studentId, attempt])

  const advance = useCallback(
    (next: AgreementStatusOut) => {
      setStatus(next)
      setError(undefined)
      if (next.complete) onCompleted?.()
    },
    [onCompleted],
  )

  const saveRegistration = (body: RegistrationIn) => {
    setSending(true)
    setError(undefined)
    client
      .saveRegistration(studentId, body)
      .then(advance)
      // The step stays on screen with what was typed still in it. A hard gate that empties the
      // form on a failed save is a gate a family gives up at.
      .catch(() => setError(t(locale, 'health.declaration.error')))
      .finally(() => setSending(false))
  }

  const acceptTerms = () => {
    if (!status) return
    setSending(true)
    setError(undefined)
    client
      .acceptClubTerms(studentId, status.club_terms_version)
      .then(advance)
      .catch(() => setError(t(locale, 'health.declaration.error')))
      .finally(() => setSending(false))
  }

  /** Re-read rather than assume: the health step posts through its own client call. */
  const reReadStatus = () => {
    client
      .agreementStatus(studentId)
      .then(advance)
      .catch(() => setError(t(locale, 'health.declaration.error')))
  }

  if (loadFailed) {
    // §6.1's BLOCKING gate — a dead end here locks the family out of the whole app, which is
    // the one place retry matters most.
    return (
      <LoadFailed
        detail={t(locale, 'health.declaration.error')}
        locale={locale}
        onRetry={() => {
          setLoadFailed(false)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }
  if (!status) return <p>{t(locale, 'health.declaration.loading')}</p>

  const step = nextStep(status)
  if (step === null) return null

  const position = STEP_POSITION[step]
  const subjects = students.length > 0 ? students : [{ id: studentId, display_name: studentName }]

  return (
    <div
      data-testid={`agreement-step-${step}`}
      style={flowStyle}
    >
      <header>
        <h1>{t(locale, 'health.onboarding.title')}</h1>
        <p style={stepLabelStyle}>
          {t(locale, 'health.agreement.step')} {position}/{WIZARD_STEPS.length}
        </p>
        <div
          aria-label={t(locale, 'health.onboarding.rail')}
          data-testid="onboarding-rail"
          style={{
            display: 'grid',
            gap: 'var(--space-2)',
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          }}
        >
          {WIZARD_STEPS.map((item, index) => {
            const stepNumber = index + 1
            const done = stepNumber < position
            const current = stepNumber === position
            return (
              <span
                aria-current={current ? 'step' : undefined}
                data-testid={`onboarding-rail-${item.key}`}
                key={item.key}
                style={{
                  background: current
                    ? 'var(--accent)'
                    : done
                      ? 'color-mix(in srgb, var(--paid) 12%, var(--surface))'
                      : 'color-mix(in srgb, var(--pending) 8%, var(--surface))',
                  borderRadius: '999px',
                  color: current ? 'var(--surface)' : 'var(--text-muted)',
                  fontSize: 'var(--text-caption)',
                  minBlockSize: '0.25rem',
                  overflow: 'hidden',
                  padding: 'var(--space-1)',
                  textAlign: 'center',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {t(locale, item.label)}
              </span>
            )
          })}
        </div>
      </header>

      {step === 'health' && subjects.length > 1 ? (
        <div
          aria-label={t(locale, 'health.onboarding.healthQueue')}
          data-testid="onboarding-health-queue"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}
        >
          {subjects.map((subject, index) => {
            const current = subject.id === studentId
            const signed = subject.health_status === 'signed'
            return (
              <span
                aria-current={current ? 'step' : undefined}
                data-testid={`onboarding-health-subject-${subject.id}`}
                key={subject.id}
                style={{
                  background: current
                    ? 'var(--accent)'
                    : signed
                      ? 'color-mix(in srgb, var(--paid) 12%, var(--surface))'
                      : 'color-mix(in srgb, var(--pending) 8%, var(--surface))',
                  borderRadius: '999px',
                  color: current ? 'var(--surface)' : 'var(--text-muted)',
                  fontSize: 'var(--text-caption)',
                  padding: 'var(--space-1) var(--space-2)',
                }}
              >
                <bdi>{subject.display_name}</bdi>
                {' · '}
                {index + 1}/{subjects.length}
              </span>
            )
          })}
        </div>
      ) : null}

      {step === 'registration' ? (
        <RegistrationStep
          error={error}
          initial={status.registration_defaults}
          locale={locale}
          onSubmit={saveRegistration}
          schoolClassRequired={status.school_class_required}
          sending={sending}
          studentName={studentName}
        />
      ) : null}

      {step === 'health' ? (
        <DeclarationForm
          client={client}
          locale={locale}
          onSubmitted={reReadStatus}
          signerName={signerName}
          studentId={studentId}
          studentName={studentName}
          today={today}
        />
      ) : null}

      {step === 'terms' ? (
        <ClubTermsStep error={error} locale={locale} onAccept={acceptTerms} sending={sending} />
      ) : null}
    </div>
  )
}
