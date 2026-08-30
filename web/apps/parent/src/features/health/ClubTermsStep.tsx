// Step 3 of `הסכם הרשמה` — the club's `תקנון` and `תנאי תשלום`.
//
// **This is what replaced D11's disclaimer.** The app used to print "the bundled questionnaire
// is a starting point only and is not a compliance document" on the parent's screen, the
// manager's editor and every PDF. That was honest about a question set we wrote and shipped to a
// club that had not reviewed it. Template v2 is the club's own form and these are the club's own
// terms, so the caveat became false — and what a family sees here is not a warning about our
// document but the club's real one, which they accept.
//
// **The acceptance is a `consent_record`, versioned and revocable** (§11.6), keyed to the
// SIGNING PERSON rather than the student — which is also why a second child in the same family
// never sees this step. The version posted back is the one this screen RENDERED: recording
// today's wording for a screen that showed last month's is how a consent ledger comes to hold
// agreements nobody made.
//
// **Skipped entirely when already held.** `AgreementFlow` does not render this step for a parent
// who accepted the current version, so someone correcting an asthma answer is not walked back
// through the `תקנון` they agreed to last month.
import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Alert, Button, Card, Checkbox } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  maxInlineSize: '34rem',
  marginInline: 'auto',
  inlineSize: '100%',
}

const clauseStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  marginBlockEnd: 'var(--space-3)',
}

export type ClubTermsStepProps = {
  locale: Locale
  onAccept: () => void
  onBack?: () => void
  sending?: boolean
  error?: string
}

/** The three clauses the club supplied, in the order the club wrote them. */
const PAYMENT_CLAUSE_KEYS = [
  'health.clubTerms.payment.cheques',
  'health.clubTerms.payment.cancellation',
  'health.clubTerms.payment.proRata',
] as const

export function ClubTermsStep({
  locale,
  onAccept,
  onBack,
  sending = false,
  error,
}: ClubTermsStepProps) {
  const [accepted, setAccepted] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setShowErrors(true)
    if (!accepted || sending) return
    onAccept()
  }

  return (
    <form onSubmit={submit} style={formStyle}>
      <header>
        <h2>{t(locale, 'health.clubTerms.title')}</h2>
      </header>

      <Card>
        <h3>{t(locale, 'health.clubTerms.payment.title')}</h3>
        {PAYMENT_CLAUSE_KEYS.map((key) => (
          <p data-testid={key} key={key} style={clauseStyle}>
            {t(locale, key)}
          </p>
        ))}
      </Card>

      <Checkbox
        block
        checked={accepted}
        label={t(locale, 'health.clubTerms.accept')}
        onChange={(event) => setAccepted(event.target.checked)}
      />

      {showErrors && !accepted ? (
        <Alert iconLabel={t(locale, 'health.clubTerms.required')} live tone="danger">
          {t(locale, 'health.clubTerms.required')}
        </Alert>
      ) : null}
      {error ? (
        <Alert iconLabel={error} live tone="danger">
          {error}
        </Alert>
      ) : null}

      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {onBack ? (
          <Button onClick={onBack} type="button" variant="ghost">
            {t(locale, 'health.agreement.back')}
          </Button>
        ) : null}
        <Button disabled={sending} type="submit" variant="primary">
          {t(locale, 'health.agreement.next')}
        </Button>
      </div>
    </form>
  )
}
