// The technique library: the dataset, the two screens, and the seam between them.
//
// The seam test is the one that matters and the one CLAUDE.md names: a screen test that
// builds its own props proves the component, not the wiring. `data → list → detail →
// player src` is asserted end to end below with a real slug, because a field dropped
// anywhere along that path is invisible to every other test in this file.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { TECHNIQUES, familiesOf, ijfUrl, searchTechniques, techniqueBySlug, videoUrl } from './data'
import { matchTechniquesPath } from './index'
import { TechniqueDetail } from './TechniqueDetail'
import { TechniquesScreen } from './TechniquesScreen'
import { SUBCATEGORIES } from './types'

// The Kodokan's own counts, printed in the headings of the page the seeder reads. A
// silent drift here means the source changed shape and the scrape half-worked.
const EXPECTED = {
  te: 16, koshi: 10, ashi: 21, 'ma-sutemi': 5, 'yoko-sutemi': 16,
  osaekomi: 10, shime: 12, kansetsu: 10,
} as const

describe('the dataset', () => {
  it('holds the Kodokan’s hundred, family by family', () => {
    expect(TECHNIQUES).toHaveLength(100)
    for (const [subcategory, count] of Object.entries(EXPECTED)) {
      expect(TECHNIQUES.filter((technique) => technique.subcategory === subcategory)).toHaveLength(count)
    }
  })

  it('gives every technique a slug that is unique and a name in all three scripts', () => {
    expect(new Set(TECHNIQUES.map((technique) => technique.slug)).size).toBe(TECHNIQUES.length)
    for (const technique of TECHNIQUES) {
      expect(technique.slug, technique.slug).toMatch(/^[a-z0-9-]+$/)
      expect(technique.nameRomaji, technique.slug).not.toBe('')
      // Without the Hebrew name the search box is ornamental for the child this screen
      // is for -- they will not type `Seoi-nage` in Latin script.
      expect(technique.nameHebrew, technique.slug).toMatch(/\p{Script=Hebrew}/u)
      expect(technique.nameKanji, technique.slug).toMatch(/[一-鿿]/u)
      expect(technique.descriptionHe, technique.slug).toMatch(/\p{Script=Hebrew}/u)
      expect(technique.meaning, technique.slug).toMatch(/\p{Script=Hebrew}/u)
    }
  })

  it('keeps every classification inside its own category', () => {
    for (const technique of TECHNIQUES) {
      expect(SUBCATEGORIES[technique.category], technique.slug).toContain(technique.subcategory)
      expect(technique.gokyoGroup === null || (technique.gokyoGroup >= 1 && technique.gokyoGroup <= 5)).toBe(true)
    }
  })

  it('carries a well-formed video id wherever it claims to have one', () => {
    for (const technique of TECHNIQUES) {
      if (technique.youtubeId !== null) expect(technique.youtubeId, technique.slug).toMatch(/^[A-Za-z0-9_-]{11}$/)
    }
  })

  it('allows a technique with no video, because one really has none', () => {
    // Sasae-tsurikomi-ashi is a Gokyo 1 throw the Kodokan has published no video for.
    // Keying the scrape on the video link dropped it entirely; this is the regression.
    const sasae = techniqueBySlug('sasae-tsurikomi-ashi')
    expect(sasae).toBeDefined()
    expect(sasae?.gokyoGroup).toBe(1)
    expect(videoUrl(sasae!)).toBeNull()
  })

  it('offers an IJF link only where seeding confirmed the page exists', () => {
    for (const technique of TECHNIQUES) {
      const url = ijfUrl(technique)
      if (technique.ijfSlug === null) expect(url).toBeNull()
      else expect(url).toBe(`https://judo.ijf.org/techniques/${technique.ijfSlug}`)
    }
  })

  it('puts all forty Gokyo throws among the throws, and none among the holds', () => {
    const gokyo = TECHNIQUES.filter((technique) => technique.gokyoGroup !== null)
    expect(gokyo).toHaveLength(40)
    expect(gokyo.every((technique) => technique.category === 'nage-waza')).toBe(true)
  })
})

describe('search', () => {
  it('finds one technique by romaji, Hebrew and kanji alike', () => {
    for (const query of ['Seoi-nage', 'seoinage', 'seoi nage', 'סאוי נגה', '背負投']) {
      expect(searchTechniques(query).map((technique) => technique.slug), query).toContain('seoi-nage')
    }
  })

  it('returns everything for an empty query', () => {
    expect(searchTechniques('   ')).toHaveLength(100)
  })

  it('drops a family that has nothing left in it', () => {
    const families = familiesOf('nage-waza', searchTechniques('kesa'))
    expect(families).toHaveLength(0)
  })
})

describe('the route', () => {
  it.each([
    ['#/techniques', { kind: 'list' }],
    ['#/techniques/seoi-nage', { kind: 'detail', slug: 'seoi-nage' }],
    ['#/techniques/', { kind: 'list' }],
  ])('reads %s', (hash, expected) => {
    expect(matchTechniquesPath(hash)).toEqual(expected)
  })

  it.each(['#/payments', '#/', '#/technique/seoi-nage', ''])('ignores %s', (hash) => {
    expect(matchTechniquesPath(hash)).toBeNull()
  })
})

describe('the library screen', () => {
  it('groups the throws into the Kodokan’s families', () => {
    render(<TechniquesScreen locale="he" />)
    const families = screen.getByTestId('technique-families')
    expect(within(families).getByRole('heading', { name: /טה־וואזה/ })).toBeInTheDocument()
    expect(within(families).getByRole('heading', { name: /אשי־וואזה/ })).toBeInTheDocument()
    // Holds are behind the other segment, not on this screen.
    expect(within(families).queryByRole('heading', { name: /שימה־וואזה/ })).not.toBeInTheDocument()
  })

  it('narrows to a single row as a child types the Hebrew name', async () => {
    const user = userEvent.setup()
    render(<TechniquesScreen locale="he" />)
    await user.type(screen.getByRole('searchbox'), 'סאוי נגה')
    expect(screen.getByTestId('technique-row-seoi-nage')).toBeInTheDocument()
    expect(screen.queryByTestId('technique-row-o-soto-gari')).not.toBeInTheDocument()
  })

  it('says so rather than showing an empty screen when the match is in the other category', async () => {
    const user = userEvent.setup()
    render(<TechniquesScreen locale="he" />)
    // A hold, while the throws are showing. The screen must not read as "no such thing".
    await user.type(screen.getByRole('searchbox'), 'kesa')
    expect(screen.getByText('אין התאמה בקטגוריה הזו')).toBeInTheDocument()
  })

  it('refuses a name that is in no category at all', async () => {
    const user = userEvent.setup()
    render(<TechniquesScreen locale="he" />)
    await user.type(screen.getByRole('searchbox'), 'zzzz')
    expect(screen.getByText('לא מצאנו טכניקה בשם הזה')).toBeInTheDocument()
  })

  it('wraps Latin and kanji in <bdi> so an RTL row does not scramble', () => {
    render(<TechniquesScreen locale="he" />)
    const row = screen.getByTestId('technique-row-seoi-nage')
    const isolated = [...row.querySelectorAll('bdi')].map((node) => node.textContent)
    expect(isolated).toContain('Seoi-nage')
    expect(isolated).toContain('סאוי נגה · 背負投')
  })

  it('marks the Gokyo group with its numeral and not colour alone', () => {
    render(<TechniquesScreen locale="he" />)
    const row = screen.getByTestId('technique-row-seoi-nage')
    expect(within(row).getByRole('img', { name: 'גוקיו 1' })).toHaveTextContent('1')
  })
})

describe('the detail screen', () => {
  it('carries the technique from the dataset all the way into the player src', () => {
    // THE SEAM. Nothing here is hand-built: the id is read from the dataset and asserted
    // where it lands on screen, so a field dropped between JSON, `videoUrl` and the
    // iframe fails here and nowhere else.
    const technique = techniqueBySlug('o-soto-gari')!
    expect(technique.youtubeId).toBeTruthy()

    render(<TechniqueDetail locale="he" slug="o-soto-gari" />)

    expect(screen.getByTestId('technique-video')).toHaveAttribute(
      'src',
      `https://www.youtube-nocookie.com/embed/${technique.youtubeId}`,
    )
    expect(screen.getByTestId('technique-description')).toHaveTextContent(technique.descriptionHe)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(technique.nameRomaji)
  })

  it('says the Kodokan has no video, rather than showing an empty player', () => {
    render(<TechniqueDetail locale="he" slug="sasae-tsurikomi-ashi" />)
    expect(screen.getByTestId('video-missing')).toBeInTheDocument()
    expect(screen.queryByTestId('technique-video')).not.toBeInTheDocument()
  })

  it('opens the IJF sheet with its attribution on the face of it', async () => {
    const user = userEvent.setup()
    render(<TechniqueDetail locale="he" slug="seoi-nage" />)
    await user.click(screen.getByTestId('open-ijf'))
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByText('התוכן מאתר judo.ijf.org')).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: 'פתיחה בדפדפן' })).toHaveAttribute(
      'href',
      ijfUrl(techniqueBySlug('seoi-nage')!),
    )
  })

  it('refuses an unknown slug instead of rendering an empty shell', () => {
    render(<TechniqueDetail locale="he" slug="not-a-technique" />)
    expect(screen.getByText('לא מצאנו טכניקה בשם הזה')).toBeInTheDocument()
  })
})
