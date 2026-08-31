// The public landing page, rebuilt 2026-08-30 to LOOK like the user's Stitch design —
// the "דף נחיתה סופי" screens — after the arrangement-only pass was rejected. The page
// carries its own scoped theme (the `gl-` classes and `--gl-` variables in landing.css):
// Stitch's navy `#003874`, its crimson accent, squared buttons, the zen-dot ground, the
// colored week timetable with its legend, pricing tiers and testimonials.
//
// **Two content sources, one tree.** `clubContentFor(slug, locale)` returns the club's designed
// marketing content (today: hardcoded Gladiator, transcribed from the Stitch screens —
// see clubContent.ts for the debt note). A slug without content renders the same page
// minus the content-only sections, with the schedule derived from the API's groups — so
// no club ever shows another club's coach or prices.
//
// Domain decisions that survive the restyle: the sign-in wall stands in front of BOOKING,
// never reading (§5.4a); every call to action opens the booking dialog, whose own group
// select is where the choice lives now; `?book=` still resumes the flow after the sign-in
// round trip; the phone keeps its bottom bar. The club's `headline`/`about`/`address`
// remain data, chrome remains i18n, and ranges render through RangeText — the Stitch
// prompt's own "ranges low first" rule.
//
// G12 — logical properties only. This page renders right-to-left in Hebrew and
// left-to-right in English, and it is the one screen in the product a stranger sees first.
import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { apiUrl } from '@studio/core'
import { Button, EmptyState, LoadFailed, MoneyDisplay, RangeText } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { LandingClient, PublicGroup, PublicLanding as Landing } from './landingClient'
import type { ClubContent, SlotCategory } from './clubContent'
import { clubContentFor } from './clubContent'
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
  // minmax(0, …), not bare 1fr: the schedule pager's intrinsic width must not be allowed
  // to widen the one column past the phone's screen — a track's automatic minimum would.
  gridTemplateColumns: 'minmax(0, 1fr)',
}

/** §5.4a — "מתאמנים בימים". 0-6 Sunday-first, matching `group_schedule_rule.weekday`. */
function trainingDays(locale: Locale, weekdays: number[]): string {
  return weekdays.map((day) => t(locale, `people.weekdays.${day}`)).join(' · ')
}

/** `ראשון וחמישי · 16:00` — the résumé line the booking dialog shows for the group. */
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

function hasAges(group: PublicGroup): boolean {
  return group.age_min != null || group.age_max != null
}

/** The one-line résumé of a group: ages, then days-and-times. */
function groupMeta(locale: Locale, group: PublicGroup): string {
  return [ageLine(locale, group), scheduleLine(locale, group)].filter(Boolean).join(' · ')
}

/**
 * The age range as RangeText's one LTR island — bidi renders a plain `4–6` as `6–4` in
 * Hebrew, which is the exact defect the Stitch prompt's third rule exists to prevent.
 */
function AgeRange({ locale, group }: { locale: Locale; group: PublicGroup }) {
  if (!hasAges(group)) return null
  return (
    <>
      {t(locale, 'people.landing.ageRange')}:{' '}
      <RangeText from={String(group.age_min ?? '')} to={String(group.age_max ?? '')} />
    </>
  )
}

// Two inline icons for the coach credentials — drawn here because the app loads no icon
// font, and the offline PWA must not fetch Material Symbols at runtime.
function CredentialIcon({ kind }: { kind: 'experience' | 'education' }) {
  return (
    <svg viewBox="0 0 24 24" className="gl-cred-icon" aria-hidden="true">
      {kind === 'experience' ? (
        // A medal: ribbon over a disc.
        <>
          <path d="M8 2h8l-3 7h-2L8 2z" fill="currentColor" />
          <circle cx="12" cy="15" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="15" r="2" fill="currentColor" />
        </>
      ) : (
        // A mortarboard.
        <>
          <path d="M12 4 2 9l10 5 10-5-10-5z" fill="currentColor" />
          <path d="M6 12.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.5l-6 3-6-3z" fill="currentColor" />
        </>
      )}
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="gl-check" aria-hidden="true">
      <path
        d="M4 12.5 9.5 18 20 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Sunday-first, matching `people.weekdays.*` and `group_schedule_rule.weekday`. */
const WEEK = [0, 1, 2, 3, 4, 5, 6]

/**
 * The designed timetable — the Stitch table, cell for cell: a column per day, tinted
 * slots by category, the legend underneath. Times render through RangeText.
 */
function ContentSchedule({ content, locale }: { content: ClubContent; locale: Locale }) {
  const categories = Object.keys(content.categoryNames) as SlotCategory[]
  return (
    <section className="gl-section" aria-labelledby="landing-schedule" data-testid="landing-schedule">
      <div className="gl-section-inner">
        <h2 id="landing-schedule" className="gl-title">
          {t(locale, 'people.landing.scheduleTitle')}
        </h2>
        <p className="gl-lead">{content.scheduleLead}</p>
        <div className="gl-week">
          {content.schedule.map(({ day, slots }) => (
            <div className="gl-day" key={day}>
              <h3 className="gl-day-name">{t(locale, `people.weekdays.${day}`)}</h3>
              <ul className="gl-day-list">
                {slots.map((slot) => (
                  <li key={`${slot.time[0]}-${slot.title}`} className={`gl-slot gl-slot--${slot.category}`}>
                    <span className="gl-slot-time">
                      <RangeText from={slot.time[0]} to={slot.time[1]} />
                    </span>
                    <span className="gl-slot-title">{slot.title}</span>
                    {slot.note ? <span className="gl-slot-note">{slot.note}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <ul className="gl-legend">
          {categories.map((category) => (
            <li key={category} className="gl-legend-item">
              <span className={`gl-legend-dot gl-slot--${category}`} aria-hidden="true" />
              {content.categoryNames[category]}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/**
 * The data-driven fallback for clubs without designed content: the same visual week, one
 * column per day somebody trains on, derived from the API's groups. Each slot is a real
 * button that opens the booking flow for ITS group. The public contract pairs times with
 * the group, not the day, so a group shows the same start times in each of its columns.
 */
function DerivedSchedule({
  groups,
  locale,
  onBook,
}: {
  groups: PublicGroup[]
  locale: Locale
  onBook: (id: string) => void
}) {
  const days = WEEK.map((day) => ({
    day,
    entries: groups.filter((group) => (group.training_weekdays ?? []).includes(day)),
  })).filter(({ entries }) => entries.length > 0)
  if (days.length === 0) return null
  return (
    <section className="gl-section" aria-labelledby="landing-schedule" data-testid="landing-schedule">
      <div className="gl-section-inner">
        <h2 id="landing-schedule" className="gl-title">
          {t(locale, 'people.landing.scheduleTitle')}
        </h2>
        <div className="gl-week">
          {days.map(({ day, entries }) => (
            <div className="gl-day" key={day}>
              <h3 className="gl-day-name">{t(locale, `people.weekdays.${day}`)}</h3>
              <ul className="gl-day-list">
                {entries.map((group) => (
                  <li key={group.id}>
                    <button
                      type="button"
                      className="gl-slot gl-slot--judo gl-slot--button"
                      onClick={() => onBook(group.id)}
                      data-testid={`landing-slot-${day}-${group.id}`}
                    >
                      {(group.training_times ?? []).length > 0 ? (
                        <span className="gl-slot-time">{(group.training_times ?? []).join(' · ')}</span>
                      ) : null}
                      <span className="gl-slot-title" data-testid="landing-group-name">
                        <bdi>{group.name}</bdi>
                      </span>
                      {hasAges(group) ? (
                        <span className="gl-slot-note" data-testid="landing-group-ages">
                          <AgeRange locale={locale} group={group} />
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function PublicLanding({
  slug,
  locale,
  client,
  signedIn = false,
  languagePicker,
}: {
  slug: string
  locale: Locale
  client: LandingClient
  /** §5.4a step 1 — sign-in-first. The flow renders the wall until this is true. */
  signedIn?: boolean
  /** §6.1's language-before-login control, rendered into the header's end slot. Passed
   *  in rather than imported so this file keeps no dependency on the app's shell — the
   *  same reason `SignIn` takes it as a node. */
  languagePicker?: ReactNode
}) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  // Bumped by LoadFailed's retry — a real re-fetch, never location.reload() (P8).
  const [attempt, setAttempt] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // The API can advertise a logo whose object is gone — staging's store is the api
  // container's own filesystem, so every redeploy drops what was uploaded to it, and the
  // key outlives the bytes. A broken image on the club's shop window is worse than the
  // bundled mark, so a failed load falls back instead of showing a torn-page icon.
  const [logoFailed, setLogoFailed] = useState(false)
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
  const content = clubContentFor(slug, locale)
  const groups = landing.groups ?? []
  // The designed page prefers its own steps: `trial_steps` is a single-language column, so
  // on a club with designed content an English reader was shown the manager's Hebrew.
  const steps = content?.steps ?? landing.trial_steps ?? []
  const photos = landing.photo_urls ?? []
  // The affordances the phone unlocks — both stripped to digits for the URL schemes.
  const phoneDigits = landing.phone ? landing.phone.replace(/[^\d+]/g, '') : null
  // An uploaded logo always wins — until it 404s; the bundled brand asset is the fallback
  // for a club whose object store has none, or has lost it (see clubContent.ts).
  const logoUrl = (!logoFailed ? landing.logo_url : null) ?? content?.logoUrl ?? null
  const logoIsRemote = logoUrl === landing.logo_url
  // `landing.logo_url` is an API PATH, not a public URL: on split origins the browser
  // resolves a relative path against THIS app's host and 404s, so it goes through
  // `apiUrl` (2026-08-30). The bundled fallback is served by this app and must not be
  // rewritten — hence the rewrite is keyed on `logoIsRemote`, not applied to both.
  const logoSrc = logoUrl !== null && logoIsRemote ? apiUrl(logoUrl) : logoUrl
  // `studio.name` is one column with no locale. A club with designed content names itself
  // per language; every other club keeps its single stored name.
  const clubName = content?.displayName ?? landing.studio_name
  const hasSchedule = groups.some((group) => (group.training_weekdays ?? []).length > 0)

  // Derived, not synced: an explicit pick wins, then the round trip's `?book=`, then the
  // first group — so the flow always opens with a real group carried in.
  const resumedId = new URLSearchParams(globalThis.location?.search ?? '').get('book')
  const selectedGroup =
    groups.find((group) => group.id === (selectedId ?? resumedId)) ?? groups[0] ?? null
  const bookGroup = (id: string) => {
    setSelectedId(id)
    setFlowOpen(true)
  }
  const openFlow = () => setFlowOpen(true)

  // The header's and footer's shared anchors. The designed content brings its own labels
  // (the club's voice); the data-driven page links only the sections that exist.
  const anchors = content
    ? content.navItems
    : [
        landing.about
          ? { href: '#landing-about', label: t(locale, 'people.landing.aboutTitle') }
          : null,
        hasSchedule
          ? { href: '#landing-schedule', label: t(locale, 'people.landing.scheduleTitle') }
          : null,
        landing.address
          ? { href: '#landing-where', label: t(locale, 'people.landing.whereTitle') }
          : null,
      ].filter((anchor): anchor is { href: string; label: string } => anchor !== null)

  return (
    <div className="landing-root">
      {/* The sticky header — brand at the start, anchors and the one way in at the end.
          The nav is desktop furniture (landing.css hides it on the phone). */}
      <header className="gl-header" data-testid="landing-header">
        <div className="gl-header-inner">
          {logoUrl ? (
            // The club's own logo, from the unauthenticated public route — the
            // tenant-scoped one needs a token a stranger does not have.
            <img
              src={logoSrc ?? undefined}
              alt={clubName}
              className="gl-logo"
              data-testid="landing-logo"
              onError={logoIsRemote ? () => setLogoFailed(true) : undefined}
            />
          ) : null}
          {/* The club's name is DATA, not a translated string: it is what the club
              calls itself, in whatever language they chose. */}
          <h1 className="gl-brand">
            <bdi>{clubName}</bdi>
          </h1>
          <div className="gl-header-end">
            {anchors.length > 0 ? (
              <nav className="landing-header-nav gl-nav" aria-label={t(locale, 'people.landing.siteNav')}>
                {anchors.map((anchor) => (
                  <a key={anchor.href} href={anchor.href}>
                    {anchor.label}
                  </a>
                ))}
              </nav>
            ) : null}
            {landing.phone ? (
              <a className="gl-phone" href={`tel:${phoneDigits}`} data-testid="landing-phone">
                <bdi dir="ltr">{landing.phone}</bdi>
              </a>
            ) : null}
            {languagePicker ? (
              <div className="gl-lang" data-testid="landing-lang">
                {languagePicker}
              </div>
            ) : null}
            <button type="button" className="gl-btn gl-btn--navy" onClick={openFlow} data-testid="landing-join">
              {t(locale, 'people.landing.joinNow')}
            </button>
          </div>
        </div>
      </header>

      <main className="landing-page" style={pageStyle} data-testid="public-landing">
        {/* The hero — Stitch's statement: the season badge, the display headline with its
            crimson accent, the lead, and the two ways forward. */}
        <section className="gl-hero" aria-labelledby="landing-headline" data-testid="landing-hero">
          <div className="gl-hero-inner">
            <div className="gl-hero-copy">
              {content ? (
                <div className="gl-badge">
                  <span>{content.seasonBadge}</span>
                </div>
              ) : null}
              <h2 id="landing-headline" className="gl-display" data-testid="landing-headline">
                {content ? (
                  <>
                    {content.hero.prefix}
                    <br />
                    {content.hero.middle} <span className="gl-accent">{content.hero.accent}</span>
                  </>
                ) : (
                  (landing.headline ?? t(locale, 'people.landing.title'))
                )}
              </h2>
              <p className="gl-lead">{content?.hero.lead ?? t(locale, 'people.landing.subtitle')}</p>
              <div className="gl-cta-row">
                <button type="button" className="gl-btn gl-btn--red" onClick={openFlow} data-testid="landing-hero-cta">
                  {t(locale, 'people.landing.freeTrial')}
                </button>
                {content || landing.about ? (
                  <a className="gl-btn gl-btn--outline" href="#landing-about" data-testid="landing-hero-learn-more">
                    {t(locale, 'people.landing.learnMore')}
                  </a>
                ) : null}
              </div>
            </div>
            {logoUrl ? (
              <div className="gl-hero-visual" aria-hidden="true">
                <img src={logoSrc ?? undefined} alt="" />
              </div>
            ) : null}
          </div>
        </section>

        {/* The coach — the designed second act; the data-driven page shows the club's own
            `about` text and photos in the same slot. */}
        {content ? (
          <section className="gl-section gl-section--zen" aria-labelledby="landing-about" data-testid="landing-coach">
            <div className="gl-section-inner gl-coach">
              <div className="gl-coach-copy">
                <h2 id="landing-about" className="gl-title gl-title--stacked">
                  {content.coach.headingTop}
                  <span>{content.coach.headingBottom}</span>
                </h2>
                <p className="gl-coach-bio">{content.coach.bio}</p>
                <div className="gl-cred-row">
                  {content.coach.credentials.map((credential) => (
                    <div className="gl-cred" key={credential.title}>
                      <CredentialIcon kind={credential.icon} />
                      <h3 className="gl-cred-title">{credential.title}</h3>
                      <p className="gl-cred-text">{credential.text}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="gl-coach-visual">
                {photos[0] ? (
                  <img src={photos[0]} alt={content.coach.name} className="gl-coach-photo" />
                ) : (
                  // No photo uploaded: the club's own mark on a tinted panel. Stitch drew
                  // a dashed "add" placeholder here, which is right in a design tool and
                  // reads as broken on a page a parent actually opens.
                  <div className="gl-coach-photo gl-coach-photo--empty">
                    {logoSrc ? <img src={logoSrc} alt="" /> : null}
                  </div>
                )}
                <div className="gl-coach-card">
                  <h3>{content.coach.name}</h3>
                  <p>{content.coach.title}</p>
                </div>
              </div>
            </div>
          </section>
        ) : landing.about || photos.length > 0 ? (
          <section className="gl-section gl-section--zen" aria-labelledby="landing-about">
            <div className="gl-section-inner gl-coach">
              <div className="gl-coach-copy">
                <h2 id="landing-about" className="gl-title">
                  {t(locale, 'people.landing.aboutTitle')}
                </h2>
                {landing.about ? <p className="gl-coach-bio">{landing.about}</p> : null}
              </div>
              {photos.length > 0 ? (
                <div className="gl-photos" data-testid="landing-photos">
                  {photos.map((url) => (
                    // Alt text: the club's name — the photos are the club, and the API
                    // carries no per-photo caption to say more.
                    <img key={url} src={url} alt={clubName} className="gl-photo" />
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* The week — designed cell-for-cell when the club has content, derived from the
            API's groups when it does not. */}
        {content ? (
          <ContentSchedule content={content} locale={locale} />
        ) : (
          <DerivedSchedule groups={groups} locale={locale} onBook={bookGroup} />
        )}

        {/* The pricing tiers — content only: the public contract serves no prices. */}
        {content ? (
          <section className="gl-section" aria-labelledby="landing-plans" data-testid="landing-plans">
            <div className="gl-section-inner">
              <h2 id="landing-plans" className="gl-title">
                {content.plansTitle}
              </h2>
              <p className="gl-lead">{content.plansLead}</p>
              <div className="gl-plans">
                {content.plans.map((plan) => (
                  <article className={plan.highlighted ? 'gl-plan gl-plan--highlight' : 'gl-plan'} key={plan.name}>
                    {plan.badge ? <p className="gl-plan-badge">{plan.badge}</p> : null}
                    <h3 className="gl-plan-name">{plan.name}</h3>
                    <p className="gl-plan-cadence">{plan.cadence}</p>
                    <p className="gl-price">
                      <MoneyDisplay agorot={plan.priceAgorot} />
                      <span className="gl-price-per">{content.perMonth}</span>
                    </p>
                    <ul className="gl-plan-features">
                      {plan.features.map((feature) => (
                        <li key={feature}>
                          <CheckIcon />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className={plan.highlighted ? 'gl-btn gl-btn--red gl-btn--full' : 'gl-btn gl-btn--outline gl-btn--full'}
                      onClick={openFlow}
                    >
                      {plan.cta}
                    </button>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* The voices — content only: the contract serves no testimonials. */}
        {content ? (
          <section className="gl-section gl-section--zen" aria-labelledby="landing-voices" data-testid="landing-voices">
            <div className="gl-section-inner">
              <h2 id="landing-voices" className="gl-title">
                {content.voicesTitle}
              </h2>
              <div className="gl-voices">
                {content.voices.map((voice) => (
                  <figure className="gl-voice" key={voice.name}>
                    <span className="gl-voice-mark" aria-hidden="true">
                      ”
                    </span>
                    <blockquote>{voice.quote}</blockquote>
                    <figcaption>
                      <span className="gl-voice-initial" aria-hidden="true">
                        {voice.name.slice(0, 1)}
                      </span>
                      <span>
                        <strong>{voice.name}</strong>
                        {voice.role ? <small>{voice.role}</small> : null}
                      </span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* The club's own trial steps — data, shown whenever the club wrote them. */}
        {steps.length > 0 ? (
          <section className="gl-section" aria-labelledby="landing-steps" data-testid="landing-steps">
            <div className="gl-section-inner">
              <h2 id="landing-steps" className="gl-title">
                {t(locale, 'people.landing.stepsTitle')}
              </h2>
              <ol className="gl-steps">
                {steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          </section>
        ) : null}

        {/* The location — the affordances a parent actually uses, kept from the shipped
            page (Stitch's footer only waved at "צור קשר"). */}
        {landing.address ? (
          <section className="gl-section" aria-labelledby="landing-where" data-testid="landing-location">
            <div className="gl-section-inner">
              <h2 id="landing-where" className="gl-title">
                {t(locale, 'people.landing.whereTitle')}
              </h2>
              <p data-testid="landing-address">{landing.address}</p>
              <iframe
                title={t(locale, 'people.landing.mapTitle')}
                src={`https://maps.google.com/maps?q=${encodeURIComponent(landing.address)}&output=embed&hl=${locale}`}
                className="gl-map"
                loading="lazy"
              />
              <div className="gl-cta-row">
                <a
                  className="gl-btn gl-btn--outline"
                  href={`https://maps.google.com/?q=${encodeURIComponent(landing.address)}`}
                  data-testid="landing-navigate"
                >
                  {t(locale, 'people.landing.navigate')}
                </a>
                {phoneDigits ? (
                  <a
                    className="gl-btn gl-btn--outline"
                    href={`https://wa.me/${phoneDigits.replace(/^0/, '972')}`}
                    data-testid="landing-whatsapp"
                  >
                    {t(locale, 'people.landing.whatsapp')}
                  </a>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {/* The footer — the navy band: brand, the anchors again, the offer, the line. */}
        <footer className="gl-footer" data-testid="landing-footer">
          {logoSrc ? <img src={logoSrc} alt="" className="gl-footer-logo" /> : null}
          <p className="gl-footer-brand">
            <bdi>{clubName}</bdi>
          </p>
          <p className="gl-footer-offer">{t(locale, 'people.landing.footerOffer')}</p>
          {anchors.length > 0 ? (
            <div className="gl-footer-nav">
              {anchors.map((anchor) => (
                <a key={anchor.href} className="gl-footer-navlink" href={anchor.href}>
                  {anchor.label}
                </a>
              ))}
              {landing.address ? (
                <a className="gl-footer-navlink" href="#landing-where">
                  {t(locale, 'people.landing.whereTitle')}
                </a>
              ) : null}
            </div>
          ) : null}
          {landing.phone ? (
            <a className="gl-footer-phone" href={`tel:${phoneDigits}`}>
              <bdi dir="ltr">{landing.phone}</bdi>
            </a>
          ) : null}
          {content ? <p className="gl-footer-line">{content.copyright}</p> : null}
        </footer>

        {/* The mobile sticky CTA — landing.css pins it to the screen's bottom edge and
            hides it at desk widths, where the header's way in is always on screen. Gone
            while the flow is open: the dialog owns the screen then. */}
        {!flowOpen && selectedGroup ? (
          <div className="landing-sticky-bar">
            <Button onClick={openFlow} data-testid="landing-sticky-cta" style={{ inlineSize: '100%' }}>
              {t(locale, 'people.landing.freeTrial')}
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
            onGroupChange={setSelectedId}
          />
        ) : null}
      </main>
    </div>
  )
}
