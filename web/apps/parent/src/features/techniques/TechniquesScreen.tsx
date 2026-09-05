/** The library. Search, the two families of judo, and one hairline list per sub-family.
 *
 * The arrangement is the student card's: labelled rows on a plain ground, not a grid of
 * cards. A hundred techniques as a hundred cards is a hundred objects; as one list it is
 * one reference.
 */
import { useMemo, useState } from 'react'
import type { Locale } from '@studio/i18n'
import { EmptyState, PageHeader, SectionHeader, SegmentedControl, TextField } from '@studio/ui'
import { familiesOf, searchTechniques } from './data'
import type { Category, Technique } from './types'
import { fillGroup, s } from './strings'
import './techniques.css'

function GokyoMark({ locale, group }: { locale: Locale; group: number | null }) {
  const outside = group === null
  return (
    <span
      aria-label={outside ? s(locale, 'gokyo.none') : fillGroup(s(locale, 'gokyo.group'), group)}
      className="studio-gokyo"
      data-outside={outside || undefined}
      role="img"
    >
      {/* The numeral, never a bare tint — "never colour alone". An em dash where the
          technique is outside the forty, so the mark is present either way and the rows
          do not jog left and right down the list. */}
      {outside ? '—' : group}
    </span>
  )
}

function TechniqueRow({ locale, technique }: { locale: Locale; technique: Technique }) {
  return (
    <a
      className="studio-technique-row"
      data-testid={`technique-row-${technique.slug}`}
      href={`#/techniques/${technique.slug}`}
    >
      <GokyoMark group={technique.gokyoGroup} locale={locale} />
      <span className="studio-technique-row__body">
        {/* The romaji leads: it is the name the coach calls out and the name written on
            the video. Hebrew and kanji sit under it. All of them in <bdi> — Latin and CJK
            inside an RTL line reorder without it, which is how `Seoi-nage · 背負投` comes
            out backwards. */}
        <span className="studio-technique-row__name">
          <bdi>{technique.nameRomaji}</bdi>
        </span>
        <span className="studio-technique-row__sub">
          <bdi>{`${technique.nameHebrew} · ${technique.nameKanji}`}</bdi>
        </span>
      </span>
      <span className="studio-technique-row__chevron">
        <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="16">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </span>
    </a>
  )
}

export function TechniquesScreen({ locale }: { locale: Locale }) {
  const [category, setCategory] = useState<Category>('nage-waza')
  const [query, setQuery] = useState('')

  // Search runs across BOTH categories, then the segmented control narrows the result.
  // Searching only inside the selected one means a child who types a hold while throws
  // are showing is told the technique does not exist.
  const families = useMemo(() => familiesOf(category, searchTechniques(query)), [category, query])
  const nothingAnywhere = useMemo(() => searchTechniques(query).length === 0, [query])

  return (
    <div className="studio-techniques">
      <PageHeader title={s(locale, 'title')} />

      <TextField
        label={s(locale, 'search.placeholder')}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={s(locale, 'search.example')}
        type="search"
        value={query}
      />

      <SegmentedControl
        legend={s(locale, 'title')}
        onValueChange={(next) => setCategory(next as Category)}
        options={[
          { value: 'nage-waza', label: s(locale, 'category.nage-waza.short') },
          { value: 'katame-waza', label: s(locale, 'category.katame-waza.short') },
        ]}
        value={category}
      />

      {nothingAnywhere ? (
        <EmptyState
          description={s(locale, 'search.empty.hint')}
          title={s(locale, 'search.empty.title')}
        />
      ) : families.length === 0 ? (
        /* Matches exist, just not on this side of the switch. Without this the screen
           renders a search box over nothing at all, which reads as "no such technique"
           when the technique is one tap away. */
        <EmptyState
          description={s(locale, 'search.elsewhere.hint')}
          title={s(locale, 'search.elsewhere.title')}
        />
      ) : (
        <div className="studio-techniques__families" data-testid="technique-families">
          {families.map((family) => (
            <section className="studio-techniques__family" key={family.subcategory}>
              <SectionHeader level={3} title={s(locale, `family.${family.subcategory}`)} />
              <div className="studio-techniques__rows">
                {family.techniques.map((technique) => (
                  <TechniqueRow key={technique.slug} locale={locale} technique={technique} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
