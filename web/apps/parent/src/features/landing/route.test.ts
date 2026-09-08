import { describe, expect, it } from 'vitest'
import { landingSlugFor, landingViewHref, matchLandingPath } from './route'

describe('matchLandingPath', () => {
  it('matches §5.4a’s /t/{studio-slug}', () => {
    expect(matchLandingPath('/t/judo-tel-aviv')).toEqual({ slug: 'judo-tel-aviv', view: 'landing' })
  })

  it('tolerates a trailing slash, because a QR generator will add one', () => {
    expect(matchLandingPath('/t/judo-tel-aviv/')).toEqual({
      slug: 'judo-tel-aviv',
      view: 'landing',
    })
  })

  it('gives the booking form and the documents page an address of their own', () => {
    // Both are links a club hands out — the form from an advertisement, the documents from
    // a footer and from the consent tick — so both need a URL a visitor can be sent, can
    // bookmark, and can leave with the back button.
    expect(matchLandingPath('/t/judo-tel-aviv/trial')).toEqual({
      slug: 'judo-tel-aviv',
      view: 'trial',
    })
    expect(matchLandingPath('/t/judo-tel-aviv/legal')).toEqual({
      slug: 'judo-tel-aviv',
      view: 'legal',
    })
  })

  it('tolerates a trailing slash on the view segment too', () => {
    expect(matchLandingPath('/t/judo-tel-aviv/trial/')).toEqual({
      slug: 'judo-tel-aviv',
      view: 'trial',
    })
    expect(matchLandingPath('/t/judo-tel-aviv/legal/')).toEqual({
      slug: 'judo-tel-aviv',
      view: 'legal',
    })
  })

  it('refuses an unknown segment rather than falling back to the landing page', () => {
    // A mistyped or stale link must read as broken. `/t/judo-tel-aviv/tial` quietly
    // rendering the landing page hides the typo from whoever printed it, and from us.
    expect(matchLandingPath('/t/judo-tel-aviv/nope')).toBeNull()
    expect(matchLandingPath('/t/judo-tel-aviv/trial/extra')).toBeNull()
    // The view segment is matched literally, like the slug: no case folding.
    expect(matchLandingPath('/t/judo-tel-aviv/TRIAL')).toBeNull()
  })

  it('is a real path and not a hash, because this URL goes on a flyer', () => {
    // The other two apps route on location.hash. This one cannot: a hash is invisible to a
    // link preview and awkward inside a printed QR code.
    expect(matchLandingPath('/#/t/judo-tel-aviv')).toBeNull()
  })

  it('does not match the app’s own routes', () => {
    expect(matchLandingPath('/')).toBeNull()
    expect(matchLandingPath('/payments')).toBeNull()
    expect(matchLandingPath('/t')).toBeNull()
  })

  it('rejects a slug that could address a different endpoint', () => {
    // The slug reaches an API path. Anything with a separator, a dot or an escape in it is
    // a crafted link, not a club. Adding the view segment must not widen this: the two
    // literals are the only thing that may follow a slug.
    expect(matchLandingPath('/t/a/b')).toBeNull()
    expect(matchLandingPath('/t/..')).toBeNull()
    expect(matchLandingPath('/t/../trial')).toBeNull()
    expect(matchLandingPath('/t/a%2Fb')).toBeNull()
    expect(matchLandingPath('/t/a%2Fb/trial')).toBeNull()
    expect(matchLandingPath('/t/UPPER')).toBeNull()
  })
})

describe('landingSlugFor — the club at the apex (#25)', () => {
  // §5.4a ① puts the landing at `/t/{slug}` and that stays the canonical URL. #25 asks for
  // the club's shop window at `gladiatorclub.co.il` rather than under `app.`, and the root
  // of the parent app renders the sign-in wall — so DNS alone would point the apex at a
  // login box.
  //
  // **Keyed on the HOST, not on the path alone.** One Railway service answers for both
  // `app.` and the apex from a single build, so a rule that claimed every root would have
  // turned `app.gladiatorclub.co.il/` into a marketing page for parents who are already
  // members. The sign-in state cannot decide it either: `App()` resolves the public routes
  // before any session hook runs, deliberately, and the in-memory token is empty on a cold
  // load even for a returning parent — so that test would show the landing to a member
  // every time they opened the app fresh.
  const APEX = ['gladiatorclub.co.il', 'www.gladiatorclub.co.il']

  it('serves the configured club at the root of a landing host', () => {
    expect(landingSlugFor('/', 'gladiator', APEX, 'gladiatorclub.co.il')).toEqual({
      slug: 'gladiator',
      view: 'landing',
    })
    expect(landingSlugFor('/', 'gladiator', APEX, 'www.gladiatorclub.co.il')).toEqual({
      slug: 'gladiator',
      view: 'landing',
    })
  })

  it('serves the booking form and the documents from the same host’s bare paths', () => {
    // The apex is where the club's own links point, so `/trial` and `/legal` have to work
    // there as well as under `/t/{slug}` — otherwise the shop window's own call to action
    // would have to send visitors to a second domain.
    expect(landingSlugFor('/trial', 'gladiator', APEX, 'gladiatorclub.co.il')).toEqual({
      slug: 'gladiator',
      view: 'trial',
    })
    expect(landingSlugFor('/legal', 'gladiator', APEX, 'www.gladiatorclub.co.il')).toEqual({
      slug: 'gladiator',
      view: 'legal',
    })
    expect(landingSlugFor('/trial/', 'gladiator', APEX, 'gladiatorclub.co.il')).toEqual({
      slug: 'gladiator',
      view: 'trial',
    })
  })

  it('leaves the app host alone, which is the whole point', () => {
    // A signed-in parent opening `app.gladiatorclub.co.il` must reach their app, not the
    // club's advertisement — and `/trial` and `/legal` are no different: the parent app may
    // want those paths for itself one day, and only a landing host may claim them.
    expect(landingSlugFor('/', 'gladiator', APEX, 'app.gladiatorclub.co.il')).toBeNull()
    expect(landingSlugFor('/trial', 'gladiator', APEX, 'app.gladiatorclub.co.il')).toBeNull()
    expect(landingSlugFor('/legal', 'gladiator', APEX, 'app.gladiatorclub.co.il')).toBeNull()
  })

  it('serves nothing when no club or no host is configured', () => {
    // Every environment but production. `''` is what an unset build variable collapses to,
    // and it must never become a slug — `/t/` 404s against the API and would render a
    // refusal on the one page a stranger sees first. That holds for all three views: an
    // unconfigured build has no club whose trial form or documents these would be.
    expect(landingSlugFor('/', '', APEX, 'gladiatorclub.co.il')).toBeNull()
    expect(landingSlugFor('/', undefined, APEX, 'gladiatorclub.co.il')).toBeNull()
    expect(landingSlugFor('/', 'gladiator', [], 'gladiatorclub.co.il')).toBeNull()
    expect(landingSlugFor('/trial', '', APEX, 'gladiatorclub.co.il')).toBeNull()
    expect(landingSlugFor('/legal', undefined, APEX, 'gladiatorclub.co.il')).toBeNull()
    expect(landingSlugFor('/trial', 'gladiator', [], 'gladiatorclub.co.il')).toBeNull()
  })

  it('still prefers an explicit /t/{slug}, on any host', () => {
    // The canonical URL keeps working and keeps naming its own club. A flyer QR printed for
    // one club must not resolve to whichever club the build was configured with.
    expect(landingSlugFor('/t/other-club', 'gladiator', APEX, 'app.gladiatorclub.co.il')).toEqual({
      slug: 'other-club',
      view: 'landing',
    })
    expect(landingSlugFor('/t/other-club/trial', 'gladiator', APEX, 'gladiatorclub.co.il')).toEqual(
      { slug: 'other-club', view: 'trial' },
    )
  })

  it('leaves every other path alone', () => {
    expect(landingSlugFor('/join/abc', 'gladiator', APEX, 'gladiatorclub.co.il')).toBeNull()
    expect(landingSlugFor('/anything', 'gladiator', APEX, 'gladiatorclub.co.il')).toBeNull()
    // An unknown segment is not a view, here either.
    expect(landingSlugFor('/nope', 'gladiator', APEX, 'gladiatorclub.co.il')).toBeNull()
    expect(landingSlugFor('/trial/extra', 'gladiator', APEX, 'gladiatorclub.co.il')).toBeNull()
  })
})

describe('landingViewHref', () => {
  it('keeps a visitor inside the club whose link they followed', () => {
    expect(landingViewHref('/t/gladiator', 'trial')).toBe('/t/gladiator/trial')
    expect(landingViewHref('/t/gladiator', 'legal')).toBe('/t/gladiator/legal')
    // From one view to another, still inside the same club.
    expect(landingViewHref('/t/gladiator/trial', 'legal')).toBe('/t/gladiator/legal')
    expect(landingViewHref('/t/gladiator/legal', 'trial')).toBe('/t/gladiator/trial')
    expect(landingViewHref('/t/gladiator/trial', 'landing')).toBe('/t/gladiator')
  })

  it('stays on the short form at the root of a landing host', () => {
    expect(landingViewHref('/', 'trial')).toBe('/trial')
    expect(landingViewHref('/trial', 'legal')).toBe('/legal')
    expect(landingViewHref('/legal', 'landing')).toBe('/')
  })
})
