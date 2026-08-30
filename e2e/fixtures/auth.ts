/**
 * §19.4's role switcher, entered from a URL, which is the only door a browser can use.
 *
 * `POST /dev/act-as/{person_id}` mints a persona session too, but it returns a bearer token
 * in a JSON body and a browser has nowhere to put one: `setAccessToken` is module-scoped in
 * `packages/core/src/identity/session.ts`, deliberately unreachable from a console, and
 * `useSession` bootstraps from the §11.7 refresh cookie alone. `GET /dev/sign-in-as/{key}`
 * ends where the real OAuth callback ends — a refresh cookie and a redirect — so this suite
 * establishes a session the same way a person does.
 *
 * ── Hit the APP's origin, never the API's ─────────────────────────────────────────────
 * The refresh cookie is host-only by design (`set_refresh_cookie`: "There is no `domain=`
 * here and there must never be one"). A cookie set while talking to `127.0.0.1:8000` is
 * invisible to a page on `localhost:5174`. Every app's Vite config proxies `/api` to the
 * backend, so going in through the app's own origin puts the cookie exactly where the app
 * will look for it.
 *
 * ── One context holds one persona ─────────────────────────────────────────────────────
 * Cookies are not port-scoped. `localhost:5173`, `:5174` and `:5175` share a single jar, so
 * signing in as a coach on staff and a manager on dashboard inside one `BrowserContext`
 * leaves whichever came last holding both. The four cross-app flows therefore use one
 * context per person — which is what they are: two different people looking at two
 * different screens, not one person with two sessions.
 */

import type { BrowserContext, Page } from '@playwright/test'

import { ORIGINS } from '../origins'
import type { AppName } from '../origins'
import type { PersonaKey } from './api'

/**
 * Sign `context` in as `persona`, with the cookie scoped where `app` will find it.
 *
 * `maxRedirects: 0` because the 307 is the assertion: it means the persona resolved and the
 * cookie was set. Following it would fetch the app's index.html through an API client for
 * no reason, and would turn a 404 from an unknown persona into a confusing 200.
 */
export async function signInAs(
  context: BrowserContext,
  persona: PersonaKey,
  app: AppName,
  returnPath = '/',
): Promise<void> {
  const response = await context.request.get(
    `${ORIGINS[app]}/api/v1/dev/sign-in-as/${persona}`,
    { params: { app, return_path: returnPath }, maxRedirects: 0 },
  )
  if (response.status() !== 307) {
    throw new Error(
      `sign-in-as ${persona} (${app}) answered ${response.status()}, expected 307: ` +
        `${(await response.text()).slice(0, 400)}`,
    )
  }
}


/**
 * §6.1's payment step, stood down the way the screen offers — `אחר כך`.
 *
 * It sits inside the two hard gates and in front of every routed branch, so a family with an
 * open charge who has not said how they will pay reaches no other screen. Pressed rather than
 * seeded: that button is the product's own answer to "not now", and a spec that bypassed it
 * would not notice it breaking.
 *
 * Tolerant of absence, because whether a family owes anything depends on the scenario —
 * `months: 0` raises no charge and the gate never appears. Awaited rather than probed with
 * `isVisible()`: the gate renders after `/me/students` resolves, so an immediate probe
 * answers "not there" and the caller then waits out its own timeout on a covered screen.
 */
export async function dismissPaymentSetup(page: Page): Promise<void> {
  const later = page.getByTestId('setup-later')
  await later
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => later.click())
    .catch(() => undefined)
}
