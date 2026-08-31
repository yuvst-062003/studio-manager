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

export function BookingDialog({
  slug,
  locale,
  client,
  groups,
  group,
  signedIn,
  address,
  phone,
  onClose,
}: {
  slug: string
  locale: Locale
  client: LandingClient
  groups: PublicGroup[]
  /** The group the page opened with. A PRE-FILL for the first child, not a decision the
   *  dialog displays — see the note where the group line used to be. */
  group: PublicGroup
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

        {/* NO group line here. There was one — first a name plus a dead "change" button,
            then a select — and both were answering the wrong question in the wrong place.
            The booking asks for a group PER CHILD in step 2, because siblings do not share
            one: that is what the age filter on `booking-group-<n>` is for. A second control
            above the steps could only ever disagree with those, and the owner read it as
            what it was — a choice that does not belong to this screen (2026-08-31).

            `groups` still arrives as a prop: `PublicLanding` uses the page's picked group
            to PRE-FILL the first child, which is the useful half of carrying a choice in. */}

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
