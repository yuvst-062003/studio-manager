// The one bottom sheet every פרופיל row opens.
//
// The screen became a card of button-rows on the owner's review of 2026-09-06 — "כרטיס של
// כפתורים, שהמסך לא יהיה מלא וערום" — so there are now five sheets where there were two,
// and the dialog plumbing is the same in every one: the focus trap, Escape, the scroll
// lock, the drag handle, the titled header and the close button.
//
// Written once. Five copies of a focus trap is five places for one of them to be subtly
// wrong, and the wrong one is always the one nobody opened with a keyboard.
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useDialog } from '../../onboarding/wizard/useDialog'
import { PROFILE } from './content'

export function Sheet({
  title,
  subtitle,
  testId,
  onClose,
  children,
}: {
  title: string
  subtitle?: string | null
  testId: string
  onClose: () => void
  children: ReactNode
}) {
  const dialogRef = useDialog(true, onClose)
  const titleId = `${testId}-title`

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4 modal-backdrop-blur transition-all duration-300">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-[2rem] sm:rounded-[2rem] p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto border border-slate-100 dark:border-slate-800"
      >
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto -mt-1 sm:hidden" />

        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="text-start min-w-0">
            <h3
              id={titleId}
              className="text-base font-bold text-slate-900 dark:text-slate-50 leading-tight"
            >
              {title}
            </h3>
            {subtitle ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={PROFILE.close}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {children}
      </div>
    </div>
  )
}
