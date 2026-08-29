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
import { Card, PageHeader, SectionHeader, Switch, TextField } from '@studio/ui'
import { StructurePanel } from './StructurePanel'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { PrepayTermsPanel, StandingOrderLinksPanel, makeDashboardBillingClient } from '../billing'

type LandingContent = {
  headline?: string | null
  about?: string | null
  trial_steps?: string[] | null
}

type LandingPhoto = { id: string; url: string }

type StudioDetails = {
  name: string
  sport: string | null
  address: string | null
  phone: string | null
  default_locale: string
  parent_locales: string[]
  logo_url: string | null
  landing?: LandingContent
  landing_photos?: LandingPhoto[]
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

/**
 * The rail and the panel.
 *
 * `repeat(auto-fit, minmax(15rem, 1fr))` gave the two tracks EQUAL widths, so a nav rail
 * of nine short words was as wide as the panel holding every field on the screen — the
 * settings screen read as two columns of unrelated things rather than as a menu and its
 * contents. The same mistake `auto-fit` invited in the setup wizard's rail.
 *
 * Explicit tracks, with the panel taking what is left. Below the breakpoint they stack,
 * which is the one thing `auto-fit` was right about and is stated outright here.
 */
const layoutStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-4)',
  gridTemplateColumns: 'minmax(12rem, 15rem) minmax(0, 1fr)',
  alignItems: 'start',
}

const railStyle: CSSProperties = { listStyle: 'none', margin: 0, padding: 0 }

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-3)',
  alignItems: 'center',
  // The name on the reading edge, the control on the far one — 3f's row shape. They were
  // stacked in one column, so the switch sat under its own description.
  justifyContent: 'space-between',
  paddingBlock: 'var(--space-3)',
  borderBlockEnd: 'var(--border-width-hairline) solid var(--border)',
}

const rowBodyStyle: CSSProperties = { flex: 1, minInlineSize: 0 }

const photoStripStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

const photoTileStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
}

const photoImgStyle: CSSProperties = {
  blockSize: '6rem',
  inlineSize: '8rem',
  objectFit: 'cover',
  borderRadius: 'var(--radius-md)',
  border: 'var(--border-width-hairline) solid var(--border)',
}

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
        {/* The row's own name, visible. `Switch` keeps its label screen-reader-only —
            correct for a switch whose row already names it, which this row did not: the
            three parent-language toggles all rendered as "מוצג להורים" with nothing saying
            which was Hebrew and which was Russian (reported 2026-08-29).

            `aria-hidden` because the switch beside it already carries exactly this string
            as its accessible name; without it a screen reader would read the row twice. */}
        <span aria-hidden="true" className="settings-row__label">
          {label}
        </span>
        {description ? <p className="settings-row__description">{description}</p> : null}
      </div>
      <Switch
        label={label}
        checked={checked}
        disabled={disabled}
        stateLabels={stateLabels}
        onCheckedChange={(next) => onChange?.(next)}
      />
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
  const [photoError, setPhotoError] = useState<string | null>(null)

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

  // The strip's writers — multipart POST and a keyed DELETE, both repainting from the
  // response rather than guessing. Errors land in their own line, mapped by the server's
  // code: 'failed' alone sends an owner back to the same six-photo strip or the same SVG.
  const uploadPhoto = (file: File) => {
    setPhotoError(null)
    const body = new FormData()
    body.append('file', file)
    void apiFetch('/api/v1/studio/landing-photos', { method: 'POST', body })
      .then(async (response) => {
        if (!response.ok) {
          const detail = ((await response.json().catch(() => ({}))) as {
            detail?: { code?: string }
          }).detail
          setPhotoError(
            detail?.code === 'too_many_photos'
              ? 'common.settings.landing.photoTooMany'
              : detail?.code === 'unsupported_image'
                ? 'common.settings.landing.photoBadType'
                : response.status === 413
                  ? 'common.settings.landing.photoTooLarge'
                  : 'common.settings.landing.photoFailed',
          )
          return
        }
        const next = (await response.json()) as { photos: LandingPhoto[] }
        setDetails((current) => (current ? { ...current, landing_photos: next.photos } : current))
      })
      .catch(() => setPhotoError('common.settings.landing.photoFailed'))
  }

  const deletePhoto = (id: string) => {
    setPhotoError(null)
    void apiFetch(`/api/v1/studio/landing-photos/${id}`, { method: 'DELETE' })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        setDetails((current) =>
          current
            ? {
                ...current,
                landing_photos: (current.landing_photos ?? []).filter(
                  (photo) => photo.id !== id,
                ),
              }
            : current,
        )
      })
      .catch(() => setPhotoError('common.settings.landing.photoFailed'))
  }

  return (
    <section aria-labelledby="settings-title">
      {/* 3f's subtitle is a promise the screen has to keep, which is why every field below
          saves on blur rather than behind a Save button — so it belongs in the header
          beside the title, not as a loose paragraph under it. */}
      <PageHeader
        actions={
          <p role="status" data-testid="settings-save-state">
            {saveState === 'saved' ? t(locale, 'common.settings.saved') : null}
            {saveState === 'failed' ? t(locale, 'common.settings.saveFailed') : null}
          </p>
        }
        subtitle={t(locale, 'common.settings.autosave')}
        title={t(locale, 'common.settings.title')}
        titleId="settings-title"
      />

      <div style={layoutStyle}>
        <nav aria-label={t(locale, 'common.settings.title')}>
          <ul style={railStyle}>
            {SECTIONS.map((entry) => (
              <li key={entry.key}>
                <button
                  aria-current={entry.key === section ? 'page' : undefined}
                  className="settings-rail__button"
                  data-testid={`settings-section-${entry.key}`}
                  disabled={!entry.owned}
                  onClick={() => setSection(entry.key)}
                  type="button"
                >
                  {t(locale, `common.settings.section.${entry.key}`)}
                  {/* Under the name rather than trailing it on the same line, which is
                      what made the unbuilt sections the widest entries in the column. */}
                  {entry.owned ? null : (
                    <span className="settings-rail__soon">
                      {t(locale, 'common.settings.notYetAvailable')}
                    </span>
                  )}
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
              <SectionHeader level={3} title={t(locale, 'common.settings.section.studio')} />

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

              {/* 2026-08-28 — the shop window's WRITER. The public landing read
                  `settings.landing.*` and nothing could write it: decision 1 said "the
                  club writes its own pitch" and shipped no pen. Address and phone are
                  NOT repeated here — the landing falls back to the fields above. */}
              <SectionHeader level={3} title={t(locale, 'common.settings.landing.title')} />
              <p>{t(locale, 'common.settings.landing.hint')}</p>
              <TextField
                label={t(locale, 'common.settings.landing.headline')}
                defaultValue={details.landing?.headline ?? ''}
                data-testid="settings-landing-headline"
                onBlur={(event) => save({ landing: { headline: event.target.value } })}
              />
              <label>
                {t(locale, 'common.settings.landing.about')}
                <textarea
                  rows={4}
                  style={{ display: 'block', inlineSize: '100%' }}
                  defaultValue={details.landing?.about ?? ''}
                  data-testid="settings-landing-about"
                  onBlur={(event) => save({ landing: { about: event.target.value } })}
                />
              </label>
              <label>
                {t(locale, 'common.settings.landing.steps')}
                <textarea
                  rows={4}
                  style={{ display: 'block', inlineSize: '100%' }}
                  defaultValue={(details.landing?.trial_steps ?? []).join('\n')}
                  data-testid="settings-landing-steps"
                  onBlur={(event) =>
                    save({ landing: { trial_steps: event.target.value.split('\n') } })
                  }
                />
              </label>

              {/* The landing gallery — the strip §5.4a ① promised and `photo_urls=[]`
                  stubbed. Photos are public by definition (they are the shop window), so
                  the thumbnails ARE the public URLs. */}
              <h4>{t(locale, 'common.settings.landing.photos')}</h4>
              <p>{t(locale, 'common.settings.landing.photosHint')}</p>
              <ul style={photoStripStyle} data-testid="settings-landing-photos">
                {(details.landing_photos ?? []).map((photo) => (
                  <li key={photo.id} style={photoTileStyle}>
                    <img
                      src={photo.url}
                      alt={t(locale, 'common.settings.landing.photoAlt')}
                      style={photoImgStyle}
                    />
                    <button
                      type="button"
                      className="studio-btn"
                      data-variant="ghost"
                      data-testid={`settings-landing-photo-delete-${photo.id}`}
                      onClick={() => deletePhoto(photo.id)}
                    >
                      {t(locale, 'common.settings.landing.removePhoto')}
                    </button>
                  </li>
                ))}
              </ul>
              <label>
                {t(locale, 'common.settings.landing.addPhoto')}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'block' }}
                  data-testid="settings-landing-photo-input"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) uploadPhoto(file)
                    // Same file again after a delete must refire onChange.
                    event.target.value = ''
                  }}
                />
              </label>
              {photoError ? (
                <p role="alert" data-testid="settings-landing-photo-error">
                  {t(locale, photoError)}
                </p>
              ) : null}
            </div>
          )}
        </Card>
        )}
      </div>
    </section>
  )
}
