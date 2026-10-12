// Revision 0025's ask — "who should we call if you get hurt?" — as a SETTING, not a gate.
//
// **Why it moved (owner, 2026-10-12).** It shipped as a first-run step: shown to assistant
// coaches with nobody on file, skippable, and the skip deliberately not remembered so the
// ask returned next launch. The reasoning was sound on paper and wrong in the hand — the
// owner, who is an assistant coach as well as a manager, met the form every single time the
// app opened and could not reach the mat without dismissing it. A prompt that stands between
// a coach and their roster twice a day is not a safety feature, it is a thing to tap past,
// and the tapping past is what it taught.
//
// So the field lives here, in the account tab, small: filled in once when there is a quiet
// minute, editable afterwards — which the step never allowed, since it vanished the moment
// a name existed and left no way to correct a number that changed.
//
// **Still assistant coaches only**, for the reason 0025 gave and this move does not touch:
// an assistant is typically a teenager helping on the mat whose parent's number the club
// does not otherwise hold, while a manager or lead coach is an adult member of staff whose
// details the club already has. Asking everyone would collect personal data about third
// parties the product has no use for.
import { useState } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { MyProfile, StaffPeopleClient } from '../people'

export type EmergencyContactInput = {
  emergency_contact_name: string
  emergency_contact_phone: string
  emergency_contact_relation: string
}

/**
 * Whether to offer the setting at all.
 *
 * Exported and pure so the account screen's own test can assert the rule without rendering
 * anything. A person who is an assistant in one studio and a manager in another is judged
 * on the ACTIVE membership, the same place every other role question in this app is
 * answered. `includes`, not "has no manager role": somebody who is both is on the mat as an
 * assistant, and offering is the safer of the two errors.
 */
export function shouldOfferEmergencyContact(roles: readonly string[]): boolean {
  return roles.includes('assistant_coach')
}

export function EmergencyContactSetting({
  locale,
  client,
  profile,
}: {
  locale: Locale
  client: StaffPeopleClient
  /** The account screen's own `/me/profile` read, so this adds no second request. Absent
   *  while that read is in flight, which is why the fields fill in rather than start empty. */
  profile: MyProfile | null
}) {
  // Seeded from what is on file, NOT adopted in an effect: a setState in an effect body
  // cascades a render and this codebase's React Compiler rule refuses it (the same note
  // `GroupCoachPanel` carries). The account screen re-keys this component when the profile
  // arrives, so these initialisers run again with the real values — and a reader typing is
  // never interrupted by a late read, because a remount only happens on that one transition.
  const [name, setName] = useState(profile?.emergency_contact_name ?? '')
  const [phone, setPhone] = useState(profile?.emergency_contact_phone ?? '')
  const [relation, setRelation] = useState(profile?.emergency_contact_relation ?? '')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [saved, setSaved] = useState(false)

  // A name and a number. The relation is genuinely optional — "אמא" helps whoever dials,
  // and a blank one never stopped anybody calling.
  const complete = name.trim().length > 0 && phone.trim().length > 0

  async function save(): Promise<void> {
    if (!complete || saving) return
    setSaving(true)
    setFailed(false)
    setSaved(false)
    try {
      await client.updateMyProfile({
        emergency_contact_name: name.trim(),
        emergency_contact_phone: phone.trim(),
        emergency_contact_relation: relation.trim(),
      })
      setSaved(true)
    } catch {
      // A number that was not recorded is not a number anyone can call.
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  const field = (
    key: 'name' | 'phone' | 'relation',
    value: string,
    setValue: (next: string) => void,
  ) => (
    <label className="block">
      <span className="block text-[11px] font-bold text-[var(--text-secondary)]">
        {t(locale, `people.emergency.${key}`)}
      </span>
      <input
        type={key === 'phone' ? 'tel' : 'text'}
        data-testid={`emergency-${key}`}
        value={value}
        onChange={(event) => {
          setValue(event.currentTarget.value)
          setSaved(false)
        }}
        // `tel` brings up a keypad; the value stays a string the server treats as free text
        // (numbers here are written a dozen ways and none of them is wrong).
        inputMode={key === 'phone' ? 'tel' : undefined}
        className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
      />
    </label>
  )

  return (
    <div className="flex flex-col gap-2.5" data-testid="emergency-contact-setting">
      <p className="text-[11px] leading-relaxed text-[var(--text-muted)] m-0">
        {t(locale, 'people.emergency.body')}
      </p>

      {field('name', name, setName)}
      {field('phone', phone, setPhone)}
      {field('relation', relation, setRelation)}

      {failed ? (
        <p
          role="alert"
          data-testid="emergency-failed"
          className="rounded-xl bg-[var(--danger-tint)] px-3 py-2 text-[11px] font-bold text-[var(--danger)] m-0"
        >
          {t(locale, 'people.emergency.saveFailed')}
        </p>
      ) : null}

      {saved ? (
        <p
          role="status"
          data-testid="emergency-saved"
          className="text-[11px] font-bold text-[var(--emphasis)] m-0"
        >
          {t(locale, 'people.emergency.saved')}
        </p>
      ) : null}

      <button
        type="button"
        data-testid="emergency-save"
        disabled={!complete || saving}
        onClick={() => void save()}
        className="min-h-11 w-full rounded-xl bg-[var(--emphasis)] py-2 text-xs font-black text-[var(--on-emphasis)] disabled:bg-[var(--border)] disabled:text-[var(--text-muted)]"
      >
        {t(locale, saving ? 'people.emergency.saving' : 'people.emergency.save')}
      </button>
    </div>
  )
}
