// Parent artboards 13a (mobile, full scroll) and 13c (desktop, sticky form beside it),
// reworked by the approved redesign of 2026-08-29 ("Trial Landing Redesign" canvas).
//
// **One component, two widths.** 13a and 13c are the same page: the difference is a CSS
// grid that collapses, not a second tree. The responsive half lives in `landing.css` —
// see its header for what may go there and why nothing else may.
//
// **The redesign's centre of gravity is the PICKER, not the form.** The page leads with a
// compact single-select list of groups and ONE call to action that names the chosen group;
// pressing it opens the booking flow in a dialog (BookingDialog) with the choice carried
// in. On the phone the CTA also lives in a bar stuck to the bottom of the screen. This
// supersedes the open-on-load decision — the open form pushed everything a stranger came
// to read below a wall of inputs.
//
// §5.4a ①: "the club's shop window, not a form." Everything is readable with no session at
// all — the sign-in wall stands in front of *booking*, never in front of *reading*.
//
// **The copy is the club's; the chrome is translated** (landing decision 1, 2026-08-27).
// `headline`, `about`, `address`, `trial_steps` and the phone are all data from
// `studio.settings`. i18n keys carry only headings, buttons and states.
//
// G12 — logical properties only. This page renders right-to-left in Hebrew and
// left-to-right in English, and it is the one screen in the product a stranger sees first.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiUrl } from '@studio/core'
import { BeltLadder, Button, Card, EmptyState, LoadFailed } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { LandingClient, PublicGroup, PublicLanding as Landing } from './landingClient'
import { BookingDialog } from './BookingDialog'
import './landing.css'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; landing: Landing }
  | { kind: 'not-found' }
  | { kind: 'no-schedule' }
  | { kind: 'error' }

const pageStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-5)',
  maxInlineSize: '72rem',
  marginInline: 'auto',
  inlineSize: '100%',
  padding: 'var(--space-4)',
  // The tatami weave — two faint thread directions over the ground, drawn from the same
  // ink token every theme already flips, so it survives dark mode without a second value.
  backgroundImage:
    'repeating-linear-gradient(0deg, color-mix(in srgb, var(--fg) 3%, transparent) 0 1px, transparent 1px 12px), ' +
    'repeating-linear-gradient(90deg, color-mix(in srgb, var(--fg) 2%, transparent) 0 1px, transparent 1px 48px)',
}

const restColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-5)',
}

// Region 1 and region 7 — 13a's inverted bands. Ink ground, paper text, from the same two
// tokens every theme already flips.
const invertedBandStyle: CSSProperties = {
  background: 'var(--fg)',
  color: 'var(--on-fg)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-5)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

// The hero clips its own watermark; nothing else may overflow it either.
const heroStyle: CSSProperties = {
  ...invertedBandStyle,
  position: 'relative',
  overflow: 'hidden',
}

// 柔道 — the redesign's one ornament, hidden from AT. A decorative glyph, not copy: it is
// the same in every locale, which is why it does not live in i18n. No webfont is loaded
// for two characters; every platform's own CJK serif renders them.
const kanjiStyle: CSSProperties = {
  position: 'absolute',
  insetInlineEnd: 'var(--space-3)',
  insetBlockEnd: 'var(--space-2)',
  writingMode: 'vertical-rl',
  fontFamily: "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif",
  fontSize: '72px',
  fontWeight: 'var(--weight-semibold)',
  lineHeight: 1,
  color: 'color-mix(in srgb, var(--on-fg) 8%, transparent)',
  pointerEvents: 'none',
}

const brandRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
}

const heroHeadlineStyle: CSSProperties = {
  // L2's token: 36px at 390 (13a), 52px at 1440 (13c), fluid between — no media query.
  fontSize: 'var(--text-hero)',
  lineHeight: 'var(--leading-snug)',
  fontWeight: 'var(--weight-semibold)',
  margin: 0,
}

const heroCaptionStyle: CSSProperties = {
  fontSize: 'var(--text-caption)',
  opacity: 0.8,
  margin: 0,
}

const offerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

const offerBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

const trustLineStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const pickerFieldsetStyle: CSSProperties = {
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  margin: 0,
  padding: 0,
  overflow: 'hidden',
  background: 'var(--surface)',
}

const pickerLegendStyle: CSSProperties = {
  // SlotChips' visually-hidden legend, restated inline: the group list explains itself.
  blockSize: '1px',
  clipPath: 'inset(50%)',
  inlineSize: '1px',
  overflow: 'hidden',
  position: 'absolute',
  whiteSpace: 'nowrap',
}

const pickRowTextStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
}

const pickRowMetaStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
}

const logoStyle: CSSProperties = {
  maxInlineSize: '4rem',
  blockSize: 'auto',
}

const stepsListStyle: CSSProperties = {
  margin: 0,
  paddingInlineStart: 'var(--space-5)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
}

const groupListStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

const groupRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 'var(--space-3)',
}

// Region 4's accent bar. Decorative and token-drawn — groups carry no colour of their own,
// and transcribing a belt hex here is exactly what L2 forbids.
const groupAccentStyle: CSSProperties = {
  inlineSize: '4px',
  borderRadius: 'var(--radius-pill)',
  background: 'var(--accent)',
  flex: 'none',
}

const photosStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  overflowX: 'auto',
}

const photoStyle: CSSProperties = {
  blockSize: '9rem',
  borderRadius: 'var(--radius-md)',
  objectFit: 'cover',
}

// The real map (2026-08-30) — the keyless Google embed, addressed by the same string the
// ניווט button carries. `background` stays: it is what shows while the frame loads.
const mapStyle: CSSProperties = {
  blockSize: '12rem',
  inlineSize: '100%',
  border: 0,
  borderRadius: 'var(--radius-md)',
  background: 'var(--disabled-surface)',
}

const buttonRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
}

/** §5.4a — "מתאמנים בימים". 0-6 Sunday-first, matching `group_schedule_rule.weekday`. */
function trainingDays(locale: Locale, weekdays: number[]): string {
  return weekdays.map((day) => t(locale, `people.weekdays.${day}`)).join(' · ')
}

/** `ראשון וחמישי · 16:00` — L1's time beside the days it already had. */
function scheduleLine(locale: Locale, group: PublicGroup): string {
  const days = trainingDays(locale, group.training_weekdays ?? [])
  const times = (group.training_times ?? []).join(' · ')
  return [days, times].filter(Boolean).join(' · ')
}

function ageLine(locale: Locale, group: PublicGroup): string | null {
  return group.age_min != null || group.age_max != null
    ? `${t(locale, 'people.landing.ageRange')}: ${group.age_min ?? ''}–${group.age_max ?? ''}`
    : null
}

/** The picker row's one-line résumé of a group: ages, then days-and-times. */
function groupMeta(locale: Locale, group: PublicGroup): string {
  return [ageLine(locale, group), scheduleLine(locale, group)].filter(Boolean).join(' · ')
}

/**
 * Redesign 2026-08-29 — the compact single-select picker. SlotChips' accessibility shape
 * (fieldset, hidden legend, real radios, `:has(:focus-visible)` ring in landing.css),
 * row-shaped so three groups cost three lines, not three cards with three buttons.
 */
function GroupPicker({
  groups,
  locale,
  value,
  onValueChange,
}: {
  groups: PublicGroup[]
  locale: Locale
  value: string | null
  onValueChange: (id: string) => void
}) {
  return (
    <fieldset style={pickerFieldsetStyle} data-testid="landing-group-picker">
      <legend style={pickerLegendStyle}>{t(locale, 'people.landing.chooseGroup')}</legend>
      {groups.map((group) => {
        const selected = value === group.id
        const meta = groupMeta(locale, group)
        return (
          <label
            key={group.id}
            className="landing-pick-row"
            data-selected={selected ? 'true' : undefined}
            data-testid={`landing-pick-${group.id}`}
          >
            <input
              type="radio"
              className="landing-pick-input"
              name="landing-group"
              checked={selected}
              onChange={() => onValueChange(group.id)}
            />
            <span className="landing-pick-dot" aria-hidden="true" />
            <span style={pickRowTextStyle}>
              <span style={{ fontWeight: selected ? 'var(--weight-semibold)' : 'var(--weight-medium)' }}>
                <bdi>{group.name}</bdi>
              </span>
              {meta ? <span style={pickRowMetaStyle}>{meta}</span> : null}
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

export function GroupRow({
  group,
  locale,
  onBook,
}: {
  group: PublicGroup
  locale: Locale
  /** Redesign 2026-08-29 — 13c's per-card button; books THIS group. */
  onBook: (id: string) => void
}) {
  const weekdays = group.training_weekdays ?? []
  const ages = ageLine(locale, group)
  return (
    <li style={groupRowStyle}>
      <span style={groupAccentStyle} aria-hidden="true" />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <h3 data-testid="landing-group-name" style={{ margin: 0 }}>
          <bdi>{group.name}</bdi>
        </h3>
        {group.description ? <p style={{ margin: 0 }}>{group.description}</p> : null}
        {ages ? <p data-testid="landing-group-ages" style={{ margin: 0 }}>{ages}</p> : null}
        {weekdays.length > 0 ? (
          <p data-testid="landing-group-days" style={{ margin: 0 }}>
            {t(locale, 'people.landing.weeklySchedule')}: {scheduleLine(locale, group)}
          </p>
        ) : (
          // An empty list is a real answer — the club has not built its timetable yet —
          // and saying so beats an unexplained blank line.
          <p data-testid="landing-group-no-schedule" style={{ margin: 0 }}>
            {t(locale, 'people.weekdays.noSchedule')}
          </p>
        )}
        <span>
          <Button
            variant="secondary"
            onClick={() => onBook(group.id)}
            data-testid={`landing-group-book-${group.id}`}
          >
            {t(locale, 'people.landing.bookTrial')}
          </Button>
        </span>
      </span>
    </li>
  )
}

export function PublicLanding({
  slug,
  locale,
  client,
  signedIn = false,
}: {
  slug: string
  locale: Locale
  client: LandingClient
  /** §5.4a step 1 — sign-in-first. The flow renders the wall until this is true. */
  signedIn?: boolean
}) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  // Bumped by LoadFailed's retry — a real re-fetch, never location.reload() (P8).
  const [attempt, setAttempt] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // The `?book=` resume: the sign-in round trip's return_path carries the picked group
  // (BookingFlow writes it), so landing back here reopens the flow instead of dropping the
  // parent on the shop window again. The dialog itself still waits for the landing to load
  // and a group to exist — `flowOpen` alone renders nothing.
  const [flowOpen, setFlowOpen] = useState(
    () => new URLSearchParams(globalThis.location?.search ?? '').get('book') != null,
  )

  useEffect(() => {
    let live = true
    client
      .landing(slug)
      .then((landing) => live && setState({ kind: 'ready', landing }))
      .catch((error: Error) => {
        if (!live) return
        // The two failures a stranger can actually hit, told apart: a slug nobody owns, and
        // a club whose calendar has not been built. "Something went wrong" for both would
        // send somebody to the wrong club looking for a typo.
        if (error.message.startsWith('404')) setState({ kind: 'not-found' })
        else if (error.message.startsWith('503')) setState({ kind: 'no-schedule' })
        else setState({ kind: 'error' })
      })
    return () => {
      live = false
    }
  }, [client, slug, attempt])

  if (state.kind === 'loading') {
    return <p data-testid="landing-loading">{t(locale, 'people.landing.submitting')}</p>
  }
  if (state.kind === 'not-found') {
    return (
      <EmptyState
        title={t(locale, 'people.landing.notFound')}
        description={t(locale, 'people.error.notFound')}
      />
    )
  }
  if (state.kind === 'no-schedule') {
    return (
      <EmptyState
        title={t(locale, 'people.landing.scheduleComeLater')}
        description={t(locale, 'people.error.scheduleUnavailable')}
      />
    )
  }
  if (state.kind === 'error') {
    // P8 — a dead-end Alert on the ONE screen a stranger reaches from a flyer was the
    // worst place in the product to have no way forward.
    return (
      <LoadFailed
        locale={locale}
        onRetry={() => {
          setState({ kind: 'loading' })
          setAttempt((n) => n + 1)
        }}
      />
    )
  }

  const { landing } = state
  const groups = landing.groups ?? []
  const ladder = landing.belt_ladder ?? []
  const steps = landing.trial_steps ?? []
  const photos = landing.photo_urls ?? []
  // The affordances the phone unlocks — both stripped to digits for the URL schemes.
  const phoneDigits = landing.phone ? landing.phone.replace(/[^\d+]/g, '') : null

  // Derived, not synced: an explicit pick wins, then the round trip's `?book=`, then the
  // first group — so the CTA names a group from the very first ready render.
  const resumedId = new URLSearchParams(globalThis.location?.search ?? '').get('book')
  const selectedGroup =
    groups.find((group) => group.id === (selectedId ?? resumedId)) ?? groups[0] ?? null
  const bookGroup = (id: string) => {
    setSelectedId(id)
    setFlowOpen(true)
  }
  const ctaLabel = (
    <>
      {t(locale, 'people.landing.bookTrial')}
      {selectedGroup ? (
        <>
          {' — '}
          <bdi>{selectedGroup.name}</bdi>
        </>
      ) : null}
    </>
  )

  return (
    <main className="landing-page" style={pageStyle} data-testid="public-landing">
      {/* Region 1 — the hero band, inverted, with the redesign's kanji watermark. */}
      <section
        className="landing-hero-area"
        style={heroStyle}
        aria-labelledby="landing-club-name"
        data-testid="landing-hero"
      >
        <span aria-hidden="true" style={kanjiStyle}>
          柔道
        </span>
        <div style={brandRowStyle}>
          {landing.logo_url ? (
            // The club's own logo, from the unauthenticated public route — the
            // tenant-scoped one needs a token a stranger does not have. Through
            // `apiUrl`, because the API hands back a relative path and the browser would
            // otherwise resolve it against THIS app's host: on split origins that is a
            // 404 and a broken crest on the club's public page (2026-08-30).
            <img
              src={apiUrl(landing.logo_url)}
              alt={landing.studio_name}
              style={logoStyle}
              data-testid="landing-logo"
            />
          ) : null}
          {/* The club's name is DATA, not a translated string: it is what the club
              calls itself, in whatever language they chose. */}
          <h1 id="landing-club-name" style={{ margin: 0, fontSize: 'var(--text-title)' }}>
            <bdi>{landing.studio_name}</bdi>
          </h1>
          {landing.phone ? (
            <a
              href={`tel:${phoneDigits}`}
              style={{ color: 'inherit', marginInlineStart: 'auto' }}
              data-testid="landing-phone"
            >
              <bdi dir="ltr">{landing.phone}</bdi>
            </a>
          ) : null}
        </div>
        {/* The two-line headline at L2's display size — the club's words, with the
            chrome offer as the fallback so a club that wrote nothing still has a hero. */}
        <p style={heroHeadlineStyle} data-testid="landing-headline">
          {landing.headline ?? t(locale, 'people.landing.title')}
        </p>
        <p style={{ margin: 0, opacity: 0.85 }}>{t(locale, 'people.landing.subtitle')}</p>
        {ladder.length > 0 ? (
          <>
            <BeltLadder
              items={ladder.map((rank) => ({
                colorHex: rank.color_hex,
                label: rank.name,
                secondaryColorHex: rank.secondary_color_hex,
              }))}
            />
            <p style={heroCaptionStyle}>{t(locale, 'people.landing.beltCaption')}</p>
          </>
        ) : null}
      </section>

      {/* Region 5 — the offer: picker first, ONE call to action (redesign 2026-08-29). */}
      <section className="landing-offer-area" style={offerStyle} aria-labelledby="landing-offer">
        <Card>
          <div style={offerBodyStyle}>
            <h2 id="landing-offer" style={{ margin: 0 }}>
              {t(locale, 'people.landing.title')}
            </h2>
            <p style={{ margin: 0 }}>{t(locale, 'people.landing.subtitle')}</p>
            <p style={trustLineStyle}>{t(locale, 'people.landing.noCommitment')}</p>
            {groups.length > 0 ? (
              <>
                <GroupPicker
                  groups={groups}
                  locale={locale}
                  value={selectedGroup?.id ?? null}
                  onValueChange={setSelectedId}
                />
                <Button
                  disabled={!selectedGroup}
                  onClick={() => setFlowOpen(true)}
                  data-testid="landing-cta"
                >
                  {ctaLabel}
                </Button>
              </>
            ) : (
              <p data-testid="landing-no-groups" style={{ margin: 0 }}>
                {t(locale, 'people.landing.noGroups')}
              </p>
            )}
          </div>
        </Card>
      </section>

      <div className="landing-rest-area" style={restColumnStyle}>
        {/* Photos — §5.4a ① names them explicitly; rendered the moment the API sends any. */}
        {photos.length > 0 ? (
          <div style={photosStyle} data-testid="landing-photos">
            {photos.map((url) => (
              // Alt text: the club's name — the photos are the club, and the API carries
              // no per-photo caption to say more.
              <img key={url} src={url} alt={landing.studio_name} style={photoStyle} />
            ))}
          </div>
        ) : null}

        {landing.about ? (
          <section aria-labelledby="landing-about">
            <h2 id="landing-about">{t(locale, 'people.landing.aboutTitle')}</h2>
            <p>{landing.about}</p>
          </section>
        ) : null}

        {/* Region 3 — the club's own three steps. Copy is theirs; the heading is chrome. */}
        {steps.length > 0 ? (
          <section aria-labelledby="landing-steps" data-testid="landing-steps">
            <h2 id="landing-steps">{t(locale, 'people.landing.stepsTitle')}</h2>
            <ol style={stepsListStyle}>
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        ) : null}

        {/* Region 4 — the groups in detail, with descriptions and 13c's per-card button.
            Desktop furniture: on the phone the picker rows already say all of this, so
            landing.css hides the section below 64rem. */}
        <section className="landing-groups-detail" aria-labelledby="landing-groups">
          <h2 id="landing-groups">{t(locale, 'people.landing.groupsTitle')}</h2>
          {groups.length > 0 ? (
            <Card>
              <ul style={groupListStyle} data-testid="landing-group-card">
                {groups.map((group) => (
                  <GroupRow key={group.id} group={group} locale={locale} onBook={bookGroup} />
                ))}
              </ul>
            </Card>
          ) : (
            <p>{t(locale, 'people.landing.noGroups')}</p>
          )}
        </section>

        {/* Region 6 — the location card. */}
        {landing.address ? (
          <section aria-labelledby="landing-where" data-testid="landing-location">
            <Card>
              <h2 id="landing-where">{t(locale, 'people.landing.whereTitle')}</h2>
              <p data-testid="landing-address">{landing.address}</p>
              <iframe
                title={t(locale, 'people.landing.mapTitle')}
                src={`https://maps.google.com/maps?q=${encodeURIComponent(landing.address)}&output=embed&hl=${locale}`}
                style={mapStyle}
                loading="lazy"
              />
              <div style={buttonRowStyle}>
                <a
                  className="studio-btn"
                  data-variant="secondary"
                  href={`https://maps.google.com/?q=${encodeURIComponent(landing.address)}`}
                  data-testid="landing-navigate"
                >
                  {t(locale, 'people.landing.navigate')}
                </a>
                {phoneDigits ? (
                  <a
                    className="studio-btn"
                    data-variant="secondary"
                    href={`https://wa.me/${phoneDigits.replace(/^0/, '972')}`}
                    data-testid="landing-whatsapp"
                  >
                    {t(locale, 'people.landing.whatsapp')}
                  </a>
                ) : null}
              </div>
            </Card>
          </section>
        ) : null}

        {/* Region 7 — the footer band, inverted like the hero. */}
        <footer style={invertedBandStyle} data-testid="landing-footer">
          <bdi>{landing.studio_name}</bdi>
          <p style={{ margin: 0, opacity: 0.85 }}>{t(locale, 'people.landing.footerOffer')}</p>
          {landing.phone ? (
            <a href={`tel:${phoneDigits}`} style={{ color: 'inherit' }}>
              <bdi dir="ltr">{landing.phone}</bdi>
            </a>
          ) : null}
        </footer>
      </div>

      {/* The mobile sticky CTA — landing.css pins it to the screen's bottom edge and hides
          it at desk widths, where the offer column is already in view. Gone while the flow
          is open: the dialog owns the screen then. */}
      {!flowOpen && selectedGroup ? (
        <div className="landing-sticky-bar">
          <Button
            onClick={() => setFlowOpen(true)}
            data-testid="landing-sticky-cta"
            style={{ inlineSize: '100%' }}
          >
            {ctaLabel}
          </Button>
        </div>
      ) : null}

      {flowOpen && selectedGroup ? (
        <BookingDialog
          slug={slug}
          locale={locale}
          client={client}
          groups={groups}
          group={selectedGroup}
          groupMeta={groupMeta(locale, selectedGroup)}
          signedIn={signedIn}
          address={landing.address ?? null}
          phone={landing.phone ?? null}
          onClose={() => setFlowOpen(false)}
        />
      ) : null}
    </main>
  )
}
