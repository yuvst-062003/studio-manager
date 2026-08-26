// §5.5's gate — **a hard block in the PARENT app only.**
//
// SPEC §5.5, first line: "This is a hard gate. A guardian cannot use the parent app for a student
// until that student's declaration is signed. On first login, if any linked student has
// `health_status = missing`, the app routes to the declaration flow and no other screen is
// reachable."
//
// **And nothing on the mat is ever blocked.** The same section: "A missing declaration never
// blocks anything in the app. The roster shows a ⚠ … The coach can still mark them present." The
// two rules are not in tension — this component is in `web/apps/parent/`, there is no equivalent
// in the staff app, and there is deliberately no `block_attendance_without_health` setting for
// either to read.
//
// **`trial_signed` is still gated.** §5.5's gate is about the full declaration: a family who
// signed §5.4a's short trial form has answered three questions on a phone, and the gate exists
// because the club needs the whole record before a child trains regularly.
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { CSSProperties } from 'react'
import { Card } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { DeclarationForm } from './DeclarationForm'
import type { HealthClient, HealthStatus } from './healthClient'

const gateStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  padding: 'var(--space-4)',
}

export type GatedStudent = {
  id: string
  display_name: string
  health_status: HealthStatus
}

/**
 * The first student still owing a full declaration, or `null` when nobody does.
 *
 * **First, not all.** §6.1's first run is a sequence a parent walks once, and a screen that asked
 * for three children's declarations at once is a screen nobody finishes. The gate reappears for
 * the next child on submit, which is the same routing decision made again.
 */
export function firstStudentNeedingDeclaration(students: readonly GatedStudent[]): GatedStudent | null {
  return students.find((student) => student.health_status !== 'signed') ?? null
}

export type HealthGateProps = {
  locale: Locale
  client: HealthClient
  students: readonly GatedStudent[]
  signerName?: string
  today?: string
  onSigned?: () => void
  children: ReactNode
}

export function HealthGate({
  locale,
  client,
  students,
  signerName,
  today,
  onSigned,
  children,
}: HealthGateProps) {
  const blocked = useMemo(() => firstStudentNeedingDeclaration(students), [students])

  if (!blocked) return <>{children}</>

  return (
    // `children` is not rendered at all — not hidden, not disabled, not behind an overlay. §5.5
    // says "no other screen is reachable", and a screen that is merely covered is one CSS bug
    // away from being reachable.
    <div data-testid="health-gate" style={gateStyle}>
      <Card>
        <h1>{t(locale, 'health.gate.title')}</h1>
        <p>{t(locale, 'health.gate.body')}</p>
        <p style={{ color: 'var(--text-muted)' }}>
          {t(locale, 'health.declaration.forChild')} <bdi>{blocked.display_name}</bdi>
        </p>
        {blocked.health_status === 'trial_signed' ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-caption)' }}>
            {t(locale, 'health.badge.trialSigned')}
          </p>
        ) : null}
      </Card>
      <DeclarationForm
        client={client}
        locale={locale}
        onSubmitted={onSigned}
        signerName={signerName}
        studentId={blocked.id}
        studentName={blocked.display_name}
        today={today}
      />
    </div>
  )
}
