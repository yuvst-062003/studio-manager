import { expect, test } from '@playwright/test'

import { ORIGINS } from '../origins'
import { personas } from './api'
import { signInAs } from './auth'

/**
 * The fixture's own gate.
 *
 * It is a spec rather than a helper nobody exercises, because all fifteen tests stand on
 * it: if `signInAs` silently lands on the sign-in screen instead of the shell, every flow
 * fails somewhere far from the cause, on an assertion about a roster or a charge. This
 * file makes that failure land here, with a name on it.
 *
 * Nothing here resets — `global-setup.ts` did that once for the run, and says why.
 */
test.describe('the E2E fixture', () => {
  test('reads back the nine §19.3 personas', async ({ request }) => {
    const cast = await personas(request)

    expect(Object.keys(cast)).toHaveLength(9)
    expect(cast.manager.roles).toEqual(['manager'])
    // §3.1 — 'guardian is not a role'. parent3 carries none and is a guardian, and the two
    // facts travel separately for exactly that reason.
    expect(cast.parent3.roles).toEqual([])
    expect(cast.parent3.is_guardian).toBe(true)
    // §19.3's assistant coach exists to prove no financial data leaks, so its role matters.
    expect(cast.assistant.roles).toEqual(['assistant_coach'])
  })

  test('signs a browser context in as a persona and lands inside the app', async ({
    context,
    page,
  }) => {
    await signInAs(context, 'manager', 'dashboard')

    await page.goto(`${ORIGINS.dashboard}/`)

    // `AppShell` renders one <header> and one <main>; `SignIn` renders neither — it is a
    // bare list of provider <a>s. So the banner role distinguishes 'the cookie arrived'
    // from 'the cookie was set somewhere the app cannot see it', which is precisely the
    // failure a host-only cookie produces when it is set on the wrong origin.
    //
    // A role and not a testid: `AppShell` carries none, and it lives in `packages/ui`,
    // which this lane must not edit. The role is the better anchor anyway — it is what a
    // screen reader navigates by, so it cannot be renamed without someone noticing.
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
  })
})
