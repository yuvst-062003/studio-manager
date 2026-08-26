import { describe, expect, it } from 'vitest'
import { matchLandingPath } from './route'

describe('matchLandingPath', () => {
  it('matches §5.4a’s /t/{studio-slug}', () => {
    expect(matchLandingPath('/t/judo-tel-aviv')).toEqual({ slug: 'judo-tel-aviv' })
  })

  it('tolerates a trailing slash, because a QR generator will add one', () => {
    expect(matchLandingPath('/t/judo-tel-aviv/')).toEqual({ slug: 'judo-tel-aviv' })
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
    // a crafted link, not a club.
    expect(matchLandingPath('/t/a/b')).toBeNull()
    expect(matchLandingPath('/t/..')).toBeNull()
    expect(matchLandingPath('/t/a%2Fb')).toBeNull()
    expect(matchLandingPath('/t/UPPER')).toBeNull()
  })
})
