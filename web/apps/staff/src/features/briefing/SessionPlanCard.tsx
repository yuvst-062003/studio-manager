// §6.2 of the staff app redesign — the session briefing's one editor, shared between the
// register (`attendance/RosterScreen.tsx`, where it has always lived and still renders it
// inline at the top) and the schedule tab's card (`schedule/TodayScreen.tsx`, where the
// marker that used to be read-only decoration became a door onto this same component,
// 2026-09-07).
//
// **Extracted, not rewritten.** Two screens reading and writing one field is exactly the
// shape that produced `PaymentStrip` — two editors for one thing that drifted apart until
// one of them was deleted. This file is the one editor; `attendance` and `schedule` both
// import it and neither owns it, which is why it lives in its own feature directory rather
// than either one's — a lane reading either screen should not have to reopen the other's
// folder to find where a shared control is defined.
import { useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

/**
 * §6.2, decision 16 — the briefing, read from the cache and (for the trio permitted to)
 * written straight to the API. Renders nothing at all when there is no briefing and the
 * viewer cannot add one: an empty card with a title and no content would be noise on a
 * screen a coach reads in the seconds before a class starts, and an assistant coach with
 * nothing left for them should see nothing here rather than an invitation to write.
 *
 * Two callers, one component: `RosterScreen` renders this inline, at the top of the
 * register, exactly as it did before the extraction. `TodayScreen` renders it inside a
 * dialog opened from the schedule card's own briefing marker. Same read rule, same write
 * rule, same failure handling, in exactly one place either way.
 */
export function SessionPlanCard({
  locale,
  plan,
  canWrite,
  onSave,
}: {
  locale: Locale
  plan: string | null
  canWrite: boolean
  onSave: (body: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(plan ?? '')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  if (plan === null && !canWrite) return null

  if (editing) {
    return (
      <section
        className="flex flex-col gap-2 rounded-3xl border border-blue-200 bg-blue-50/70 p-4"
        data-testid="session-plan-editor"
      >
        <label className="text-xs font-bold text-blue-900" htmlFor="session-plan-body">
          {t(locale, 'attendance.briefing.title')}
        </label>
        <textarea
          className="min-h-24 rounded-2xl border border-blue-200 bg-white p-3 text-sm text-slate-900"
          data-testid="session-plan-input"
          id="session-plan-body"
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t(locale, 'attendance.briefing.placeholder')}
          value={draft}
        />
        {failed ? (
          <p className="text-xs font-semibold text-rose-600" role="alert">
            {t(locale, 'attendance.briefing.saveFailed')}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <button
            className="rounded-xl px-3 py-1.5 text-xs font-bold text-slate-500 transition-all active:scale-95"
            onClick={() => {
              setEditing(false)
              setFailed(false)
              setDraft(plan ?? '')
            }}
            type="button"
          >
            {t(locale, 'attendance.briefing.cancel')}
          </button>
          <button
            className="rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-60"
            data-testid="session-plan-save"
            disabled={saving || draft.trim().length === 0}
            onClick={() => {
              const body = draft.trim()
              setSaving(true)
              setFailed(false)
              onSave(body)
                .then(() => setEditing(false))
                .catch(() => setFailed(true))
                .finally(() => setSaving(false))
            }}
            type="button"
          >
            {t(locale, saving ? 'attendance.briefing.saving' : 'attendance.briefing.save')}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section
      className="flex flex-col gap-1.5 rounded-3xl border border-blue-200 bg-blue-50/70 p-4"
      data-testid="session-plan"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
          <ClipboardList aria-hidden="true" className="h-3.5 w-3.5" />
          {t(locale, 'attendance.briefing.title')}
        </h2>
        {/* Decision 16 — "an assistant coach sees the plan and no editor." This button, the
            only way into `editing`, is the entire gate: no `canWrite` prop means no way to
            reach a screen the server would refuse the save from anyway. */}
        {canWrite ? (
          <button
            className="text-xs font-bold text-blue-700"
            data-testid="session-plan-edit"
            onClick={() => {
              // Set here, on the transition into editing, rather than synced by an effect
              // watching `plan` — the draft only matters while the editor is open, so there
              // is nothing to keep synchronized while it is closed.
              setDraft(plan ?? '')
              setEditing(true)
            }}
            type="button"
          >
            {t(locale, plan ? 'attendance.briefing.edit' : 'attendance.briefing.add')}
          </button>
        ) : null}
      </div>
      {plan ? (
        <p className="whitespace-pre-wrap text-sm text-slate-700">{plan}</p>
      ) : (
        <p className="text-xs text-slate-400">{t(locale, 'attendance.briefing.empty')}</p>
      )}
    </section>
  )
}
