// §5.3 — "add the parent", for a child who has none yet (2026-10-04).
//
// The club-migration load brings Gladiator's roster with no family on any row, and the owner
// chose to load the children first and add each parent afterwards. This is where that
// happens: on the child's own card, under הורים, shown only while the list is empty. A phone
// OR an email is required, which is `GuardianCreate`'s own rule — the button stays disabled
// until one is typed, and the hint says why, so it never greys without a reason.
//
// Nothing reaches the parent from here. The server mints the invitation and holds it; the
// card's existing "send the invitation" button is the one deliberate send.
import { useState } from 'react'
import { Button } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export type NewGuardian = {
  first_name?: string
  last_name?: string
  email?: string | null
  phone?: string | null
}

export function AddGuardianForm({
  locale,
  onSubmit,
}: {
  locale: Locale
  /** Resolves true when the parent was saved; the card reloads and this form goes away. */
  onSubmit: (body: NewGuardian) => Promise<boolean>
}) {
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const reachable = phone.trim() !== '' || email.trim() !== ''

  async function save() {
    if (!reachable || busy) return
    setBusy(true)
    setFailed(false)
    const ok = await onSubmit({
      first_name: first.trim() || undefined,
      last_name: last.trim() || undefined,
      phone: phone.trim() || null,
      email: email.trim() || null,
    }).catch(() => false)
    setBusy(false)
    if (!ok) setFailed(true)
  }

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    testId: string,
    type = 'text',
    ltr = false,
  ) => (
    <label className="studio-field">
      <span className="studio-field__label">{label}</span>
      <input
        className="studio-field__input"
        data-testid={testId}
        dir={ltr ? 'ltr' : undefined}
        onChange={(event) => set(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  )

  return (
    <div className="student-card__stack" data-testid="add-guardian">
      {field(t(locale, 'people.guardian.addFirst'), first, setFirst, 'add-guardian-first')}
      {field(t(locale, 'people.guardian.addLast'), last, setLast, 'add-guardian-last')}
      {field(
        t(locale, 'people.guardian.phone'),
        phone,
        setPhone,
        'add-guardian-phone',
        'tel',
        true,
      )}
      {field(
        t(locale, 'people.guardian.addEmail'),
        email,
        setEmail,
        'add-guardian-email',
        'email',
        true,
      )}
      <span className="student-card__muted" id="add-guardian-hint">
        {t(locale, 'people.guardian.addHint')}
      </span>
      <Button
        aria-describedby="add-guardian-hint"
        data-testid="add-guardian-save"
        disabled={!reachable || busy}
        onClick={() => void save()}
      >
        {t(locale, 'people.guardian.addSave')}
      </Button>
      {failed ? (
        <span data-testid="add-guardian-failed" role="alert">
          {t(locale, 'people.guardian.addFailed')}
        </span>
      ) : null}
    </div>
  )
}
