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
import { apiFetch, useAuthedImage } from '@studio/core'
import {
  Card,
  LoadFailed,
  PageHeader,
  SectionHeader,
  Switch,
  TextField,
  ThemeControl,
} from '@studio/ui'
import { ImagePicker } from '../../shared/ImagePicker'
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
  /** The club's address for enquiries, shown to parents in the contact sheet. */
  email: string | null
  default_locale: string
  parent_locales: string[]
  logo_url: string | null
  landing?: LandingContent
  landing_photos?: LandingPhoto[]
}

//: The five tabs §3.19 asked for, replacing the nine-entry rail.
//:
//: The rail used to carry nine sections of which only three rendered in place — `studio`,
//: `structure` and `payments` — while the other six were links out to screens that own
//: themselves: prices → `#/prices`, documents → `#/documents`, attendance → `#/attendance`,
//: notifications → `#/alerts`, users → `#/staff`, belts → `#/belts`. Every one of those six
//: also has a door in the sidebar, so the rail was a second menu to the same places, and
//: §3.19's verdict is the one applied here: *"the five-tab layout is a better organisation
//: than a rail where two-thirds of the entries navigate away."* The owner asked the same
//: question in their own words on 2026-09-10 — "does settings need all of this".
//:
//: Five entries, four of which render in place. `users` stays a link and is the single
//: deliberate exception, because §3.19 says so in as many words: `#/staff` is the real
//: screen and this tab should point at it rather than grow a second, weaker staff list —
//: which is exactly what the prototype's own settings view does wrong (a hardcoded
//: three-person list and an "add staff member" button that only raises a toast).
const SECTIONS: readonly { key: string; href?: string }[] = [
  { key: 'studio' },
  // F4.3 — classes and halls. Settings-cadence edits live here; #/classes stays the
  // weekly working screen.
  { key: 'structure' },
  // Owned since the 2026-08-27 payment-routes pass: this is where the הוראת קבע link per
  // price plan is set. One screen answers "how may a family pay this club".
  { key: 'payments' },
  // New. §3.19 — "take the theme-and-language tab as the home for `ThemeControl`, which
  // currently lives only in the sidebar."
  { key: 'appearance' },
  { key: 'users', href: '#/staff' },
]

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

/** The two once-a-year links in the appearance tab. Logical properties throughout —
 *  `.claude/rules/ui-rtl-a11y.md`, and the app is RTL. */
const annualStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 'var(--space-2)',
  marginBlockStart: 'var(--space-3)',
}

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
  const [logoError, setLogoError] = useState<string | null>(null)
  /** §3.19's named defect, closed. `attempt` re-runs the read on retry. */
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const logoUrl = useAuthedImage(details?.logo_url ?? null)

  useEffect(() => {
    let alive = true
    void apiFetch('/api/v1/studio')
      .then(async (response) => {
        // §3.19's named defect: the failure was swallowed to `undefined`, so a manager
        // whose network dropped sat on `טוען…` for ever with no error and no retry —
        // indistinguishable from a slow request that was still coming.
        if (!response.ok) throw new Error(String(response.status))
        return (await response.json()) as StudioDetails
      })
      .then((next) => {
        if (alive) setDetails(next)
      })
      .catch(() => {
        if (alive) setLoadFailed(true)
      })
    return () => {
      alive = false
    }
  }, [attempt])

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
  /**
   * `POST /studio/logo`, which nothing in this app called.
   *
   * The endpoint has existed since the studio settings shipped, and so have the strings —
   * `logoChoose`, `logoRejected`, and `logoDrop`, which was rendered as a bare paragraph
   * that reads like a drop zone and accepted nothing. So a club could not set a logo at
   * all, and the reason they could not SEE one was that there had never been a way to
   * upload it: one missing control, both symptoms (owner report, 2026-08-30).
   *
   * `logo_url` is re-read from the response rather than guessed, because the URL carries a
   * cache-busting version — reusing the old one would show the previous logo until a hard
   * reload.
   */
  const uploadLogo = (file: File) => {
    setLogoError(null)
    const body = new FormData()
    body.append('file', file)
    void apiFetch('/api/v1/studio/logo', { method: 'POST', body })
      .then(async (response) => {
        if (!response.ok) {
          // 415 names the formats and 413 names the size; both are the owner's to fix, so
          // neither may arrive as a generic failure.
          setLogoError(
            response.status === 415 || response.status === 413
              ? 'common.setup.studio.logoRejected'
              : 'common.settings.saveFailed',
          )
          return
        }
        const next = (await response.json()) as { logo_url: string }
        setDetails((current) => (current ? { ...current, logo_url: next.logo_url } : current))
      })
      .catch(() => setLogoError('common.settings.saveFailed'))
  }

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
                {entry.href ? (
                  <a
                    className="settings-rail__button"
                    data-testid={`settings-section-${entry.key}`}
                    href={entry.href}
                  >
                    {t(locale, `common.settings.section.${entry.key}`)}
                  </a>
                ) : (
                  <button
                    aria-current={entry.key === section ? 'page' : undefined}
                    className="settings-rail__button"
                    data-testid={`settings-section-${entry.key}`}
                    onClick={() => setSection(entry.key)}
                    type="button"
                  >
                    {t(locale, `common.settings.section.${entry.key}`)}
                  </button>
                )}
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
        ) : section === 'appearance' ? (
          <Card>
            <div data-testid="settings-panel-appearance">
              <SectionHeader
                level={3}
                title={t(locale, 'common.settings.section.appearance')}
              />
              {/* §3.19 — the theme control's home. It is ALSO still in the sidebar and in
                  the narrow-viewport drawer, deliberately: this tab is where a manager
                  looks for it, the sidebar is where a manager reaches for it, and the
                  control is stateless chrome over `ThemeProvider`, so two mounts cannot
                  disagree. Nothing is moved out of the sidebar here — removing it would
                  take the switch away from every screen to put it on one. */}
              <ThemeControl
                labels={{
                  light: t(locale, 'common.theme.light'),
                  dark: t(locale, 'common.theme.dark'),
                  system: t(locale, 'common.theme.system'),
                }}
                legend={t(locale, 'common.theme.legend')}
                stateLabels={{
                  light: t(locale, 'common.theme.state.light'),
                  dark: t(locale, 'common.theme.state.dark'),
                }}
              />

              {/* The two once-a-year flows. They live HERE rather than in the sidebar
                  because that is what they are — a manager runs each of them once and then
                  does not look at them again for a year, which is the worst possible claim
                  on a permanent nav slot. Retiring `overflowDoors()` is what made a home
                  for them necessary, and this is that home. */}
              <SectionHeader level={3} title={t(locale, 'common.settings.annual.title')} />
              <p>{t(locale, 'common.settings.annual.hint')}</p>
              <ul style={annualStyle}>
                <li>
                  <a data-testid="settings-link-setup" href="#/setup">
                    {t(locale, 'common.settings.annual.setup')}
                  </a>
                </li>
                <li>
                  <a data-testid="settings-link-rollover" href="#/rollover">
                    {t(locale, 'common.settings.annual.rollover')}
                  </a>
                </li>
              </ul>
            </div>
          </Card>
        ) : (
        <Card>
          {loadFailed ? (
            <LoadFailed
              locale={locale}
              onRetry={() => {
                setLoadFailed(false)
                setAttempt((n) => n + 1)
              }}
            />
          ) : details === null ? (
            <p data-testid="settings-loading">{t(locale, 'common.setup.loading')}</p>
          ) : (
            <div data-testid="settings-panel-studio">
              <SectionHeader level={3} title={t(locale, 'common.settings.section.studio')} />

              {/* One control instead of three. This used to be a preview `<img>`, a
                  paragraph reading "גררו לוגו 512×512" that looked like a drop zone and
                  accepted nothing, and a `<label>` around a bare file input — which the
                  browser draws as a grey English "Choose File" button beside the words "no
                  file selected". The owner asked for a pressable empty square with a
                  picture icon; `ImagePicker` is that, and the empty-state words carry the
                  512×512 the generic label cannot.

                  `logo_url` is a token-guarded API path, so the bytes still come through
                  `useAuthedImage` rather than straight off the attribute — a bare src
                  resolved against this app's host and sent no header (2026-08-30). No
                  `onRemove`: there is no DELETE for the logo, and a remove button that
                  cannot remove is worse than none. */}
              <ImagePicker
                locale={locale}
                onChoose={uploadLogo}
                previewUrl={logoUrl}
                label={t(locale, 'common.setup.studio.logoChoose')}
                hint={t(locale, 'common.setup.studio.logoDrop')}
                error={logoError ? t(locale, logoError) : null}
                testId="settings-logo-input"
              />

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
              {/* 2026-09-06 — the parent app's contact sheet offers WhatsApp, a call and
                  email, and a studio had nowhere to put an address for enquiries. */}
              <TextField
                label={t(locale, 'common.setup.studio.email')}
                type="email"
                defaultValue={details.email ?? ''}
                onBlur={(event) => save({ email: event.target.value })}
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
