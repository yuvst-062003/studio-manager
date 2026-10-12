// The account tab's own control-level coverage — the seams into it are already proved by
// `permissionBoundaries.test.tsx` ("S10 — 9e (now the account tab): teaches the role", which
// reaches this screen through `App` at `#/account`) and by `App.test.tsx`'s "where the
// accessibility button lives" (the floating FAB disappears once signed in). This file is for
// what neither of those can assert without a race: `AccessibilityMenu`'s floating button and
// this screen's row share the SAME `data-testid="a11y-open"` by design (mirroring the parent
// app's identical choice — see `App.tsx`'s comment beside its own `AccessibilityMenu` mount),
// so a click-through-`<App/>` test can catch the transient signed-out FAB a beat before the
// session resolves and this screen replaces it. Rendering the screen directly, the way the
// parent app's `ProfileScreen.test.tsx` proves its own settings row, sidesteps that race.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@studio/ui'
import { t } from '@studio/i18n'
import { AccountScreen } from './AccountScreen'
import { makeStaffPeopleClient } from '../people/peopleClient'
import { makeStaffCommsClient } from '../comms/staffCommsClient'

/** Every read this screen's children make (my groups, notification preferences, the
 *  calendar feed) answers an empty list — none of them are what this file is testing. */
const fetcher = vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }))

function renderScreen(
  over: { roles?: string[]; viewerIsManager?: boolean; onSignOut?: () => void } = {},
) {
  render(
    // `AccountDrawerFooter`'s theme control reads `useTheme()`.
    <ThemeProvider>
      <AccountScreen
        locale="he"
        displayName="שירה לוי"
        roles={over.roles ?? ['lead_coach']}
        viewerIsManager={over.viewerIsManager ?? false}
        peopleClient={makeStaffPeopleClient(fetcher)}
        commsClient={makeStaffCommsClient(fetcher)}
        studios={[]}
        activeStudioId={null}
        onSwitchStudio={vi.fn()}
        onChooseLocale={vi.fn()}
        onSignOut={over.onSignOut ?? vi.fn()}
      />
    </ThemeProvider>,
  )
}

// נגישות moved into the account tab's legal group, beside privacy, and off the FAB once
// signed in. `App.tsx` holds the other half of this rule; here we prove the row exists and
// opens the real panel, so "removed from the FAB" cannot quietly mean "removed altogether".
describe('the accessibility row in the legal group', () => {
  it('opens the same adjustments panel from the account screen', async () => {
    renderScreen()
    const trigger = await screen.findByTestId('a11y-open')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(trigger)

    expect(
      await screen.findByRole('dialog', { name: t('he', 'common.a11y.title') }),
    ).toBeInTheDocument()
    expect(screen.getByText(t('he', 'common.a11y.statement.title'))).toBeInTheDocument()
  })
})

// Every panel the owner named is behind a row now (2026-10-13), under one heading, opening
// as a sheet. The rule this pins is the one that was actually broken before: a settings
// screen that renders every panel expanded is a screen you scroll past rather than use.
describe('the settings panels open as sheets, not as a column of open panels', () => {
  const CASES = [
    ['notifications-open', 'notifications-sheet'],
    ['calendar-feed-open', 'calendar-feed-sheet'],
    ['preferences-open', 'preferences-sheet'],
  ] as const

  it.each(CASES)('%s opens %s and nothing before it is pressed', async (opener, sheet) => {
    renderScreen()
    expect(screen.queryByTestId(sheet)).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId(opener))

    const dialog = await screen.findByTestId(sheet)
    expect(dialog).toHaveAttribute('role', 'dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('closes again, so the screen is a list of rows between visits', async () => {
    renderScreen()
    await userEvent.click(screen.getByTestId('preferences-open'))
    await screen.findByTestId('preferences-sheet')

    await userEvent.click(screen.getByTestId('preferences-sheet-close'))

    expect(screen.queryByTestId('preferences-sheet')).not.toBeInTheDocument()
  })

  it('offers the emergency contact to an assistant coach only', async () => {
    renderScreen({ roles: ['assistant_coach'] })
    await userEvent.click(screen.getByTestId('emergency-open'))
    expect(await screen.findByTestId('emergency-contact-setting')).toBeInTheDocument()
  })

  it('does not offer it to a lead coach', () => {
    renderScreen()
    expect(screen.queryByTestId('emergency-open')).not.toBeInTheDocument()
  })

  it('keeps language and theme out of the page and inside the sheet', async () => {
    renderScreen()
    // The footer carries the language radios; before 2026-10-13 they were always on screen.
    expect(screen.queryByText(t('he', 'common.language.title'))).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('preferences-open'))

    expect(await screen.findByText(t('he', 'common.language.title'))).toBeInTheDocument()
  })

  it('shows a manager the club rows, and a coach none of them', () => {
    renderScreen({ viewerIsManager: true })
    expect(screen.getByText(t('he', 'billing.cash.manager.title'))).toBeInTheDocument()
  })
})

// Owner, 2026-10-13, looking at the screen this became: "headings for things that belong
// together, not one long row" — and sign out at the END of the page, not inside the
// language/theme sheet where a thumb reaching for "dark" could find it.
describe('the shape of the settings screen', () => {
  it('groups the rows under headings rather than one list', () => {
    renderScreen({ viewerIsManager: true, roles: ['owner', 'assistant_coach'] })
    const headings = [...document.querySelectorAll('h2, h3')].map((n) => n.textContent?.trim())
    expect(headings).toEqual(
      expect.arrayContaining([
        t('he', 'common.account.group.club'),
        t('he', 'common.account.group.notifications'),
        t('he', 'common.account.group.app'),
        t('he', 'common.account.group.safety'),
        t('he', 'common.account.group.legal'),
      ]),
    )
  })

  it('withholds a heading whose rows a coach cannot reach', () => {
    renderScreen()
    const headings = [...document.querySelectorAll('h2, h3')].map((n) => n.textContent?.trim())
    expect(headings).not.toContain(t('he', 'common.account.group.club'))
    // ...and the safety one, which only an assistant coach is offered.
    expect(headings).not.toContain(t('he', 'common.account.group.safety'))
  })

  it('signs out from the end of the page, not from inside a sheet', async () => {
    const onSignOut = vi.fn()
    renderScreen({ onSignOut })

    const button = screen.getByTestId('account-sign-out')
    expect(button).toHaveTextContent(t('he', 'common.nav.signOut'))
    await userEvent.click(button)
    expect(onSignOut).toHaveBeenCalled()
  })

  it('keeps sign out OUT of the language and theme sheet', async () => {
    renderScreen()
    await userEvent.click(screen.getByTestId('preferences-open'))
    const sheet = await screen.findByTestId('preferences-sheet')

    expect(sheet.textContent).not.toContain(t('he', 'common.nav.signOut'))
    // The two things it does carry.
    expect(sheet.textContent).toContain(t('he', 'common.language.title'))
    expect(sheet.textContent).toContain(t('he', 'common.theme.legend'))
  })
})
