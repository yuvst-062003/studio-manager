/** The dataset, and the three questions the screens ask of it.
 *
 * Seeded by `scripts/fetch_judo_techniques.py` from the Kodokan's official list and
 * committed, so the library works offline in the installed PWA and depends on nobody's
 * uptime. See that script for what may be taken from where.
 */
import raw from './data/techniques.json'
import type { Category, Subcategory, Technique } from './types'
import { SUBCATEGORIES } from './types'

export const TECHNIQUES: readonly Technique[] = raw as Technique[]

const BY_SLUG = new Map(TECHNIQUES.map((technique) => [technique.slug, technique]))

export function techniqueBySlug(slug: string): Technique | undefined {
  return BY_SLUG.get(slug)
}

/**
 * The form both a query and a name are compared in.
 *
 * Latin is lowercased and every separator dropped, so `Seoi-nage` is found by `seoi nage`,
 * `seoinage` and `Seoi-Nage` alike — a child types the name they heard, not the name as
 * the Kodokan punctuates it. Hebrew and kanji have no case to fold; their letters survive
 * the strip untouched, which is what lets one pass search all three scripts.
 */
function normalise(value: string): string {
  return value.toLowerCase().replace(/[^\p{Letter}\p{Number}]/gu, '')
}

/** Every name a technique answers to. */
function haystack(technique: Technique): string {
  return normalise(
    `${technique.nameRomaji}${technique.nameHebrew}${technique.nameKanji}${technique.meaning}`,
  )
}

const HAYSTACKS = new Map(TECHNIQUES.map((technique) => [technique.slug, haystack(technique)]))

export function searchTechniques(query: string, within: readonly Technique[] = TECHNIQUES): Technique[] {
  const needle = normalise(query)
  if (!needle) return [...within]
  return within.filter((technique) => HAYSTACKS.get(technique.slug)?.includes(needle))
}

export type Family = { subcategory: Subcategory; techniques: Technique[] }

/**
 * One category's techniques, grouped into its sub-families in the Kodokan's order.
 *
 * A family with nothing left in it after a search is dropped rather than rendered empty:
 * eight headings over one result is a screen that hides its own answer.
 */
export function familiesOf(category: Category, within: readonly Technique[] = TECHNIQUES): Family[] {
  return SUBCATEGORIES[category]
    .map((subcategory) => ({
      subcategory,
      techniques: within
        .filter((technique) => technique.subcategory === subcategory)
        .sort((a, b) => a.orderIndex - b.orderIndex),
    }))
    .filter((family) => family.techniques.length > 0)
}

/** The IJF page for a technique, or null where seeding could not confirm one exists. */
export function ijfUrl(technique: Technique): string | null {
  return technique.ijfSlug ? `https://judo.ijf.org/techniques/${technique.ijfSlug}` : null
}

/** The Kodokan's demonstration, or null where they have published none. */
export function videoUrl(technique: Technique): string | null {
  return technique.youtubeId ? `https://www.youtube-nocookie.com/embed/${technique.youtubeId}` : null
}
