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
import { t } from '@studio/i18n'
import { ActionBar } from '../primitives/ActionBar'
import { Button } from '../primitives/Button'
import { SectionHeader } from '../primitives/SectionHeader'
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
      <section
        aria-labelledby="setup-students-title"
        className="setup-step"
        data-testid="setup-step-students"
      >
        <SectionHeader level={3} title={t(locale, 'common.setup.step.students')} />
        <p className="setup-step__meta">{t(locale, 'common.setup.students.ready')}</p>

        {/* `5f`'s panel: everything set up so far, each line either done or still open. It
            is the only place in the wizard that shows the whole answer at once, which is
            why it belongs on the last step rather than the first. */}
        <aside className="setup-panel" data-testid="setup-summary-panel">
          <SectionHeader level={3} title={t(locale, 'common.setup.students.summaryTitle')} />
          {summary === null ? (
            <p className="setup-panel__empty">{t(locale, 'common.setup.loading')}</p>
          ) : (
            <ul className="setup-panel__list" data-testid="setup-summary">
              <li>
                <span>
                  {summary.studioName ?? '—'} ·{' '}
                  {summary.parentLocales
                    .map((code) => t(locale, `common.setup.studio.locale.${code}`))
                    .join(' · ')}
                </span>
              </li>
              <li data-testid="setup-summary-groups">
                <span>
                  {t(locale, 'common.setup.students.groupCount')
                    .replace('{groups}', String(summary.groupCount))
                    .replace('{classes}', String(summary.classCount))}
                </span>
              </li>
              <li data-testid="setup-summary-staff">
                <span>
                  {t(locale, 'common.setup.students.staffCount').replace(
                    '{n}',
                    String(summary.invitedStaffCount),
                  )}
                </span>
              </li>
              {/* `5f`'s card reads '0 חניכים'. It stays zero and says so until M3 lands the
                  three acquisition routes — a summary that hid the row would read as a bug
                  rather than as a milestone boundary. */}
              <li data-testid="setup-summary-students">
                <span>
                  {t(locale, 'common.setup.students.studentCount').replace('{n}', '0')}
                </span>
              </li>
            </ul>
          )}
          <p className="setup-panel__awaiting">
            {t(locale, 'common.setup.students.changeableLater')}
          </p>
        </aside>

        {/* The last step's footer carries §5.1's exits, because finishing IS the exit —
            which is why `5f` drops save-and-exit from the header and puts the dashboard
            here instead. */}
        <ActionBar
          end={<Button onClick={onDone}>{t(locale, 'common.setup.openDashboard')}</Button>}
          start={
            <Button onClick={onSkip} variant="ghost">
              {t(locale, 'common.setup.students.later')}
            </Button>
          }
        />
        <p className="setup-step__meta" data-testid="setup-students-status">
          {t(locale, `common.setup.status.${status}`)}
        </p>
      </section>
    )
  }
}
