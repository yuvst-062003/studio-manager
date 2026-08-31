// Redesign 2026-08-29 — the booking flow's new home. The landing page leads with a picker
// and ONE call to action; pressing it opens this dialog with the chosen group carried in.
// `landing.css` shapes it: a bottom sheet in the hand (13a), a centered card at a desk.
//
// The pattern is ConfirmDialog's (dashboard, rollover): `role="dialog" aria-modal="true"`
// plus `useModalDialog` for the trap — deliberately NOT a Dialog primitive; a primitive is
// a shared contract that wants its own artboard.
import { Button, SelectField, useModalDialog } from '@studio/ui'
import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { BookingFlow } from './BookingFlow'
import type { LandingClient, PublicGroup } from './landingClient'

const headerStyle: CSSProperties = {
  alignItems: 'center',
  display: 'flex',
  gap: 'var(--space-3)',
}

const contextStyle: CSSProperties = {
  alignItems: 'center',
  background: 'color-mix(in srgb, var(--accent) 9%, var(--surface))',
  border: 'var(--border-width-hairline) solid color-mix(in srgb, var(--accent) 30%, var(--border))',
  borderRadius: 'var(--radius-lg)',
  display: 'flex',
  gap: 'var(--space-3)',
  padding: 'var(--space-3) var(--space-4)',
}

const contextNameStyle: CSSProperties = {
  fontWeight: 'var(--weight-semibold)',
  margin: 0,
}

const contextMetaStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

export function BookingDialog({
  slug,
  locale,
  client,
  groups,
  group,
  groupMeta,
  signedIn,
  address,
  phone,
  onClose,
  onGroupChange,
}: {
  slug: string
  locale: Locale
  client: LandingClient
  groups: PublicGroup[]
  /** The group the page opened with — a default, not a decision. */
  group: PublicGroup
  /** Its ages-and-schedule line, so the choice stays legible after it changes. */
  groupMeta: string
  signedIn: boolean
  address: string | null
  phone: string | null
  onClose: () => void
  /** Re-points the flow at another group without closing it. */
  onGroupChange: (groupId: string) => void
}) {
  // Always open: the caller's conditional IS the open state (ConfirmDialog's convention).
  const dialogRef = useModalDialog(true, onClose)

  return (
    <>
      {/* The scrim is pointer furniture, not content — the close affordances for AT are
          the button below and Escape (useModalDialog). */}
      <div className="landing-scrim" aria-hidden="true" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-dialog-title"
        className="landing-booking-dialog"
        data-testid="booking-dialog"
        ref={dialogRef}
        tabIndex={-1}
      >
        <div style={headerStyle}>
          <h2 id="booking-dialog-title" style={{ margin: 0, fontSize: 'var(--text-title)' }}>
            {t(locale, 'people.landing.title')}
          </h2>
          <span style={{ marginInlineStart: 'auto' }}>
            <Button variant="ghost" onClick={onClose} data-testid="booking-dialog-close">
              {t(locale, 'people.landing.closeBooking')}
            </Button>
          </span>
        </div>

        {/* The group, as a CHOICE rather than a statement. It used to be the name plus a
            "change" button that only closed the dialog — which worked while the page
            underneath carried an inline picker to re-choose from. The Stitch redesign
            removed that picker (the designed timetable is decorative), so closing left the
            reader on a page with nothing to pick and `groups[0]` still selected: pressing
            the one call to action and being unable to choose your team (2026-08-31).

            A single group is not a choice, so it stays a plain line — a select with one
            option is furniture that asks a question with one answer. */}
        <div style={contextStyle}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: 1 }}>
            {groups.length > 1 ? (
              <SelectField
                // `chooseGroup` ("בחירת קבוצה"), not `changeGroup` ("שינוי"): the latter
                // was a BUTTON's word, and reads as an instruction rather than a name
                // when a field label borrows it. Same label as the per-child select in
                // BookingFlow, because it is the same question.
                label={t(locale, 'people.landing.chooseGroup')}
                value={group.id}
                onChange={(event) => onGroupChange(event.target.value)}
                data-testid="booking-dialog-group"
              >
                {groups.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </SelectField>
            ) : (
              <p style={contextNameStyle}>
                <bdi>{group.name}</bdi>
              </p>
            )}
            {/* Kept under both shapes: the ages and the days are what tell a parent
                whether the group they just chose actually suits their child. */}
            {groupMeta ? <p style={contextMetaStyle}>{groupMeta}</p> : null}
          </span>
        </div>

        <BookingFlow
          slug={slug}
          locale={locale}
          client={client}
          groups={groups}
          signedIn={signedIn}
          address={address}
          phone={phone}
          initialGroupId={group.id}
        />
      </div>
    </>
  )
}
