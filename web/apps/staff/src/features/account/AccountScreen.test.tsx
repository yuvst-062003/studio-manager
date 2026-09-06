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

function renderScreen() {
  render(
    // `AccountDrawerFooter`'s theme control reads `useTheme()`.
    <ThemeProvider>
      <AccountScreen
        locale="he"
        displayName="שירה לוי"
        roles={['lead_coach']}
        viewerIsManager={false}
        peopleClient={makeStaffPeopleClient(fetcher)}
        commsClient={makeStaffCommsClient(fetcher)}
        studios={[]}
        activeStudioId={null}
        onSwitchStudio={vi.fn()}
        onChooseLocale={vi.fn()}
        onSignOut={vi.fn()}
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
