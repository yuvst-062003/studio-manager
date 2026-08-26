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
import type { CSSProperties } from 'react'
import { Alert, Button, Card } from '@studio/ui'
import { formatDateInStudioZone, formatTimeInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { fill } from './client'
import type { ImpactPreview } from './client'

const dialogStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '34rem',
  inlineSize: '100%',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  paddingBlock: 'var(--space-2)',
  borderBlockEnd: 'var(--border-width-hairline) solid var(--border)',
}

const protectedRowStyle: CSSProperties = { ...rowStyle, color: 'var(--text-secondary)' }

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-3)',
  justifyContent: 'flex-end',
}

const hintStyle: CSSProperties = {
  display: 'block',
  marginBlockStart: 'var(--space-1)',
}

const listStyle: CSSProperties = {
  margin: 0,
  paddingInlineStart: 'var(--space-5)',
  color: 'var(--text-secondary)',
}

function Row({
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
    <div data-testid={testId} style={muted ? protectedRowStyle : rowStyle}>
      <span>{label}</span>
      <span>{value}</span>
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="impact-title"
      data-testid="impact-preview"
      style={dialogStyle}
    >
      <h2 id="impact-title">{t(locale, 'schedule.impact.title')}</h2>
      <p data-testid="impact-subtitle">{t(locale, 'schedule.impact.subtitle')}</p>

      {changes === 0 ? (
        <p>{t(locale, 'schedule.impact.nothingChanges')}</p>
      ) : (
        <Card>
          <Row
            testId="impact-create"
            label={t(locale, 'schedule.impact.toCreate')}
            value={preview.sessions_to_create}
          />
          <Row
            testId="impact-update"
            label={t(locale, 'schedule.impact.toUpdate')}
            value={preview.sessions_to_update}
          />
          <Row
            testId="impact-cancel-count"
            label={t(locale, 'schedule.impact.toCancel')}
            value={preview.sessions_to_cancel}
          />
        </Card>
      )}

      {/* §5.6's three protections, named. This is the half of the dialog a manager
          actually reads before pressing the button — and it is rendered even when nothing
          changes, because "what is at risk" is the question that was asked. */}
      <Card>
        <Row
          testId="protected-past"
          label={t(locale, 'schedule.impact.protectedPast')}
          value={preview.sessions_protected_past}
          muted
        />
        <Row
          testId="protected-manual"
          label={t(locale, 'schedule.impact.protectedManual')}
          value={preview.sessions_protected_manually_edited}
          muted
        />
        <Row
          testId="protected-adhoc"
          label={t(locale, 'schedule.impact.protectedAdHoc')}
          value={preview.sessions_protected_ad_hoc}
          muted
        />
      </Card>

      {preview.protected_manually_edited_sessions.length > 0 ? (
        <section aria-labelledby="protected-manual-title">
          <h3 id="protected-manual-title">{t(locale, 'schedule.impact.protectedManualList')}</h3>
          <ul style={listStyle}>
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
            <span style={hintStyle}>{t(locale, 'schedule.impact.studentsUnscheduledHint')}</span>
          </Alert>
        </div>
      ) : null}

      <div style={actionsStyle}>
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
