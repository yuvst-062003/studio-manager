// Parent artboards 13a (mobile, full scroll) and 13c (desktop, sticky form beside it).
//
// **One component, two widths.** 13a and 13c are the same page: the difference is a CSS
// grid that collapses, not a second tree. Two components would be two places to change the
// club's own copy, and the desktop one would rot first.
//
// §5.4a ①: "the club's shop window, not a form. Logo, photos, what the club does, where and
// when, and one offer: שיעור ניסיון חינם." So everything above the fold is readable with no
// session at all — the sign-in wall stands in front of *booking*, never in front of
// *reading*. A stranger tapping an Instagram link must see the club.
//
// **The copy is the club's; the chrome is translated** (landing decision 1, 2026-08-27).
// `headline`, `about`, `address`, `trial_steps` and the phone are all data from
// `studio.settings` — a shared Hebrew sentence about "ג׳ודו מגיל 5" is simply wrong for a
// club that teaches from four. i18n keys carry only headings, buttons and states.
//
// G12 — logical properties only. This page renders right-to-left in Hebrew and
// left-to-right in English, and it is the one screen in the product a stranger sees first.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, BeltLadder, Card, EmptyState } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { LandingClient, PublicGroup, PublicLanding as Landing } from './landingClient'
import { BookingFlow } from './BookingFlow'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; landing: Landing }
  | { kind: 'not-found' }
  | { kind: 'no-schedule' }
  | { kind: 'error' }

const pageStyle: CSSProperties = {
  display: 'grid',
  // 13a stacks; 13c puts the form beside the club. One declaration, and the browser picks.
  gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))',
  gap: 'var(--space-5)',
  maxInlineSize: '72rem',
  marginInline: 'auto',
  inlineSize: '100%',
  padding: 'var(--space-4)',
}

const clubColumnStyle: CSSProperties = {
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
  // 13c's sticky form. On 13a the grid is one column and `position: sticky` is inert, so
  // the same rule serves both.
  position: 'sticky',
  insetBlockStart: 'var(--space-4)',
  alignSelf: 'start',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
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

const mapPlaceholderStyle: CSSProperties = {
  blockSize: '8rem',
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

export function GroupRow({ group, locale }: { group: PublicGroup; locale: Locale }) {
  const weekdays = group.training_weekdays ?? []
  const ages =
    group.age_min != null || group.age_max != null
      ? `${t(locale, 'people.landing.ageRange')}: ${group.age_min ?? ''}–${group.age_max ?? ''}`
      : null
  return (
    <li style={groupRowStyle}>
      <span style={groupAccentStyle} aria-hidden="true" />
      <span>
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
  }, [client, slug])

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
    return (
      <Alert tone="danger" iconLabel={t(locale, 'people.error.generic')}>
        {t(locale, 'people.error.generic')}
      </Alert>
    )
  }

  const { landing } = state
  const groups = landing.groups ?? []
  const ladder = landing.belt_ladder ?? []
  const steps = landing.trial_steps ?? []
  const photos = landing.photo_urls ?? []
  // The affordances the phone unlocks — both stripped to digits for the URL schemes.
  const phoneDigits = landing.phone ? landing.phone.replace(/[^\d+]/g, '') : null

  return (
    <main style={pageStyle} data-testid="public-landing">
      <div style={clubColumnStyle}>
        {/* Region 1 — the hero band, inverted. */}
        <section style={invertedBandStyle} aria-labelledby="landing-club-name" data-testid="landing-hero">
          <div style={brandRowStyle}>
            {landing.logo_url ? (
              // The club's own logo, from the unauthenticated public route — the
              // tenant-scoped one needs a token a stranger does not have.
              <img
                src={landing.logo_url}
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

        {/* Region 4 — "when you can come": ONE card of read-only rows. The rows carry no
            pointer affordance and no selected state; the only picker is in the form. */}
        <section aria-labelledby="landing-groups">
          <h2 id="landing-groups">{t(locale, 'people.landing.groupsTitle')}</h2>
          {groups.length > 0 ? (
            <Card>
              <ul style={groupListStyle} data-testid="landing-group-card">
                {groups.map((group) => (
                  <GroupRow key={group.id} group={group} locale={locale} />
                ))}
              </ul>
            </Card>
          ) : (
            <p data-testid="landing-no-groups">{t(locale, 'people.landing.noGroups')}</p>
          )}
        </section>

        {/* Region 6 — the location card. */}
        {landing.address ? (
          <section aria-labelledby="landing-where" data-testid="landing-location">
            <Card>
              <h2 id="landing-where">{t(locale, 'people.landing.whereTitle')}</h2>
              <p data-testid="landing-address">{landing.address}</p>
              <div style={mapPlaceholderStyle} aria-hidden="true" />
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

      {/* Region 5 — the reservation form, OPEN. In both artboards the open form is the
          page's centre of gravity; a button in front of it was the gap. */}
      <section style={offerStyle} aria-labelledby="landing-offer">
        <Card>
          {/* §5.4a — 'one offer: שיעור ניסיון חינם'. L6: the link's only job is a first
              lesson, so nothing here promises a place in the club. */}
          <h2 id="landing-offer">{t(locale, 'people.landing.title')}</h2>
          <p>{t(locale, 'people.landing.subtitle')}</p>
          <BookingFlow
            slug={slug}
            locale={locale}
            client={client}
            groups={groups}
            signedIn={signedIn}
            address={landing.address}
            phone={landing.phone}
          />
        </Card>
      </section>
    </main>
  )
}
