// Ported from `~/Downloads/staff-app/src/components/AccountView.tsx`'s edit-profile modal
// (its `isEditModalOpen` block), cut down to the fields `PATCH /api/v1/me/profile` actually
// takes — see `app/routers/students.py`'s `MyProfileUpdate` for the field names this mirrors
// exactly (`first_name`, `last_name`, `email`, `phone`).
//
// TWO of the prototype's fields are not here, on purpose, and `AccountScreen.tsx`'s own
// header names why: `coachProfile.rank` ("דרגת חגורה") has no field anywhere in this app to
// write to, and `coachProfile.role` ("תפקיד") is a role assignment a manager controls, not
// something the route lets a coach change about themself.
//
// Labels are `people.profile.personal*` — the exact keys the parent app's own
// `PersonalDetailsSheet` uses for the identical concept (a person correcting their own
// name/email/phone through this same route). Reusing them is this file's own house rule,
// stated at the top of `he/common.ts`'s account block: "almost every row ... reuses a key
// that already exists elsewhere."
import { useState } from 'react'
import { Check, Edit3, X } from 'lucide-react'
import { useModalDialog } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export type EditableProfile = {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
}

export function EditProfileSheet({
  locale,
  details,
  busy,
  failed,
  onSave,
  onClose,
}: {
  locale: Locale
  details: EditableProfile
  busy: boolean
  failed: boolean
  onSave: (next: EditableProfile) => void
  onClose: () => void
}) {
  const dialogRef = useModalDialog(true, onClose)
  const [draft, setDraft] = useState<EditableProfile>(details)

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-edit-title"
        tabIndex={-1}
        data-testid="account-edit-sheet"
        className="bg-[var(--surface-raised)] rounded-3xl p-5 w-full max-w-sm shadow-2xl relative space-y-4 border border-[var(--border)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[var(--emphasis-tint)] text-[var(--emphasis)] flex items-center justify-center font-bold">
              <Edit3 className="w-4 h-4" aria-hidden="true" />
            </div>
            <h2 id="account-edit-title" className="text-sm font-black text-[var(--fg)]">
              {t(locale, 'people.profile.personalSheetTitle')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(locale, 'people.profile.close')}
            className="w-7 h-7 rounded-lg bg-[var(--disabled-surface)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] flex items-center justify-center"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* A real <form>, so Enter submits and the browser's own `required` validation
            runs — same reasoning as the parent app's `PersonalDetailsSheet`. */}
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            onSave({
              firstName: draft.firstName.trim(),
              lastName: draft.lastName.trim(),
              email: draft.email?.trim() ? draft.email.trim() : null,
              phone: draft.phone?.trim() ? draft.phone.trim() : null,
            })
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <Field
              id="account-edit-first-name"
              label={t(locale, 'people.profile.personalFirstName')}
              value={draft.firstName}
              onChange={(firstName) => setDraft((current) => ({ ...current, firstName }))}
              required
            />
            <Field
              id="account-edit-last-name"
              label={t(locale, 'people.profile.personalLastName')}
              value={draft.lastName}
              onChange={(lastName) => setDraft((current) => ({ ...current, lastName }))}
              required
            />
          </div>

          <Field
            id="account-edit-phone"
            label={t(locale, 'people.profile.personalPhone')}
            type="tel"
            value={draft.phone ?? ''}
            onChange={(phone) => setDraft((current) => ({ ...current, phone: phone || null }))}
          />

          <Field
            id="account-edit-email"
            label={t(locale, 'people.profile.personalEmail')}
            type="email"
            value={draft.email ?? ''}
            onChange={(email) => setDraft((current) => ({ ...current, email: email || null }))}
          />

          {failed ? (
            <p
              role="alert"
              data-testid="account-edit-error"
              className="text-xs font-semibold text-[var(--danger)] bg-[var(--danger-tint)] rounded-2xl p-3"
            >
              {t(locale, 'people.profile.personalSaveFailed')}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl bg-[var(--disabled-surface)] hover:bg-[var(--border)] text-[var(--text-secondary)] font-bold text-xs active:scale-95 transition-all"
            >
              {t(locale, 'people.profile.personalCancel')}
            </button>
            <button
              type="submit"
              disabled={busy || draft.firstName.trim() === '' || draft.lastName.trim() === ''}
              className="h-10 rounded-xl bg-[var(--emphasis)] hover:brightness-110 disabled:opacity-60 text-[var(--on-emphasis)] font-bold text-xs shadow-md shadow-blue-600/20 active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
              <span>
                {busy ? t(locale, 'people.profile.personalSaving') : t(locale, 'people.profile.personalSave')}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  type?: string
  required?: boolean
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-bold text-[var(--text-secondary)]">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        // A Hebrew document would otherwise put the caret on the wrong side of an email
        // address or a phone number as it is typed — the same fix `PersonalDetails.tsx`
        // applies for the identical reason.
        dir={type === 'email' || type === 'tel' ? 'ltr' : undefined}
        className="w-full h-10 px-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--fg)] focus:outline-none focus:ring-2 focus:ring-[var(--emphasis)]"
      />
    </div>
  )
}
