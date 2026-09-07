// Notifications, asked once and then left alone — in Profile, not on עדכונים.
//
// **What this replaces** (owner, 2026-09-07). The invitation and the disabled banner both
// lived above the feed on עדכונים. A parent who had not answered met "הפעלת התראות" on every
// single visit to their inbox, and a parent whose phone had refused met a red banner telling
// them they would miss cancellation notices — permanently, on the screen they had opened to
// read notices. §5.11 called that banner non-dismissible on purpose, to convert denials. In
// practice it converted the inbox into a complaint.
//
// **So it moved rather than died.** A parent who wants notifications goes looking for them,
// and Settings is where they look. Nothing here appears anywhere else, nothing here nags,
// and everything §5.11 asked for is still reachable — it is just reachable on request.
//
// **One question, not two.** On עדכונים this was a button that opened a card that asked. A
// parent who has walked into Settings has already expressed the intent that button existed
// to collect, so the question is put directly. The rule §6.5 cares about is untouched: the
// OS dialog opens from the accept button and from nowhere else, because on iOS a refusal is
// permanent and cannot be asked again from inside the app.
import { Bell } from 'lucide-react'
import { apiFetch } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { makeParentCommsClient } from './commsClient'
import { PushDisabledBanner } from './PushDisabledBanner'
import { usePushRegistration } from './usePushRegistration'
import type { ParentCommsClient } from './commsClient'

export function PushSetting({
  locale,
  client,
  userAgent,
}: {
  locale: Locale
  /** Injected by tests; Profile mounts this with the app's own fetcher. */
  client?: ParentCommsClient
  userAgent?: string
}) {
  const push = usePushRegistration(
    client ?? makeParentCommsClient(apiFetch),
    userAgent === undefined ? {} : { userAgent },
  )

  return (
    <div data-testid="push-setting" className="px-3.5 py-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <Bell className="w-4 h-4 text-slate-400" aria-hidden="true" />
          {t(locale, 'comms.push.settingTitle')}
        </span>
        {push.state === 'registered' ? (
          <span data-testid="push-on" className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
            {t(locale, 'comms.pushEnabled.confirmation')}
          </span>
        ) : null}
      </div>

      {/* The refusal, and the iOS-tab case that is not a refusal at all. Same component the
          feed used to carry; the only change is that a parent now meets it here, having
          asked, rather than every time they open their inbox. */}
      <PushDisabledBanner locale={locale} state={push.state} />

      {/* Asked outright: this screen IS the intent the old two-step collected. */}
      {push.state === 'unasked' || push.state === 'pre-prompt' ? (
        <div data-testid="push-pre-prompt" className="space-y-2 text-start">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {t(locale, 'comms.push.prePrompt.body')}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void push.ask()}
              className="flex-1 bg-[#0056c5] text-white text-xs font-bold py-2.5 rounded-xl shadow-xs hover:bg-blue-800 active:scale-95 transition-transform cursor-pointer"
            >
              {t(locale, 'comms.push.prePrompt.accept')}
            </button>
            <button
              type="button"
              onClick={push.decline}
              className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold py-2.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-transform cursor-pointer"
            >
              {t(locale, 'comms.push.prePrompt.decline')}
            </button>
          </div>
        </div>
      ) : null}

      {/* Said no, and came back. Nothing nags a parent who declined — but Settings is where
          somebody goes to change their mind, so the door is here and only here. */}
      {push.state === 'declined' ? (
        <button
          type="button"
          onClick={push.offer}
          data-testid="push-enable"
          className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-[#0056c5] dark:text-blue-300 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-[0.99] transition-all cursor-pointer"
        >
          <Bell className="w-4 h-4" aria-hidden="true" />
          <span>{t(locale, 'comms.push.enable')}</span>
        </button>
      ) : null}
    </div>
  )
}
