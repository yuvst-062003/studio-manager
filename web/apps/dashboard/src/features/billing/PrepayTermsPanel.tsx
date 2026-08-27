// Dashboard → Settings → Payments: how many months forward this club collects, per route.
//
// The manager's letter is explicit — cash three months forward, twelve post-dated cheques —
// and those are the CLUB's rules rather than the product's, so they are settings and not
// constants. Another club collects differently, and one that collects nothing forward sets
// both to 0, which returns each route to settling open charges the way cash always did.
//
// Beside the הוראת קבע links on purpose: one screen answers "how may a family pay this
// club", and splitting the answer across two screens is how half of it goes unread.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Card, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { BillingSettingsOut, DashboardBillingClient } from './billingClient'

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  flexWrap: 'wrap',
  paddingBlock: 'var(--space-3)',
}

/** The two fields, and the i18n key that explains each one's route. */
const TERMS = [
  { field: 'cash_prepay_months', testId: 'prepay-term-cash', method: 'cash' },
  { field: 'cheque_prepay_months', testId: 'prepay-term-cheque', method: 'cheque' },
] as const

export function PrepayTermsPanel({
  locale,
  client,
}: {
  locale: Locale
  client: DashboardBillingClient
}) {
  const [settings, setSettings] = useState<BillingSettingsOut | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    client
      .billingSettings()
      .then((next) => alive && setSettings(next))
      .catch(() => alive && setSettings(null))
    return () => {
      alive = false
    }
  }, [client])

  function save(field: (typeof TERMS)[number]['field'], raw: string) {
    const months = Number(raw)
    // A blank or unparseable box saves nothing rather than saving 0: 0 is a real setting
    // that turns the route's forward offer off, and a manager who cleared a field to retype
    // it must not have switched the offer off on the way past.
    if (raw.trim() === '' || !Number.isInteger(months) || months < 0) return
    setFailed(false)
    void client
      .saveBillingSettings({ [field]: months })
      .then((next) => setSettings(next))
      .catch(() => setFailed(true))
  }

  if (settings === null) return null

  return (
    <section aria-labelledby="prepay-terms-title" data-testid="prepay-terms">
      <h3 id="prepay-terms-title">{t(locale, 'billing.prepay.termsTitle')}</h3>
      <p>{t(locale, 'billing.prepay.termsHint')}</p>
      <Card>
        {TERMS.map((term) => (
          <div key={term.field} style={rowStyle}>
            <TextField
              label={t(locale, `billing.method.${term.method}`)}
              hint={t(locale, 'billing.prepay.termsZeroHint')}
              inputMode="numeric"
              data-testid={term.testId}
              defaultValue={String(settings[term.field] ?? 0)}
              // On blur, like every other field on 3f — the screen's own subtitle promises
              // autosave, and a Save button for one section would break that promise.
              onBlur={(event) => save(term.field, event.target.value)}
            />
          </div>
        ))}
        {failed ? (
          <p role="alert" data-testid="prepay-terms-error">
            {t(locale, 'common.error.generic')}
          </p>
        ) : null}
      </Card>
    </section>
  )
}
