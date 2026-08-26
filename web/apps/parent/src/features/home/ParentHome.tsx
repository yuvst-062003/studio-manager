// Parent artboard 1a — the BASE home, 390×844, light and dark.
//
// 1a and 2a are the same screen at two milestones. 2a — the day strip and past attendance
// — is M5's, and is deliberately NOT built here.
//
// **The W1 placeholders are retired (ship-audit B4).** This screen shipped through W6
// still saying a child cannot be named (`student` was M3's table when that was written),
// the lesson list would appear "when the club builds a schedule", and three of four tabs
// were disabled under "ייפתחו בהמשך" — while `/me/students` named every child, the family
// had a materialized schedule, and the payments screen behind the dead tab was the
// subject of two green E2E flows. The home now renders what the product knows and the
// tabs are links to the screens that exist. Data arrives by PROPS: `Resolve` owns the
// fetches, so this stays the presentational component every test renders directly.
import type { CSSProperties } from 'react'
import { formatDateInStudioZone, formatTimeInStudioZone } from '@studio/core'
import { Card, EmptyState } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export const TABS = ['home', 'payments', 'messages', 'profile'] as const

export type ParentTab = (typeof TABS)[number]

/** Every tab routes somewhere real; a disabled tab over a working screen was B4. */
export const TAB_ROUTES: Record<ParentTab, string> = {
  home: '#/',
  payments: '#/payments',
  // The inbox route kept its §5.11 name; the tab keeps 1a's label. One screen, two words
  // for it, and the route is the one that must not churn — it is in parents' history.
  messages: '#/announcements',
  profile: '#/profile',
}

export type HomeStudent = {
  id: string
  displayName: string
  groupNames: readonly string[]
}

export type HomeLesson = {
  id: string
  /** UTC ISO — rendered in the studio zone here, per G3. */
  startsAt: string
  groupName: string
}

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  // 390×844 is the drawn size, not a maximum: the same screen has to survive a 430pt Pro
  // Max and a desktop tab, so it is a max-width rather than a fixed width.
  maxInlineSize: '30rem',
  marginInline: 'auto',
  inlineSize: '100%',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 'var(--space-3)',
}

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--text-display)',
  fontWeight: 600,
  // 1a sets the title flush to the reading edge and the gear to the far edge. Logical, so
  // it flips with the locale rather than staying on the right in en.
  marginInlineEnd: 'auto',
}

const chipListStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

const lessonListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

const lessonRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
}

const mutedStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
}

const tabBarStyle: CSSProperties = {
  display: 'flex',
  listStyle: 'none',
  margin: 0,
  padding: 0,
  gap: 'var(--space-2)',
  borderBlockStart: 'var(--border-width-hairline) solid var(--border)',
  paddingBlockStart: 'var(--space-3)',
}

const tabStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-1)',
  // §6.2's 44px rule is a phone rule, not a staff rule — it applies here for the same
  // reason: a thumb, one-handed, on a moving bus.
  minBlockSize: '44px',
  fontSize: 'var(--text-caption)',
}

export function ParentHome({
  locale,
  students = null,
  upcoming = null,
  activeTab = 'home',
}: {
  locale: Locale
  /** `null` while loading — the section stays quiet rather than flashing an empty state. */
  students?: readonly HomeStudent[] | null
  /** The next few lessons, already filtered and capped by the caller. `null` = loading. */
  upcoming?: readonly HomeLesson[] | null
  activeTab?: ParentTab
}) {
  return (
    <section aria-labelledby="parent-home-title" data-testid="parent-home" style={pageStyle}>
      <header style={headerStyle}>
        <h1 id="parent-home-title" style={titleStyle}>
          {t(locale, 'common.home.title')}
        </h1>
        {/* 1a's gear. A link and not an icon-only button with no name: an unnamed control
            is unreachable to a screen reader (ui-rtl-a11y.md). */}
        <a href="#/settings" data-testid="parent-home-settings">
          {t(locale, 'common.home.settings')}
        </a>
      </header>

      <section aria-labelledby="parent-home-alerts-title">
        <h2 id="parent-home-alerts-title">{t(locale, 'common.home.alerts')}</h2>
        {/* Debt and health alerts are 2a's day-strip milestone territory; until then the
            truth is stated rather than an empty box drawn. */}
        <p data-testid="parent-home-no-alerts">{t(locale, 'common.home.noAlerts')}</p>
      </section>

      <section aria-labelledby="parent-home-children-title">
        <h2 id="parent-home-children-title">{t(locale, 'common.home.title')}</h2>
        {students === null ? null : students.length === 0 ? (
          <EmptyState
            title={t(locale, 'common.home.noChildren')}
            description={t(locale, 'common.home.childrenComeLater')}
          />
        ) : (
          <ul style={chipListStyle}>
            {students.map((student) => (
              <li key={student.id} data-testid="parent-home-child" style={{ flex: '1 1 12rem' }}>
                <Card>
                  <strong>
                    <bdi>{student.displayName}</bdi>
                  </strong>
                  {student.groupNames.length > 0 ? (
                    <p style={mutedStyle}>
                      <bdi>{student.groupNames.join(' · ')}</bdi>
                    </p>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="parent-home-upcoming-title">
        <h2 id="parent-home-upcoming-title">{t(locale, 'common.home.upcoming')}</h2>
        {upcoming === null ? null : upcoming.length === 0 ? (
          <EmptyState
            title={t(locale, 'common.home.noUpcoming')}
            description={t(locale, 'common.home.noUpcomingWeek')}
          />
        ) : (
          <ul style={lessonListStyle}>
            {upcoming.map((lesson) => (
              <li key={lesson.id} data-testid="parent-home-lesson" style={lessonRowStyle}>
                <bdi>{lesson.groupName}</bdi>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatDateInStudioZone(lesson.startsAt, locale)}{' '}
                  {formatTimeInStudioZone(lesson.startsAt, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav aria-label={t(locale, 'common.home.title')}>
        <ul style={tabBarStyle}>
          {TABS.map((tab) => (
            <li key={tab} style={{ flex: 1, display: 'flex' }}>
              <a
                href={TAB_ROUTES[tab]}
                aria-current={tab === activeTab ? 'page' : undefined}
                data-testid={`parent-tab-${tab}`}
                style={tabStyle}
              >
                {t(locale, `common.home.tab.${tab}`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  )
}
