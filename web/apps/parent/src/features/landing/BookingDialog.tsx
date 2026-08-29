// Redesign 2026-08-29 — the booking flow's new home. The landing page leads with a picker
// and ONE call to action; pressing it opens this dialog with the chosen group carried in.
// `landing.css` shapes it: a bottom sheet in the hand (13a), a centered card at a desk.
//
// The pattern is ConfirmDialog's (dashboard, rollover): `role="dialog" aria-modal="true"`
// plus `useModalDialog` for the trap — deliberately NOT a Dialog primitive; a primitive is
// a shared contract that wants its own artboard.
import { Button, useModalDialog } from '@studio/ui'
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
}: {
  slug: string
  locale: Locale
  client: LandingClient
  groups: PublicGroup[]
  /** The group the landing picker chose. */
  group: PublicGroup
  /** The picker's own ages-and-schedule line, repeated here so the choice stays visible. */
  groupMeta: string
  signedIn: boolean
  address: string | null
  phone: string | null
  onClose: () => void
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

        <div style={contextStyle}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <p style={contextNameStyle}>
              <bdi>{group.name}</bdi>
            </p>
            {groupMeta ? <p style={contextMetaStyle}>{groupMeta}</p> : null}
          </span>
          <span style={{ marginInlineStart: 'auto' }}>
            <Button variant="ghost" onClick={onClose} data-testid="booking-dialog-change">
              {t(locale, 'people.landing.changeGroup')}
            </Button>
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
