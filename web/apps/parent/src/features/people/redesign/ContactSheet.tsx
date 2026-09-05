// "יצירת קשר" — ported from the prototype's ProfileScreen MODAL 1.
//
// ALL THREE ACTIONS the prototype offers — WhatsApp, a call and email.
//
// Email was missing on the first pass because a studio had nowhere to keep one. Owner
// review, 2026-09-06: "צור קשר צריך להכיל גם מייל". The club's address and phone already
// live in `studio.settings` rather than in columns, so the email joined them there and no
// migration was needed; the manager sets it in the dashboard's settings panel.
//
// Each button is drawn only when the club has the detail behind it. A greyed-out control
// still promises a feature that does not exist, and a `mailto:` to a guessed address is a
// message the club never receives.
//
// All three are ordinary links with a scheme the phone already knows — `https://wa.me/…`,
// `tel:` and `mailto:` — so they work with no permission, no SDK and no JS, and a
// long-press "copy" behaves the way a parent expects.
import { Mail, MessageCircle, Phone, X } from 'lucide-react'
import { useDialog } from '../../onboarding/wizard/useDialog'
import { PROFILE } from './content'
import type { ClubDetails } from './types'

/**
 * A stored phone number → the digits `wa.me` wants.
 *
 * Israeli numbers are stored as a manager typed them — `050-8492019`, `+972 50 849 2019`,
 * `(050) 8492019`. `wa.me` takes digits with a country code and no `+`, so a local `05…`
 * has to become `9725…`; sending the leading zero produces a "number not on WhatsApp" page
 * for a number that plainly is.
 *
 * Returns `null` when there is nothing usable, and the caller then renders no button at all
 * rather than a link to `wa.me/` with an empty tail.
 */
export function whatsappNumber(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7) return null
  if (digits.startsWith('972')) return digits
  if (digits.startsWith('0')) return `972${digits.slice(1)}`
  return digits
}

/**
 * The three actions on their own, with no dialog around them.
 *
 * Extracted when פרופיל's דוג׳ו and יצירת קשר merged into one המועדון sheet (owner review,
 * 2026-09-06): that sheet needs the buttons inside a panel it already owns, and a second
 * `useDialog` nested in the first would fight the same focus trap.
 */
export function ContactActions({ club }: { club: ClubDetails | null }) {
  const wa = whatsappNumber(club?.phone ?? null)
  const count = (wa ? 1 : 0) + (club?.phone ? 1 : 0) + (club?.email ? 1 : 0)
  const hasAny = count > 0

  return (
    <>
        {hasAny ? (
      <div className={`grid gap-2.5 ${count >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {wa ? (
          <a
            href={`https://wa.me/${wa}`}
            target="_blank"
            rel="noreferrer"
            data-testid="profile-contact-whatsapp"
            className="flex flex-col items-center gap-1.5 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 text-emerald-800 dark:text-emerald-300 text-xs font-bold active:scale-95 transition-all cursor-pointer"
          >
            <MessageCircle className="w-6 h-6" />
            <span>{PROFILE.contactWhatsApp}</span>
          </a>
        ) : null}
        {club?.phone ? (
          <a
            href={`tel:${club.phone}`}
            data-testid="profile-contact-call"
            className="flex flex-col items-center gap-1.5 p-4 rounded-2xl bg-blue-50 dark:bg-blue-400/15 border border-blue-200 dark:border-blue-500/25 text-[#0056c5] dark:text-blue-300 text-xs font-bold active:scale-95 transition-all cursor-pointer"
          >
            <Phone className="w-6 h-6" />
            <span>{PROFILE.contactCall}</span>
          </a>
        ) : null}
        {club?.email ? (
          <a
            href={`mailto:${club.email}`}
            data-testid="profile-contact-email"
            className="flex flex-col items-center gap-1.5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold active:scale-95 transition-all cursor-pointer"
          >
            <Mail className="w-6 h-6" />
            <span>{PROFILE.contactEmail}</span>
          </a>
        ) : null}
      </div>
    ) : (
      // The honest state, and a real one: a club that has not filled in its phone
      // number. Saying so beats two buttons that dial nothing.
      <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">
        {PROFILE.contactNone}
      </p>
    )}
    </>
  )
}

export function ContactSheet({ club, onClose }: { club: ClubDetails | null; onClose: () => void }) {
  const dialogRef = useDialog(true, onClose)

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4 modal-backdrop-blur transition-all duration-300">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-title"
        tabIndex={-1}
        data-testid="profile-contact-sheet"
        className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-[2rem] sm:rounded-[2rem] p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto border border-slate-100 dark:border-slate-800"
      >
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto -mt-1 sm:hidden" />

        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="text-start">
            <h3
              id="contact-title"
              className="text-base font-bold text-slate-900 dark:text-slate-50 leading-tight"
            >
              {PROFILE.contactTitle}
            </h3>
            {club ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{club.name}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={PROFILE.close}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <ContactActions club={club} />

        {club?.address ? (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center">
            {club.address}
          </p>
        ) : null}
      </div>
    </div>
  )
}
