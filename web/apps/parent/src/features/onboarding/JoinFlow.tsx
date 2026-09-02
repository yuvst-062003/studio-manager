// §5.4b — the shared member onboarding link. The link itself knows no family yet, so it
// shows only the studio sign-in before auth. After sign-in the family walks one five-step
// wizard: consent, club terms, the family form, health declarations, then payment.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiFetch, useSession } from '@studio/core'
import { EmptyState, SignIn } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { PaymentSetup } from '../billing/PaymentSetup'
import type { StandingOrderLink } from '../billing/PaymentSetup'
import type { BillingClient } from '../billing/billingClient'
import { submitUpayForm } from '../billing/PaymentsSection'
import { ClubTermsStep } from '../health/ClubTermsStep'
import { firstStudentNeedingDeclaration, type GatedStudent } from '../health/HealthGate'
import type { HealthClient } from '../health/healthClient'
import { JoinFamilyStep, type JoinFamilyPayload } from './JoinFamilyStep'
import { JoinHealthStep } from './JoinHealthStep'
import { OnboardingWizardChrome, stepPosition } from './OnboardingWizardChrome'

type JoinGroup = { id: string; name: string; weekdays: number[] }
type JoinInfo = { studio_name: string; groups: JoinGroup[]; email: string | null }

type JoinStep = 'terms' | 'family' | 'health' | 'payment'

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '30rem',
  marginInline: 'auto',
  inlineSize: '100%',
  padding: 'var(--space-4)',
}

async function loadStudents(): Promise<GatedStudent[]> {
  const response = await apiFetch('/api/v1/me/students')
  if (!response.ok) return []
  const body = (await response.json()) as {
    items: {
      id: string
      first_name: string
      last_name: string
      status: string
      health_status: GatedStudent['health_status']
      agreement_complete?: boolean | null
    }[]
  }
  return body.items.map((student) => ({
    id: student.id,
    display_name: `${student.first_name} ${student.last_name}`,
    status: student.status,
    health_status: student.health_status,
    agreement_complete: student.agreement_complete,
  }))
}

export function JoinFlow({
  billingClient,
  healthClient,
  locale,
  onBackToConsent,
  onComplete,
  standingOrderLinks,
  token,
}: {
  billingClient: BillingClient
  healthClient: HealthClient
  locale: Locale
  onBackToConsent?: () => void
  onComplete?: () => void
  standingOrderLinks: readonly StandingOrderLink[]
  token: string
}) {
  const session = useSession()
  const [info, setInfo] = useState<JoinInfo | null | 'invalid'>(null)
  const [step, setStep] = useState<JoinStep>('terms')
  const [students, setStudents] = useState<readonly GatedStudent[]>([])
  const [clubTermsAccepted, setClubTermsAccepted] = useState(false)
  const [inFlight, setInFlight] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void apiFetch(`/api/v1/public/onboarding/${token}`)
      .then(async (response) => {
        if (!alive) return
        if (!response.ok) {
          setInfo('invalid')
          return
        }
        setInfo((await response.json()) as JoinInfo)
      })
      .catch(() => alive && setInfo('invalid'))
    return () => {
      alive = false
    }
  }, [token, session.status])

  const refreshStudents = useCallback(async () => {
    const next = await loadStudents()
    setStudents(next)
    return next
  }, [])

  const setupChildren = useMemo(
    () =>
      students.map((student) => {
        const [first_name = '', last_name = ''] = student.display_name.split(' ')
        return { id: student.id, first_name, last_name }
      }),
    [students],
  )

  useEffect(() => {
    if (step !== 'health') return
    if (students.length === 0) {
      void refreshStudents()
      return
    }
    if (!firstStudentNeedingDeclaration(students)) {
      setStep('payment')
    }
  }, [refreshStudents, step, students])

  if (info === null) return null
  if (info === 'invalid') {
    return (
      <div style={pageStyle} data-testid="join-invalid">
        <EmptyState
          title={t(locale, 'people.join.expired')}
          description={t(locale, 'people.join.expiredHint')}
        />
      </div>
    )
  }

  if (session.status !== 'signed-in') {
    return (
      <div style={pageStyle} data-testid="join-signin">
        <div className="studio-page-header">
          <h1>{info.studio_name}</h1>
        </div>
        <p style={{ margin: 0 }}>{t(locale, 'health.onboarding.title')}</p>
        <SignIn locale={locale} app="parent" returnPath={`/join/${token}`} />
      </div>
    )
  }

  async function acceptClubTermsForFamily(studentId: string) {
    const status = await healthClient.agreementStatus(studentId)
    if (status.terms_accepted) return
    await healthClient.acceptClubTerms(studentId, status.club_terms_version)
  }

  async function submitFamily(payload: JoinFamilyPayload) {
    if (inFlight) return
    setInFlight(true)
    setFailed(null)
    try {
      const response = await apiFetch(`/api/v1/onboarding/${token}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: payload.first_name,
          last_name: payload.last_name,
          phone: payload.phone,
          signer: payload.signer,
          other_parent: payload.other_parent,
          pickup_contacts: payload.pickup_contacts,
          children: payload.children.map((child) => ({
            first_name: child.first_name,
            last_name: child.last_name,
            birthdate: child.birthdate,
            group_ids: child.group_ids,
            self_student: child.self_student,
            national_id: child.national_id,
            grade: child.grade,
          })),
        }),
      })
      if (!response.ok) throw new Error(String(response.status))
      const body = (await response.json()) as { student_ids: string[] }
      if (clubTermsAccepted && body.student_ids[0]) {
        await acceptClubTermsForFamily(body.student_ids[0])
      }
      const nextStudents = await refreshStudents()
      if (firstStudentNeedingDeclaration(nextStudents)) {
        setStep('health')
        return
      }
      setStep('payment')
    } catch {
      setFailed(t(locale, 'common.error.generic'))
    } finally {
      setInFlight(false)
    }
  }

  function finishWizard() {
    if (onComplete) {
      onComplete()
      return
    }
    globalThis.location.assign('/')
  }

  if (step === 'terms') {
    return (
      <div style={pageStyle} data-testid="join-terms-step">
        <OnboardingWizardChrome
          locale={locale}
          onBack={onBackToConsent}
          position={stepPosition('terms')}
          title={t(locale, 'health.clubTerms.title')}
        >
          <ClubTermsStep
            locale={locale}
            onAccept={() => {
              setClubTermsAccepted(true)
              setStep('family')
            }}
          />
        </OnboardingWizardChrome>
      </div>
    )
  }

  if (step === 'family') {
    return (
      <JoinFamilyStep
        displayName={session.displayName ?? ''}
        email={info.email}
        error={failed}
        groups={info.groups}
        inFlight={inFlight}
        locale={locale}
        onBack={() => setStep('terms')}
        onSubmit={(payload) => void submitFamily(payload)}
      />
    )
  }

  if (step === 'health') {
    return (
      <div style={pageStyle}>
        <JoinHealthStep
          client={healthClient}
          locale={locale}
          onBack={() => setStep('family')}
          onSigned={() => {
            void refreshStudents().then((next) => {
              if (firstStudentNeedingDeclaration(next)) return
              setStep('payment')
            })
          }}
          signerName={session.displayName ?? undefined}
          students={students}
        />
      </div>
    )
  }

  return (
    <div style={pageStyle} data-testid="join-payment-step">
      <OnboardingWizardChrome
        locale={locale}
        // No `onBack`: health is complete by construction once this step renders — the
        // effect above only advances here when no student still needs a declaration — so
        // "back" would land on the health step's own effect, which immediately bounces
        // forward again. A button that visibly does nothing is worse than no button.
        position={stepPosition('payment')}
        title={t(locale, 'health.onboarding.step.payment')}
      >
        <PaymentSetup
          client={billingClient}
          locale={locale}
          onFinish={finishWizard}
          onNothingToPay={finishWizard}
          onOrderOpened={submitUpayForm}
          standingOrderLinks={standingOrderLinks}
          students={setupChildren}
        />
      </OnboardingWizardChrome>
    </div>
  )
}

/** `/join/<token>` → the token, or null. A real path, not a hash: the URL lives in a
 *  WhatsApp message and must survive being tapped cold. */
export function matchJoinPath(pathname: string): string | null {
  const match = /^\/join\/([A-Za-z0-9_-]{16,})$/.exec(pathname)
  return match ? (match[1] ?? null) : null
}
