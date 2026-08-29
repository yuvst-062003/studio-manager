// Artboard 7b, panel תצוגה מקדימה — אפליקציית ההורים.
//
// **Why a preview earns its place on this form and not on most.** Nothing a manager writes
// here is visible to them anywhere else before it is published, and §4.3 hides a draft from
// every guardian — so the first person to see the invitation is a parent, after the send.
// The three fields most likely to be wrong are the three with no other reader: the parent
// details, whether a fee is attached, and whether a consent gates the answer.
//
// **It renders what `7d` renders, deliberately.** The parent's own screen
// (`web/apps/parent/.../EventInviteScreen.tsx`) is the contract this is a preview OF, so
// the order, the fee sentence and the consent gate are the same ones — a preview that drew
// a prettier card than the app would be a preview of nothing.
//
// **The buttons are disabled, not decorative.** They are the shape of the answer a parent
// gives, and §5.8 gates confirmation on a signed consent — so with a consent required, the
// confirm button here is disabled for the same reason it will be disabled there. `disabled`
// rather than a `<div>` that looks like a button, because assistive tech should report a
// control that exists and cannot be used, not a paragraph shaped like one.
//
// **Times come from the typed strings, not from `Date`.** The inputs are `datetime-local`,
// which is studio wall time as the manager entered it; parsing and re-formatting through the
// browser's zone would render a preview an hour off for anyone not sitting in Israel.
import type { CSSProperties } from 'react'
import { Alert, Button, Card, MoneyDisplay, RangeText, StatusChip } from '@studio/ui'
import { MoneyFormatError, parseShekels } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { describeTargets } from './EventTargetPicker'
import type { EventTargetOut, EventType } from './client'

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
}

const titleStyle: CSSProperties = {
  color: 'var(--fg)',
  fontSize: 'var(--text-title)',
  fontWeight: 'var(--weight-medium)',
  margin: 0,
}

const hintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const detailStyle: CSSProperties = {
  color: 'var(--fg)',
  fontSize: 'var(--text-caption)',
  margin: 0,
  whiteSpace: 'pre-wrap',
}

const footerStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
}

export type EventDraft = {
  type: EventType
  title: string
  description: string
  startsAt: string
  endsAt: string
  locationText: string
  requiresConsent: boolean
  consentText: string
  charges: boolean
  fee: string
  targets: EventTargetOut[]
}

/** `2026-09-19T16:30` → `19.09.2026`. The literal the manager typed, re-punctuated — see
 *  the module docstring on why this does not go through `Date`. */
export function wallDate(value: string): string | null {
  const [day] = value.split('T')
  if (!day) return null
  const [year, month, date] = day.split('-')
  return year && month && date ? `${date}.${month}.${year}` : null
}

/** `2026-09-19T16:30` → `16:30`. Seconds dropped: the input may carry them and no parent
 *  needs to read a competition starting at 16:30:00. */
export function wallTime(value: string): string | null {
  const time = value.split('T')[1]
  if (!time) return null
  const [hour, minute] = time.split(':')
  return hour && minute ? `${hour}:${minute}` : null
}

export function EventPreviewCard({ draft, locale }: { draft: EventDraft; locale: Locale }) {
  const startDate = wallDate(draft.startsAt)
  const startTime = wallTime(draft.startsAt)
  const endTime = wallTime(draft.endsAt)

  // The preview is the one place a half-typed price appears while it is still half typed,
  // so a throw here is ordinary rather than exceptional: show nothing until it parses.
  let feeAgorot: number | null = null
  if (draft.charges) {
    try {
      feeAgorot = parseShekels(draft.fee)
    } catch (error) {
      if (!(error instanceof MoneyFormatError)) throw error
    }
  }

  return (
    <Card>
      <div style={cardStyle}>
        <p style={hintStyle}>
          <StatusChip label={t(locale, `events.type.${draft.type}`)} status="planned" />{' '}
          {startDate ?? t(locale, 'events.preview.noDate')}
        </p>

        <h3 style={titleStyle}>{draft.title.trim() || t(locale, 'events.preview.untitled')}</h3>

        <p style={hintStyle}>
          {/* One LTR island for the pair. Two sibling times in an RTL paragraph is the bidi
              bug `RangeText` exists to stop, and a range printed end-first on a preview is
              the manager's only chance to catch it. */}
          {startTime && endTime ? (
            <RangeText from={startTime} to={endTime} />
          ) : startTime ? (
            <bdi dir="ltr">{startTime}</bdi>
          ) : null}
          {draft.locationText.trim() ? <> · {draft.locationText.trim()}</> : null}
        </p>

        {/* §5.8 — confirming is what creates the charge, and the parent's screen says so. */}
        {feeAgorot !== null ? (
          <>
            <p style={hintStyle}>
              <MoneyDisplay agorot={feeAgorot} label={t(locale, 'events.fee.label')} />
            </p>
            <p style={hintStyle}>{t(locale, 'events.fee.chargeOnConfirm')}</p>
          </>
        ) : null}

        {draft.description.trim() ? <p style={detailStyle}>{draft.description.trim()}</p> : null}

        {draft.requiresConsent ? (
          <Alert iconLabel={t(locale, 'events.consent.required')} tone="danger">
            {t(locale, 'events.consent.blocksConfirmation')}
          </Alert>
        ) : null}
        {draft.requiresConsent && draft.consentText.trim() ? (
          <p style={detailStyle}>{draft.consentText.trim()}</p>
        ) : null}

        <div style={footerStyle}>
          {/* The gate, previewed: with a consent required this is exactly as unusable here
              as it will be for the parent until they sign. */}
          <Button disabled variant="primary">
            {t(locale, 'events.rsvp.yes')}
          </Button>
          {/* Never gated — §5.8 gates CONFIRMATION, and putting a form between a family and
              "no" is not a thing this product does. */}
          <Button disabled variant="secondary">
            {t(locale, 'events.rsvp.no')}
          </Button>
        </div>

        {/* Audiences, not children. `describeTargets` says why a headcount would be a
            guess wearing a number's clothes. */}
        <p style={hintStyle}>
          {t(locale, 'events.preview.audience')} {describeTargets(draft.targets, locale)}
        </p>
      </div>
    </Card>
  )
}
