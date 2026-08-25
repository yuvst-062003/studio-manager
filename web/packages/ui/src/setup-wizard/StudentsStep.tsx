// Step 6 · חניכים — artboard 5f.
//
// ─────────────────────────────────────────────────────────────────────────────
// EXTENDED BY: W2's **PEOPLE lane (M3)**, and by nobody else.
//
// M1's half is the *מה הוגדר עד כה* summary and both exits (פתיחת לוח המנהל ·
// אמשיך אחר כך). The three acquisition routes 5f draws — Excel/CSV import, the parent
// registration link, manual add — are M3's, because none of `student`, `guardian` or
// `registration_request` exists before W2's contract commit.
//
// It gets NO sub-slot, for the same reason GroupsStep does not: exactly one later owner.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import { Button } from '../primitives/Button'
import type { WizardStepProps } from './types'

export type SetupSummary = {
  studioName: string | null
  parentLocales: string[]
  classCount: number
  groupCount: number
  locationCount: number
  invitedStaffCount: number
}

export type StudentsClient = {
  summarise: () => Promise<SetupSummary>
}

const listStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0 }

export function makeStudentsStep(client: StudentsClient) {
  return function StudentsStep({ locale, status, onDone, onSkip }: WizardStepProps) {
    const [summary, setSummary] = useState<SetupSummary | null>(null)

    useEffect(() => {
      let alive = true
      void client.summarise().then((next) => {
        if (alive) setSummary(next)
      })
      return () => {
        alive = false
      }
    }, [])

    return (
      <section aria-labelledby="setup-students-title" data-testid="setup-step-students">
        <h3 id="setup-students-title">{t(locale, 'common.setup.step.students')}</h3>
        <p>{t(locale, 'common.setup.students.ready')}</p>

        <h4>{t(locale, 'common.setup.students.summaryTitle')}</h4>
        {summary === null ? (
          <p>{t(locale, 'common.setup.loading')}</p>
        ) : (
          <ul data-testid="setup-summary" style={listStyle}>
            <li>
              {summary.studioName ?? '—'} ·{' '}
              {summary.parentLocales
                .map((code) => t(locale, `common.setup.studio.locale.${code}`))
                .join(' · ')}
            </li>
            <li data-testid="setup-summary-groups">
              {t(locale, 'common.setup.students.groupCount')
                .replace('{groups}', String(summary.groupCount))
                .replace('{classes}', String(summary.classCount))}
            </li>
            <li data-testid="setup-summary-staff">
              {t(locale, 'common.setup.students.staffCount').replace(
                '{n}',
                String(summary.invitedStaffCount),
              )}
            </li>
            {/* 5f's card reads '0 חניכים'. It stays zero and says so until M3 lands the
                three acquisition routes — a summary that hid the row would read as a bug
                rather than as a milestone boundary. */}
            <li data-testid="setup-summary-students">
              {t(locale, 'common.setup.students.studentCount').replace('{n}', '0')}
            </li>
          </ul>
        )}

        <p data-testid="setup-students-acquisition-note">
          {t(locale, 'common.setup.students.acquisitionLater')}
        </p>
        <p>{t(locale, 'common.setup.students.changeableLater')}</p>

        <Button onClick={onDone}>{t(locale, 'common.setup.continue')}</Button>
        <Button variant="ghost" onClick={onSkip}>
          {t(locale, 'common.setup.skip')}
        </Button>
        <p data-testid="setup-students-status">{t(locale, `common.setup.status.${status}`)}</p>
      </section>
    )
  }
}
