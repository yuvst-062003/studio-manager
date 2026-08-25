// Parent artboard 1a — the BASE home, 390×844, light and dark.
//
// 1a and 2a are the same screen at two milestones. 2a — the day strip and past attendance
// — is M5's, and is deliberately NOT built here.
//
// **What 1a can honestly render in M1, and why the rest is an empty state rather than
// mock data.** 1a draws three data regions above the tab bar: alert cards (a debt, a
// missing health declaration), lessons grouped by day, and a chip per child. Every one of
// them reads a table that does not exist yet:
//
//   the chips    — `guardian` exists, and §3.3 makes 'my children' exactly
//                  `SELECT student_id FROM guardian WHERE person_id = me`. But
//                  `guardian.student_id` carries no foreign key on purpose (D-M1-1):
//                  `student` is M3's table, so M1 can count children and cannot name one.
//   the lessons  — `session` and `enrollment` are W2 contract models.
//   the alerts   — a charge is M6's and a health declaration is M4's.
//
// So the home ships its chrome and says what is missing, in the parent's own language,
// rather than shipping a plausible-looking screen full of invented children. A parent who
// opens this before their club has a schedule should read "the club has not built the
// schedule yet", not an empty box.
import type { CSSProperties } from 'react'
import { Card, EmptyState } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

/** 1a's bottom bar. The three that are not home open in later milestones. */
export const TABS = ['home', 'payments', 'messages', 'profile'] as const

export type ParentTab = (typeof TABS)[number]

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
  gap: 'var(--space-1)',
  // §6.2's 44px rule is a phone rule, not a staff rule — it applies here for the same
  // reason: a thumb, one-handed, on a moving bus.
  minBlockSize: '44px',
  fontSize: 'var(--text-caption)',
}

export function ParentHome({
  locale,
  hasChildren = false,
  activeTab = 'home',
  onSelectTab,
}: {
  locale: Locale
  /**
   * A boolean and not a count, because a boolean is exactly what M1 knows. §6.1's parent
   * query is `EXISTS(guardian WHERE person_id = :me)` — it answers *whether*, and
   * `guardian.student_id` carries no foreign key (D-M1-1) because `student` is M3's
   * table, so nothing here can turn that EXISTS into a number or a name. Rendering a
   * fabricated `1` would be worse than rendering the truth.
   */
  hasChildren?: boolean
  activeTab?: ParentTab
  onSelectTab?: (tab: ParentTab) => void
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
        {/* A charge is M6's and a declaration is M4's, so there is genuinely nothing to
            raise. "Nothing needs your attention" is the truth today and stays correct
            once those milestones land. */}
        <p data-testid="parent-home-no-alerts">{t(locale, 'common.home.noAlerts')}</p>
      </section>

      <section aria-labelledby="parent-home-children-title">
        <h2 id="parent-home-children-title">{t(locale, 'common.home.title')}</h2>
        {hasChildren ? (
          <Card>
            {/* 1a draws a chip per child. A chip needs a name, and `student` is M3's
                table — so what lands here is the sentence that says when the names
                arrive, not an invented roster. */}
            <p data-testid="parent-home-children-pending">
              {t(locale, 'common.home.childrenComeLater')}
            </p>
          </Card>
        ) : (
          <EmptyState
            title={t(locale, 'common.home.noChildren')}
            description={t(locale, 'common.home.childrenComeLater')}
          />
        )}
      </section>

      <section aria-labelledby="parent-home-upcoming-title">
        <h2 id="parent-home-upcoming-title">{t(locale, 'common.home.upcoming')}</h2>
        <EmptyState
          title={t(locale, 'common.home.noUpcoming')}
          description={t(locale, 'common.home.upcomingComeLater')}
        />
      </section>

      <nav aria-label={t(locale, 'common.home.title')}>
        <ul style={tabBarStyle}>
          {TABS.map((tab) => (
            <li key={tab} style={tabStyle}>
              <button
                type="button"
                aria-current={tab === activeTab ? 'page' : undefined}
                // The three that are not home open in later milestones. Disabled and
                // explained beats a tab that navigates to a blank screen.
                disabled={tab !== 'home'}
                data-testid={`parent-tab-${tab}`}
                onClick={() => onSelectTab?.(tab)}
              >
                {t(locale, `common.home.tab.${tab}`)}
              </button>
            </li>
          ))}
        </ul>
        <p data-testid="parent-tabs-note">{t(locale, 'common.home.tabsComeLater')}</p>
      </nav>
    </section>
  )
}
