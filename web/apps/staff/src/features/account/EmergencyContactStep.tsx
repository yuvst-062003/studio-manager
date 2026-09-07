// Revision 0025's ask — "who should we call if you get hurt?" — shown to ASSISTANT COACHES
// and to nobody else.
//
// **Why that role alone.** An assistant coach is typically a teenager or a young adult
// helping on the mat, often a graduate of the club's own youth groups, and if one is hurt
// mid-session the person to phone is a parent whose number the club does not otherwise
// hold. A manager or lead coach is an adult member of staff whose details the club already
// has. Asking everyone would collect personal data about third parties the product has no
// use for; asking nobody leaves a fifteen-year-old on a mat with an injury and no number.
//
// **Skippable, and the skip is NOT remembered.** §5.5's argument about health declarations
// applies exactly: a hard block makes records less accurate without making anyone safer, so
// there is a "later". But the skip lives in this component's own state and dies with the
// launch — a device-local "dismissed" flag would let one tap hide a safety field forever,
// on a phone the club never sees. The honest state is the field being empty, so the ask
// returns next launch and stops the moment it is filled in. One tap to postpone is a fair
// price for that.
//
// **It stands AFTER the consent gate**, which is the hard one, and before nothing else: it
// is a step, not a second gate, and the app is fully usable behind it.
import { useState } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export type EmergencyContactInput = {
  emergency_contact_name: string
  emergency_contact_phone: string
  emergency_contact_relation: string
}

/**
 * Whether to ask at all.
 *
 * Exported and pure so the shell's own test can assert the rule without rendering
 * anything: an assistant coach with nothing on file, and no other combination. A person who
 * is an assistant in one studio and a manager in another is judged on the ACTIVE
 * membership, the same place every other role question in this app is answered.
 */
export function shouldAskForEmergencyContact(
  roles: readonly string[],
  onFile: string | null | undefined,
): boolean {
  if (onFile) return false
  // `includes`, not "has no manager role": a person who is BOTH an assistant coach and a
  // manager is on the mat as an assistant, and being asked is the safer of the two errors.
  return roles.includes('assistant_coach')
}

export function EmergencyContactStep({
  locale,
  onSave,
  onSkip,
}: {
  locale: Locale
  onSave: (input: EmergencyContactInput) => Promise<void>
  onSkip: () => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [relation, setRelation] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  // A name and a number. The relation is genuinely optional — "אמא" helps whoever dials,
  // and a blank one never stopped anybody calling.
  const complete = name.trim().length > 0 && phone.trim().length > 0

  async function save() {
    if (!complete || saving) return
    setSaving(true)
    setFailed(false)
    try {
      await onSave({
        emergency_contact_name: name.trim(),
        emergency_contact_phone: phone.trim(),
        emergency_contact_relation: relation.trim(),
      })
    } catch {
      // Stays up. A number that was not recorded is not a number anyone can call.
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  const field = (
    key: 'name' | 'phone' | 'relation',
    value: string,
    setValue: (next: string) => void,
    type: string,
  ) => (
    <label className="block">
      <span className="block text-xs font-bold text-[var(--text-secondary)]">
        {t(locale, `people.emergency.${key}`)}
      </span>
      <input
        type={type}
        data-testid={`emergency-${key}`}
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
        // `tel` rather than `text` on the phone: it brings up a keypad, and the value is
        // still a string the server treats as free text (numbers here are written a dozen
        // ways and none of them is wrong).
        inputMode={key === 'phone' ? 'tel' : undefined}
        className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
      />
    </label>
  )

  return (
    <div
      className="tw-scope flex flex-col gap-4 px-4 pt-6 pb-8"
      data-testid="emergency-contact-step"
    >
      <header>
        <h1 className="text-2xl font-black text-[var(--fg)]">
          {t(locale, 'people.emergency.title')}
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
          {t(locale, 'people.emergency.body')}
        </p>
      </header>

      <section className="flex flex-col gap-3 rounded-3xl border border-[var(--border)] bg-[var(--surface-raised)] p-4 shadow-sm">
        {field('name', name, setName, 'text')}
        {field('phone', phone, setPhone, 'tel')}
        {field('relation', relation, setRelation, 'text')}
      </section>

      {failed ? (
        <p
          role="alert"
          data-testid="emergency-failed"
          className="rounded-2xl bg-[var(--danger-tint)] px-3 py-2 text-xs font-bold text-[var(--danger)]"
        >
          {t(locale, 'people.emergency.saveFailed')}
        </p>
      ) : null}

      <button
        type="button"
        data-testid="emergency-save"
        disabled={!complete || saving}
        onClick={() => void save()}
        className="w-full rounded-2xl bg-[var(--emphasis)] py-3 text-sm font-black text-[var(--on-emphasis)] disabled:bg-[var(--border)] disabled:text-[var(--text-muted)]"
      >
        {t(locale, saving ? 'people.emergency.saving' : 'people.emergency.save')}
      </button>

      <button
        type="button"
        data-testid="emergency-skip"
        onClick={onSkip}
        className="w-full py-2 text-xs font-bold text-[var(--text-muted)]"
      >
        {t(locale, 'people.emergency.later')}
      </button>
    </div>
  )
}
