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
// G12 — logical properties only. This page renders right-to-left in Hebrew and
// left-to-right in English, and it is the one screen in the product a stranger sees first.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, Card, EmptyState } from '@studio/ui'
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

const heroStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
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
  maxInlineSize: '8rem',
  blockSize: 'auto',
}

const groupListStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
}

/** §5.4a — "מתאמנים בימים". 0-6 Sunday-first, matching `group_schedule_rule.weekday`. */
function trainingDays(locale: Locale, weekdays: number[]): string {
  return weekdays.map((day) => t(locale, `people.weekdays.${day}`)).join(' · ')
}

export function GroupCard({ group, locale }: { group: PublicGroup; locale: Locale }) {
  // The schema types this optional because the server gives it a default; an empty
  // list is the real answer for a group whose timetable is not built yet.
  const weekdays = group.training_weekdays ?? []
  const ages =
    group.age_min != null || group.age_max != null
      ? `${t(locale, 'people.landing.ageRange')}: ${group.age_min ?? ''}–${group.age_max ?? ''}`
      : null
  return (
    <li>
      <Card>
        <h3 data-testid="landing-group-name">
          <bdi>{group.name}</bdi>
        </h3>
        {group.description ? <p>{group.description}</p> : null}
        {ages ? <p data-testid="landing-group-ages">{ages}</p> : null}
        {weekdays.length > 0 ? (
          <p data-testid="landing-group-days">
            {t(locale, 'people.landing.weeklySchedule')}:{' '}
            {trainingDays(locale, weekdays)}
          </p>
        ) : (
          // An empty list is a real answer — the club has not built its timetable yet —
          // and saying so beats an unexplained blank line.
          <p data-testid="landing-group-no-schedule">{t(locale, 'people.weekdays.noSchedule')}</p>
        )}
      </Card>
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
  const [booking, setBooking] = useState(false)

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

  return (
    <main style={pageStyle} data-testid="public-landing">
      <section style={heroStyle} aria-labelledby="landing-club-name">
        {landing.logo_url ? (
          // The club's own logo, from the unauthenticated public route — the tenant-scoped
          // one needs a token a stranger does not have.
          <img
            src={landing.logo_url}
            alt={landing.studio_name}
            style={logoStyle}
            data-testid="landing-logo"
          />
        ) : null}
        {/* The club's name is DATA, not a translated string: it is what the club calls
            itself, in whatever language they chose. */}
        <h1 id="landing-club-name">
          <bdi>{landing.studio_name}</bdi>
        </h1>
        {landing.headline ? <p data-testid="landing-headline">{landing.headline}</p> : null}
        {landing.about ? (
          <section aria-labelledby="landing-about">
            <h2 id="landing-about">{t(locale, 'people.landing.aboutTitle')}</h2>
            <p>{landing.about}</p>
          </section>
        ) : null}
        {landing.address ? (
          <section aria-labelledby="landing-where">
            <h2 id="landing-where">{t(locale, 'people.landing.whereTitle')}</h2>
            <p data-testid="landing-address">{landing.address}</p>
          </section>
        ) : null}

        <section aria-labelledby="landing-groups">
          <h2 id="landing-groups">{t(locale, 'people.landing.groupsTitle')}</h2>
          {groups.length > 0 ? (
            <ul style={groupListStyle}>
              {groups.map((group) => (
                <GroupCard key={group.id} group={group} locale={locale} />
              ))}
            </ul>
          ) : (
            <p data-testid="landing-no-groups">{t(locale, 'people.landing.noGroups')}</p>
          )}
        </section>
      </section>

      <section style={offerStyle} aria-labelledby="landing-offer">
        <Card>
          {/* §5.4a — 'one offer: שיעור ניסיון חינם'. L6: the link's only job is a first
              lesson, so nothing here promises a place in the club. */}
          <h2 id="landing-offer">{t(locale, 'people.landing.title')}</h2>
          <p>{t(locale, 'people.landing.subtitle')}</p>
          {booking ? (
            <BookingFlow
              slug={slug}
              locale={locale}
              client={client}
              groups={groups}
              signedIn={signedIn}
            />
          ) : (
            <Button onClick={() => setBooking(true)} data-testid="landing-start-booking">
              {t(locale, 'people.landing.submit')}
            </Button>
          )}
        </Card>
      </section>
    </main>
  )
}
