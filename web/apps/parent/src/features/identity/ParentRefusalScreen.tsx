// #32 — the parent app's own refusal screen (owner, 2026-09-08).
//
// > "The error page needs a redesign. The club logo centred, an error message or a prompt
// > for an invitation code, and a way back to sign-in. No redirect to the other app."
//
// **What it replaces, and why the replacement is a new file rather than an edit.** This
// screen was `@studio/ui`'s `RefusalScreen`, shared by all three apps, and its §6.1
// contract is the sentence the owner is overruling: *"a person who signs in to an app they
// have no business in is told which app is theirs and given a direct link, not a dead
// end."* For a manager who is not a guardian that link is defensible; for the person the
// parent app actually refuses — any Google account can authenticate and belong to nothing —
// `/staff` is a door that will refuse them a second time. Editing the shared component
// would have taken the link away from the staff app and the dashboard too, which nobody
// asked for. So `RefusalScreen` is untouched and unimported here; those two keep it.
//
// **`data-testid="parent-refusal"` is deliberately the same.** `App.test.tsx`,
// `features/schedule/mounted.test.tsx` and this feature's own tests all assert that a
// refused session reaches a refusal instead of the shell, and that property did not change
// — only what the refusal looks like. A new test id would have quietly retired four guards.
//
// **The "or" is answered with "and".** §6.1 step 3's no-match arm has to stay one tap deep:
// a correctly-invited parent whose email differs from the invitation by one character
// cannot tell their situation from a genuine refusal, and hiding the code field behind a
// disclosure is asking them to guess that it exists.
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

/**
 * The bundled club mark — the same asset `features/landing/clubContent.ts` falls back to.
 *
 * Served from this app's own `public/`, not from `GET /public/studios/{slug}/logo`: the
 * person looking at this screen has no studio, so there is no slug to ask about and no
 * membership that would authorise the read. A refusal that has to fetch before it can draw
 * is a refusal that flashes empty on a slow connection.
 */
const CLUB_LOGO_URL = '/clubs/gladiator-logo.png'

export function ParentRefusalScreen({
  locale,
  email,
  code,
  onCodeChange,
  onRedeem,
  onSignOut,
}: {
  locale: Locale
  /** The signed-in account's OWN address, echoed back the way Google's account chooser
   *  does. Optional and omitted entirely when absent — a caller mid-refresh with no answer
   *  yet must not render "signed in as null". */
  email?: string | null
  code: string
  onCodeChange: (next: string) => void
  onRedeem: () => void
  onSignOut: () => void
}) {
  return (
    <section
      data-testid="parent-refusal"
      className="min-h-dvh flex flex-col items-center justify-center gap-4 px-6 py-10 text-center bg-slate-50 dark:bg-slate-950"
    >
      <img
        src={CLUB_LOGO_URL}
        alt={t(locale, 'common.appName.parent')}
        data-testid="refusal-logo"
        className="w-24 h-24 object-contain mx-auto"
      />

      <div className="space-y-1.5">
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">
          {t(locale, 'common.refusal.parent.title')}
        </h1>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          {t(locale, 'common.refusal.parent.body')}
        </p>
        {email ? (
          // `<bdi>` isolates the address's own (LTR) direction from the RTL document —
          // without it an address reads with its characters reordered inside Hebrew copy.
          // The narrow exception to §6.1's no-enumeration rule, and the reason is unchanged
          // from the shared screen's: it says nothing about the club, only about which of
          // the visitor's own accounts they are looking at it with. Someone signed into the
          // wrong Google account cannot otherwise tell that is the problem.
          <p
            data-testid="refusal-account"
            className="text-[11px] text-slate-500 dark:text-slate-400"
          >
            <bdi>{t(locale, 'common.refusal.signedInAs').replace('{email}', email)}</bdi>
          </p>
        ) : null}
      </div>

      {/* §6.1 step 3's 'no match' branch. A `<form>` and not a loose button, so Enter in
          the field submits — a parent typing a code on a phone keyboard reaches for the
          return key, not for a target below the fold. */}
      <form
        data-testid="parent-no-match"
        onSubmit={(event) => {
          event.preventDefault()
          onRedeem()
        }}
        className="w-full max-w-xs space-y-2 text-start"
      >
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {t(locale, 'common.auth.notFound')}
        </p>
        <label
          htmlFor="invite-code"
          className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold block"
        >
          {t(locale, 'common.auth.inviteCodeLabel')}
        </label>
        <input
          id="invite-code"
          value={code}
          onChange={(event) => onCodeChange(event.target.value)}
          className="w-full text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-600 p-2.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:border-[#0056c5] focus:ring-1 focus:ring-[#0056c5] outline-none"
        />
        <button
          type="submit"
          className="w-full bg-[#0056c5] text-white text-xs font-bold py-2.5 rounded-xl shadow-xs hover:bg-blue-800 active:scale-95 transition-transform cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0056c5]"
        >
          {t(locale, 'common.auth.haveInviteCode')}
        </button>
      </form>

      {/* The way out, and the ONLY navigation on this screen. §6.1 kept sign-out here for
          a reason that survives the redesign: without it the only escape is clearing site
          data, which a parent on a phone will not find. What changed is the label — the
          person at this screen wants to come back as somebody else, not to "sign out". */}
      <button
        type="button"
        onClick={onSignOut}
        data-testid="refusal-back-to-sign-in"
        className="text-xs font-bold text-[#0056c5] dark:text-blue-300 underline underline-offset-4 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0056c5]"
      >
        {t(locale, 'common.auth.backToSignIn')}
      </button>
    </section>
  )
}
