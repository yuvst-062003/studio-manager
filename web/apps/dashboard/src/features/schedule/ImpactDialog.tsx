// Dashboard artboard 6a's confirmation step — §5.6's impact dialog, and E2E-5's gate.
//
// **The dialog is the invariant, made visible.** §5.6 spends a paragraph on the two
// categories a rule change never overwrites, and this is where a manager sees that promise
// before they rely on it. The three protections are rendered as three named rows rather
// than one total, because "32 sessions will change" does not answer "is last month safe".
//
// C12 is the fourth thing on the screen and the newest. A change can be perfectly correct
// about sessions and still empty the pattern of every student who only came on the day it
// moved — they drop off the roster and stop being counted absent, which looks exactly like
// the feature working.
import { Alert, Button, StatTile, useModalDialog } from '@studio/ui'
import { formatDateInStudioZone, formatTimeInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { fill } from './client'
import type { ImpactPreview } from './client'

/**
 * One of the dialog's six numbers, as a tile rather than a label-and-value row —
 * §3.3's one named gain from the prototype ("the stat-block treatment would make the
 * three change counts and three protected counts read faster than the current text rows").
 *
 * Every tile is `neutral`. `StatTone` is a SEMANTIC choice — `debt`, `paid`, `pending`
 * mean those things everywhere else in the app — and "sessions to create" is not a
 * payment. Tinting it green for emphasis is exactly what D3 forbids. What separates the
 * three changes from the three protections is the heading over each group and the muted
 * class on the second, not a colour that would claim a meaning it does not have.
 */
function Count({
  testId,
  label,
  value,
  muted = false,
}: {
  testId: string
  label: string
  value: number
  muted?: boolean
}) {
  return (
    <div data-testid={testId}>
      <StatTile className={muted ? 'impact-tile impact-tile--muted' : 'impact-tile'} label={label} value={value} />
    </div>
  )
}

export function ImpactDialog({
  locale,
  preview,
  onConfirm,
  onCancel,
  busy = false,
}: {
  locale: Locale
  preview: ImpactPreview
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
}) {
  const changes =
    preview.sessions_to_create + preview.sessions_to_update + preview.sessions_to_cancel
  const stranded = preview.students_left_unscheduled
  // Rendered only while open, so the caller's conditional IS the open state.
  const dialogRef = useModalDialog(true, onCancel)

  return (
    // `aria-modal="true"` was here from the start and nothing kept the promise it makes:
    // Tab walked out of the dialog and back into the schedule form behind it, while a
    // screen-reader user had been told that form was unavailable. `useModalDialog` (W6)
    // moves focus in, traps Tab, closes on Escape and restores focus to the trigger.
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="impact-title"
      className="impact-dialog"
      data-testid="impact-preview"
      ref={dialogRef}
      tabIndex={-1}
    >
      <h2 id="impact-title">{t(locale, 'schedule.impact.title')}</h2>
      <p data-testid="impact-subtitle">{t(locale, 'schedule.impact.subtitle')}</p>

      {changes === 0 ? (
        <p>{t(locale, 'schedule.impact.nothingChanges')}</p>
      ) : (
        <section aria-labelledby="impact-changes-title">
          {/* Named, where the three numbers used to sit under nothing. A manager reading
              six figures needs to know which three are the change and which three are the
              promise. */}
          <h3 className="impact-dialog__group" id="impact-changes-title">
            {t(locale, 'schedule.impact.changesTitle')}
          </h3>
          <div className="impact-dialog__counts">
            <Count
              testId="impact-create"
              label={t(locale, 'schedule.impact.toCreate')}
              value={preview.sessions_to_create}
            />
            <Count
              testId="impact-update"
              label={t(locale, 'schedule.impact.toUpdate')}
              value={preview.sessions_to_update}
            />
            <Count
              testId="impact-cancel-count"
              label={t(locale, 'schedule.impact.toCancel')}
              value={preview.sessions_to_cancel}
            />
          </div>
        </section>
      )}

      {/* §5.6's three protections, named. This is the half of the dialog a manager
          actually reads before pressing the button — and it is rendered even when nothing
          changes, because "what is at risk" is the question that was asked. */}
      <section aria-labelledby="impact-protected-title">
        <h3 className="impact-dialog__group" id="impact-protected-title">
          {t(locale, 'schedule.impact.protectedTitle')}
        </h3>
        <div className="impact-dialog__counts">
          <Count
            testId="protected-past"
            label={t(locale, 'schedule.impact.protectedPast')}
            value={preview.sessions_protected_past}
            muted
          />
          <Count
            testId="protected-manual"
            label={t(locale, 'schedule.impact.protectedManual')}
            value={preview.sessions_protected_manually_edited}
            muted
          />
          <Count
            testId="protected-adhoc"
            label={t(locale, 'schedule.impact.protectedAdHoc')}
            value={preview.sessions_protected_ad_hoc}
            muted
          />
        </div>
      </section>

      {preview.protected_manually_edited_sessions.length > 0 ? (
        <section aria-labelledby="protected-manual-title">
          <h3 className="impact-dialog__group" id="protected-manual-title">
            {t(locale, 'schedule.impact.protectedManualList')}
          </h3>
          <ul className="impact-dialog__list">
            {preview.protected_manually_edited_sessions.map((session) => (
              <li key={session.id} data-testid="protected-manual-session">
                {formatDateInStudioZone(session.starts_at, locale)}
                {' · '}
                {formatTimeInStudioZone(session.starts_at, locale)}
                {'–'}
                {formatTimeInStudioZone(session.ends_at, locale)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {preview.first_affected_date ? (
        <p data-testid="first-affected-date">
          {t(locale, 'schedule.impact.firstAffected')}{' '}
          {/* Noon UTC, not midnight: the server sends a bare calendar date, and midnight
              UTC on it is still the previous evening in Jerusalem. */}
          {formatDateInStudioZone(`${preview.first_affected_date}T12:00:00Z`, locale)}
        </p>
      ) : null}

      {stranded > 0 ? (
        // C12. `live` is on: this banner appears in response to something the manager just
        // did, which is exactly the case the Alert primitive reserves role="alert" for.
        <div data-testid="students-unscheduled">
          <Alert
            tone="danger"
            live
            iconLabel={t(locale, 'schedule.impact.studentsUnscheduledIcon')}
          >
            <strong>
              {stranded === 1
                ? t(locale, 'schedule.impact.studentsUnscheduledOne')
                : fill(t(locale, 'schedule.impact.studentsUnscheduled'), { count: stranded })}
            </strong>
            {/* A span, not a <p>. `Alert` renders its children inside a <p> of its own, so
                a nested paragraph is invalid HTML — the browser closes the outer one early
                and the banner loses its tint below the fold. `packages/ui` is not this
                lane's file, so the composition bends here rather than the primitive. */}
            <span className="impact-dialog__hint">
              {t(locale, 'schedule.impact.studentsUnscheduledHint')}
            </span>
          </Alert>
        </div>
      ) : null}

      <div className="impact-dialog__actions">
        <Button variant="secondary" onClick={onCancel} data-testid="impact-cancel">
          {t(locale, 'schedule.impact.cancel')}
        </Button>
        <Button onClick={onConfirm} disabled={busy} data-testid="confirm">
          {t(locale, 'schedule.impact.confirm')}
        </Button>
      </div>
    </div>
  )
}
