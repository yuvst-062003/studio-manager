// "יצירת קשר" — ported from the prototype's ProfileScreen MODAL 1.
//
// TWO ACTIONS, NOT THREE. The prototype offers WhatsApp, a phone call and email. `Studio`
// has `address` and `phone` and no email column anywhere, so the third button would either
// be dead or would need an address invented for it — and a mailto: to a guessed address is
// a message a club never receives. It is dropped rather than disabled: a greyed-out control
// still promises a feature that does not exist.
//
// Both remaining actions are ordinary links with a scheme the phone already knows —
// `https://wa.me/…` and `tel:` — so they work with no permission, no SDK and no JS, and a
// long-press "copy number" behaves the way a parent expects.
import { MessageCircle, Phone, X } from 'lucide-react'
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

export function ContactSheet({ club, onClose }: { club: ClubDetails | null; onClose: () => void }) {
  const dialogRef = useDialog(true, onClose)
  const wa = whatsappNumber(club?.phone ?? null)

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

        {club?.phone ? (
          <div className="grid grid-cols-2 gap-2.5">
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
            <a
              href={`tel:${club.phone}`}
              data-testid="profile-contact-call"
              className="flex flex-col items-center gap-1.5 p-4 rounded-2xl bg-blue-50 dark:bg-blue-400/15 border border-blue-200 dark:border-blue-500/25 text-[#0056c5] dark:text-blue-300 text-xs font-bold active:scale-95 transition-all cursor-pointer"
            >
              <Phone className="w-6 h-6" />
              <span>{PROFILE.contactCall}</span>
            </a>
          </div>
        ) : (
          // The honest state, and a real one: a club that has not filled in its phone
          // number. Saying so beats two buttons that dial nothing.
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">
            {PROFILE.contactNoPhone}
          </p>
        )}

        {club?.address ? (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center">
            {club.address}
          </p>
        ) : null}
      </div>
    </div>
  )
}
