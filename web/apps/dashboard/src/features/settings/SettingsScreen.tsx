// Dashboard artboard 3f — הגדרות. *לכל מתג תווית מצב*: every toggle carries a state
// label, and that labelling is the point of the artboard rather than a detail of it.
//
// It is also an accessibility rule and not only a design one. A switch whose state is
// carried by colour and position alone fails SC 1.4.1, and a manager reading the screen in
// bright sun on a mat cannot tell מופעל from כבוי by hue.
//
// The rule is already structural: @studio/ui's `Switch` takes `stateLabels` as a REQUIRED
// prop, so no caller can render one without a label. `SettingToggle` below adds only 3f's
// row chrome — the description line under the label — and deliberately does not render a
// second state of its own.
//
// ─────────────────────────────────────────────────────────────────────────────
// ONE ROW OF 3f IS DELIBERATELY NOT BUILT.
//
// 3f draws a *חסימת השתתפות ללא הצהרת בריאות* toggle. SPEC §5.5 says, in as many words,
// that there is **no `block_attendance_without_health` setting** — "nothing to configure".
// The gate is a hard block in the parent app only; nothing on the mat is ever blocked,
// because a hard block would stop the RECORD from being accurate without making anyone
// safer. Building the toggle would ship a control that either does nothing or contradicts
// the spec, so it is absent and this comment is why.
//
// W6 CLOSED THE OTHER HALF (C10, 2026-08-26): the row is gone from artboard 3f as well, so
// the mockup and this panel now agree and nobody has to discover the rule from a comment.
// tests/contracts/test_canvas_matches_spec.py fails if the canvas regains it.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { apiFetch } from '@studio/core'
import { Card, Switch, TextField } from '@studio/ui'
import { StructurePanel } from './StructurePanel'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { PrepayTermsPanel, StandingOrderLinksPanel, makeDashboardBillingClient } from '../billing'

type StudioDetails = {
  name: string
  sport: string | null
  address: string | null
  phone: string | null
  default_locale: string
  parent_locales: string[]
  logo_url: string | null
}

//: 3f's own left rail, in its own order. The five M1 does not own are listed rather than
//: hidden: a manager who cannot find מחירים concludes it is missing, not that it is next.
const SECTIONS = [
  { key: 'studio', owned: true },
  // F4.3 — classes and halls. Settings-cadence edits live here; #/groups stays the
  // weekly working screen.
  { key: 'structure', owned: true },
  { key: 'prices', owned: false },
  // Owned since the 2026-08-27 payment-routes pass: this is where the הוראת קבע link per
  // price plan is set. One screen answers "how may a family pay this club".
  { key: 'payments', owned: true },
  { key: 'documents', owned: false },
  { key: 'attendance', owned: false },
  { key: 'notifications', owned: false },
  { key: 'users', owned: false },
  { key: 'belts', owned: false },
] as const

const PARENT_LOCALES = ['he', 'en', 'ru'] as const

const layoutStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-4)',
  // Narrow first: one column at 390, the rail beside the panel once there is room.
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(15rem, 100%), 1fr))',
  alignItems: 'start',
}

const railStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0 }

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-3)',
  alignItems: 'center',
  paddingBlock: 'var(--space-3)',
  borderBlockEnd: 'var(--border-width-hairline) solid var(--border)',
}

const rowBodyStyle: CSSProperties = { flex: 1, minInlineSize: 0 }

/** 3f's toggle row: the switch, plus the explanatory line the artboard puts under it. */
export function SettingToggle({
  label,
  description,
  checked,
  stateLabels,
  disabled,
  onChange,
}: {
  label: string
  description?: ReactNode
  checked: boolean
  stateLabels: { on: string; off: string }
  disabled?: boolean
  onChange?: (next: boolean) => void
}) {
  return (
    <div style={rowStyle}>
      <div style={rowBodyStyle}>
        <Switch
          label={label}
          checked={checked}
          disabled={disabled}
          stateLabels={stateLabels}
          onCheckedChange={(next) => onChange?.(next)}
        />
        {description ? <p>{description}</p> : null}
      </div>
    </div>
  )
}

export function SettingsScreen({ locale }: { locale: Locale }) {
  const [section, setSection] = useState<string>('studio')
  // One client for the panel's lifetime; `useMemo` rather than a module constant so a test
  // stubbing `fetch` gets the stub, the way every other section here does.
  const billingClient = useMemo(() => makeDashboardBillingClient(apiFetch), [])
  const [details, setDetails] = useState<StudioDetails | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'failed'>('idle')

  useEffect(() => {
    let alive = true
    void apiFetch('/api/v1/studio')
      .then(async (response) => (await response.json()) as StudioDetails)
      .then((next) => {
        if (alive) setDetails(next)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const save = (fields: Partial<StudioDetails>) => {
    setSaveState('idle')
    void apiFetch('/api/v1/studio', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status))
        const next = (await response.json()) as StudioDetails
        setDetails(next)
        setSaveState('saved')
      })
      .catch(() => setSaveState('failed'))
  }

  return (
    <section aria-labelledby="settings-title">
      <header>
        <h2 id="settings-title">{t(locale, 'common.settings.title')}</h2>
        {/* 3f's own subtitle. It is a promise the screen has to keep, which is why every
            field below saves on blur rather than behind a Save button. */}
        <p>{t(locale, 'common.settings.autosave')}</p>
        <p role="status" data-testid="settings-save-state">
          {saveState === 'saved' ? t(locale, 'common.settings.saved') : null}
          {saveState === 'failed' ? t(locale, 'common.settings.saveFailed') : null}
        </p>
      </header>

      <div style={layoutStyle}>
        <nav aria-label={t(locale, 'common.settings.title')}>
          <ul style={railStyle}>
            {SECTIONS.map((entry) => (
              <li key={entry.key}>
                <button
                  type="button"
                  aria-current={entry.key === section ? 'page' : undefined}
                  disabled={!entry.owned}
                  data-testid={`settings-section-${entry.key}`}
                  onClick={() => setSection(entry.key)}
                >
                  {t(locale, `common.settings.section.${entry.key}`)}
                  {entry.owned ? null : ` · ${t(locale, 'common.settings.notYetAvailable')}`}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {section === 'structure' ? (
          <StructurePanel locale={locale} />
        ) : section === 'payments' ? (
          <div data-testid="settings-panel-payments">
            {/* One screen answers "how may a family pay this club": the link per plan for
                the הוראת קבע route, and how many months forward the other two collect. */}
            <StandingOrderLinksPanel locale={locale} client={billingClient} />
            <PrepayTermsPanel locale={locale} client={billingClient} />
          </div>
        ) : (
        <Card>
          {details === null ? (
            <p data-testid="settings-loading">{t(locale, 'common.setup.loading')}</p>
          ) : (
            <div data-testid="settings-panel-studio">
              <h3>{t(locale, 'common.settings.section.studio')}</h3>

              {details.logo_url ? (
                <img
                  src={details.logo_url}
                  alt={t(locale, 'common.setup.studio.logoAlt')}
                  width={128}
                  height={128}
                  style={{ maxInlineSize: '100%', height: 'auto' }}
                />
              ) : (
                <p>{t(locale, 'common.setup.studio.logoDrop')}</p>
              )}

              <TextField
                label={t(locale, 'common.setup.studio.name')}
                defaultValue={details.name}
                onBlur={(event) => save({ name: event.target.value })}
              />
              <TextField
                label={t(locale, 'common.setup.studio.phone')}
                type="tel"
                defaultValue={details.phone ?? ''}
                onBlur={(event) => save({ phone: event.target.value })}
              />
              <TextField
                label={t(locale, 'common.setup.studio.address')}
                defaultValue={details.address ?? ''}
                onBlur={(event) => save({ address: event.target.value })}
              />

              <h4>{t(locale, 'common.setup.studio.parentLocales')}</h4>
              {PARENT_LOCALES.map((code) => {
                const on = details.parent_locales.includes(code)
                // §9's fallback chain resolves through the default locale, so switching it
                // off would leave the fallback pointing at a language the studio says it
                // does not offer. Locked, and the lock is explained rather than silent.
                const locked = code === details.default_locale
                return (
                  <SettingToggle
                    key={code}
                    label={t(locale, `common.setup.studio.locale.${code}`)}
                    description={
                      locked ? t(locale, 'common.settings.defaultLocaleLocked') : undefined
                    }
                    checked={on}
                    disabled={locked}
                    stateLabels={{
                      on: t(locale, 'common.settings.parentLocale.on'),
                      off: t(locale, 'common.settings.parentLocale.off'),
                    }}
                    onChange={(next) =>
                      save({
                        parent_locales: next
                          ? [...details.parent_locales, code]
                          : details.parent_locales.filter((entry) => entry !== code),
                      })
                    }
                  />
                )
              })}
            </div>
          )}
        </Card>
        )}
      </div>
    </section>
  )
}
