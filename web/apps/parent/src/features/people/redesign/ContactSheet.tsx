// "צור קשר עם המועדון" — the three ways to reach the club, drawn as one row.
//
// ALL THREE ACTIONS the prototype offers — email, WhatsApp and a call, in that order
// (owner review, 2026-09-06). Email leads because it is the one that does not interrupt
// anybody: a parent with a question at 22:00 should meet it first.
//
// The dialog this file used to export went with that review — פרטי הגעה and יצירת קשר
// merged into one המועדון sheet, so the buttons live inside a panel `sheets.tsx` owns and
// the wrapper had no caller left.
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
import { Mail, MessageCircle, Phone } from 'lucide-react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
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
 * `useDialog` nested in `Sheet`'s would fight the same focus trap. `DirectionsActions`
 * beside it is a disclosure for the same reason.
 */
export function ContactActions({
  club,
  locale,
}: {
  club: ClubDetails | null
  locale: Locale
}) {
  const wa = whatsappNumber(club?.phone ?? null)
  const count = (wa ? 1 : 0) + (club?.phone ? 1 : 0) + (club?.email ? 1 : 0)
  const hasAny = count > 0

  return (
    <>
        {hasAny ? (
      <div className={`grid gap-2.5 ${count >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {club?.email ? (
          <a
            href={`mailto:${club.email}`}
            data-testid="profile-contact-email"
            className="flex flex-col items-center gap-1.5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold active:scale-95 transition-all cursor-pointer"
          >
            <Mail className="w-6 h-6" />
            <span>{t(locale, 'people.profile.contactEmail')}</span>
          </a>
        ) : null}
        {wa ? (
          <a
            href={`https://wa.me/${wa}`}
            target="_blank"
            rel="noreferrer"
            data-testid="profile-contact-whatsapp"
            className="flex flex-col items-center gap-1.5 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 text-emerald-800 dark:text-emerald-300 text-xs font-bold active:scale-95 transition-all cursor-pointer"
          >
            <MessageCircle className="w-6 h-6" />
            <span>{t(locale, 'people.profile.contactWhatsApp')}</span>
          </a>
        ) : null}
        {club?.phone ? (
          <a
            href={`tel:${club.phone}`}
            data-testid="profile-contact-call"
            className="flex flex-col items-center gap-1.5 p-4 rounded-2xl bg-blue-50 dark:bg-blue-400/15 border border-blue-200 dark:border-blue-500/25 text-[#0056c5] dark:text-blue-300 text-xs font-bold active:scale-95 transition-all cursor-pointer"
          >
            <Phone className="w-6 h-6" />
            <span>{t(locale, 'people.profile.contactCall')}</span>
          </a>
        ) : null}
      </div>
    ) : (
      // The honest state, and a real one: a club that has not filled in its phone
      // number. Saying so beats two buttons that dial nothing.
      <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">
        {t(locale, 'people.profile.contactNone')}
      </p>
    )}
      {/* Who the club IS, under the ways to reach it. A family that needs to write to the
          registering body — a complaint, a cancellation, a rights request — needs its
          registered name and number, and the תקנון they signed is behind an onboarding they
          have already finished. Unconditional: unlike the buttons above, this does not
          depend on a setting anyone had to fill in. */}
      <p
        data-testid="profile-club-entity"
        className="text-[11px] text-slate-400 dark:text-slate-500 text-center pt-3"
      >
        {t(locale, 'health.clubTerms.entity')}
      </p>
    </>
  )
}
