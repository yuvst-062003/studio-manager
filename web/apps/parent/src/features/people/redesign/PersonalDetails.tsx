// פרטים אישיים — the guardian's OWN record, and a sheet to correct it.
//
// Owner review, 2026-09-06: "פרטים אישיים - לחיצה ליפתח פופאפ לעריכת דברים", and it opens
// the screen. It is not in the prototype at all: that design shows a family's children and
// never the parent, so this section is new rather than ported.
//
// `GET /me/profile` and `PATCH /me/profile` already existed — the route's own docstring is
// the reason this is safe to put on a tab: "no person id in the path or the body, so there
// is no shape in which this route could address the co-parent." A guardian corrects their
// own name, email and phone and nobody else's.
//
// The sheet SAVES ON SUBMIT, not on blur. The dashboard's settings panel autosaves per
// field because a manager is editing a club; a parent correcting their own phone number on
// a train should be able to change their mind, and a half-typed number written on blur is a
// club calling a number nobody has.
import { useState } from 'react'
import { Check, Pencil, User, X } from 'lucide-react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { useDialog } from '../../onboarding/wizard/useDialog'

export type MyDetails = {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
}

export function ProfilePersonalDetails({
  locale,
  details,
  onEdit,
}: {
  locale: Locale
  details: MyDetails | null
  onEdit: () => void
}) {
  return (
    <div className="space-y-4">
      <section
        aria-labelledby="profile-personal-heading"
        data-testid="profile-personal"
        className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-100 dark:border-slate-800 shadow-xs transition-colors"
      >
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3
            id="profile-personal-heading"
            className="text-sm font-bold text-slate-900 dark:text-slate-50 flex items-center gap-1.5"
          >
            <User className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            <span>{t(locale, 'people.profile.personalTitle')}</span>
          </h3>
          <button
            type="button"
            onClick={onEdit}
            disabled={details === null}
            data-testid="profile-personal-edit"
            className="flex items-center gap-1 text-xs font-bold text-[#0056c5] dark:text-blue-300 bg-blue-50 dark:bg-blue-400/15 px-3 py-1.5 rounded-xl disabled:opacity-50 active:scale-95 transition-all cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t(locale, 'people.profile.personalEdit')}</span>
          </button>
        </div>

        {details === null ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{t(locale, 'people.profile.loading')}</p>
        ) : (
          <dl className="space-y-2 text-start m-0">
            <Row
              label={t(locale, 'people.profile.personalName')}
              notSetLabel={t(locale, 'people.profile.personalNotSet')}
              value={`${details.firstName} ${details.lastName}`.trim()}
            />
            {/* An address and a number are LTR runs inside a right-to-left paragraph, so
                each goes in its own `bdi` — otherwise the digits of a phone number reorder
                around the punctuation and a parent reads their own number backwards. */}
            <Row
              label={t(locale, 'people.profile.personalEmail')}
              value={details.email}
              notSetLabel={t(locale, 'people.profile.personalNotSet')}
              ltr
            />
            <Row
              label={t(locale, 'people.profile.personalPhone')}
              value={details.phone}
              notSetLabel={t(locale, 'people.profile.personalNotSet')}
              ltr
            />
          </dl>
        )}
      </section>
    </div>
  )
}

function Row({
  label,
  value,
  notSetLabel,
  ltr = false,
}: {
  label: string
  value: string | null
  /** What an empty field says. Passed in rather than looked up, so `Row` needs no locale
   *  of its own for the one string it can render. */
  notSetLabel: string
  ltr?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <dt className="text-slate-500 dark:text-slate-400 shrink-0">{label}</dt>
      <dd className="font-semibold text-slate-900 dark:text-slate-50 m-0 truncate">
        {value ? (
          ltr ? (
            <bdi dir="ltr">{value}</bdi>
          ) : (
            value
          )
        ) : (
          <span className="font-normal text-slate-400">{notSetLabel}</span>
        )}
      </dd>
    </div>
  )
}

export function PersonalDetailsSheet({
  locale,
  details,
  busy,
  failed,
  onSave,
  onClose,
}: {
  locale: Locale
  details: MyDetails
  busy: boolean
  failed: boolean
  onSave: (next: MyDetails) => void
  onClose: () => void
}) {
  const dialogRef = useDialog(true, onClose)
  const [draft, setDraft] = useState<MyDetails>(details)

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4 modal-backdrop-blur transition-all duration-300">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="personal-sheet-title"
        tabIndex={-1}
        data-testid="profile-personal-sheet"
        className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-[2rem] sm:rounded-[2rem] p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto border border-slate-100 dark:border-slate-800"
      >
        {/* A real <form> inside the panel, so Enter submits and the browser's own required
            validation runs. The focus trap belongs to the PANEL — `useDialog` hands back a
            div ref — which is why the two are not the same element. */}
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            onSave(draft)
          }}
        >
          <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto -mt-1 sm:hidden" />

          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3
              id="personal-sheet-title"
              className="text-base font-bold text-slate-900 dark:text-slate-50 leading-tight text-start"
            >
              {t(locale, 'people.profile.personalSheetTitle')}
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label={t(locale, 'people.profile.close')}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <Field
            id="personal-first"
            label={t(locale, 'people.profile.personalFirstName')}
            value={draft.firstName}
            onChange={(firstName) => setDraft((d) => ({ ...d, firstName }))}
            required
          />
          <Field
            id="personal-last"
            label={t(locale, 'people.profile.personalLastName')}
            value={draft.lastName}
            onChange={(lastName) => setDraft((d) => ({ ...d, lastName }))}
            required
          />
          <Field
            id="personal-email"
            label={t(locale, 'people.profile.personalEmail')}
            type="email"
            value={draft.email ?? ''}
            onChange={(email) => setDraft((d) => ({ ...d, email: email || null }))}
          />
          <Field
            id="personal-phone"
            label={t(locale, 'people.profile.personalPhone')}
            type="tel"
            value={draft.phone ?? ''}
            onChange={(phone) => setDraft((d) => ({ ...d, phone: phone || null }))}
          />

          {failed ? (
            <p
              role="alert"
              data-testid="profile-personal-error"
              className="text-xs font-semibold text-[#ba1a1a] dark:text-red-300 bg-[#ffdad6] dark:bg-red-500/15 rounded-2xl p-3 text-start"
            >
              {t(locale, 'people.profile.personalSaveFailed')}
            </p>
          ) : null}

          <div className="pt-1 flex items-center gap-2">
            <button
              type="submit"
              disabled={busy || draft.firstName.trim() === '' || draft.lastName.trim() === ''}
              data-testid="profile-personal-save"
              className="flex-1 bg-[#001849] hover:bg-[#0d2c6c] disabled:opacity-60 text-white py-3.5 rounded-2xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{busy ? t(locale, 'people.profile.personalSaving') : t(locale, 'people.profile.personalSave')}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-2xl text-xs font-semibold transition-all cursor-pointer"
            >
              {t(locale, 'people.profile.personalCancel')}
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
    <div className="space-y-1.5 text-start">
      <label htmlFor={id} className="text-xs font-bold text-slate-700 dark:text-slate-300">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        // `dir="ltr"` on the two Latin/numeric fields: a Hebrew document would otherwise
        // put the caret on the wrong side of an email address as it is typed.
        dir={type === 'email' || type === 'tel' ? 'ltr' : undefined}
        className="w-full text-sm rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:border-[#0056c5] focus:ring-1 focus:ring-[#0056c5] p-3 text-start transition-all outline-none"
      />
    </div>
  )
}
