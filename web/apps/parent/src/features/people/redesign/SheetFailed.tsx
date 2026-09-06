// What a פרופיל sheet says when its own read failed.
//
// Every read on this screen used to end `.catch(() => setChildren([]))`, so a network
// failure told a family they had NO TRAINEES and left the payments sheet spinning on
// 'טוען…' for ever. An empty list is an answer; a failed read is not one, and the two must
// not look the same.
//
// Not `@studio/ui`'s `LoadFailed`: that draws an `Alert` and a `Button` from the design
// system, and this sits inside a Tailwind-ported sheet. `resolveLoadFailedText` is the
// shared piece — it is what says "you are offline" rather than "the club is broken" when
// the browser knows which it is.
import { RotateCcw } from 'lucide-react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { resolveLoadFailedText } from '../../shell/loadFailed'

export function SheetFailed({
  locale,
  onRetry,
}: {
  locale: Locale
  onRetry: () => void
}) {
  return (
    <div
      role="alert"
      data-testid="profile-sheet-failed"
      className="bg-[#ffdad6] dark:bg-red-500/15 border border-red-200 dark:border-red-500/25 rounded-2xl p-4 text-start space-y-2"
    >
      <p className="text-xs font-semibold text-[#ba1a1a] dark:text-red-300">
        {resolveLoadFailedText(locale, 'people.profile.sheetFailed')}
      </p>
      <button
        type="button"
        onClick={onRetry}
        data-testid="profile-sheet-retry"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0056c5] dark:text-blue-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition-all cursor-pointer"
      >
        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{t(locale, 'people.profile.sheetRetry')}</span>
      </button>
    </div>
  )
}
