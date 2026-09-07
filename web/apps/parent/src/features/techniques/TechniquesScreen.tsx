/** The library. Search, the two families of judo, and one hairline list per sub-family.
 *
 * The arrangement is the student card's: labelled rows on a plain ground, not a grid of
 * cards. A hundred techniques as a hundred cards is a hundred objects; as one list it is
 * one reference.
 */
import { useMemo, useState } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { EmptyState, PageHeader, SectionHeader, SegmentedControl, TextField } from '@studio/ui'
import { familiesOf, searchTechniques, techniqueBySlug } from './data'
import { loadShelf, saveShelf, toggleFavourite } from './shelf'
import type { Category, Technique } from './types'
import { fill, fillGroup } from './format'
import './techniques.css'

function GokyoMark({ locale, group }: { locale: Locale; group: number | null }) {
  const outside = group === null
  return (
    <span
      aria-label={outside ? t(locale, 'techniques.gokyo.none') : fillGroup(t(locale, 'techniques.gokyo.group'), group)}
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

function TechniqueRow({
  locale,
  technique,
  saved,
  onToggle,
}: {
  locale: Locale
  technique: Technique
  saved: boolean
  onToggle: () => void
}) {
  return (
    <div className="studio-technique-row" data-testid={`technique-row-${technique.slug}`}>
      <a className="studio-technique-row__link" href={`#/techniques/${technique.slug}`}>
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
      {/* The name is IN the label. A hundred rows each offering "add" gives a screen
          reader user a hundred identical controls and no way to tell them apart. */}
      <button
        aria-label={fill(t(locale, saved ? 'techniques.shelf.remove.named' : 'techniques.shelf.add.named'), {
          name: technique.nameRomaji,
        })}
        aria-pressed={saved}
        className="studio-technique-row__add"
        data-testid={`add-${technique.slug}`}
        onClick={onToggle}
        type="button"
      >
        <svg aria-hidden="true" fill="none" height="19" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="19">
          {saved ? <path d="M20 6 9 17l-5-5" /> : <path d="M12 5v14M5 12h14" />}
        </svg>
      </button>
    </div>
  )
}

/**
 * What the switch is showing. `Category` itself stays exactly the two the sport has —
 * `SUBCATEGORIES` and `Technique.category` are keyed by it, and a third member called
 * "saved" would be a view state smuggled into the domain.
 */
type Shown = Category | 'saved'

export function TechniquesScreen({ locale }: { locale: Locale }) {
  // The shelf used to be reachable only by having already used it: it rendered above the
  // library when it had something in it, and a child who had never saved a technique had
  // nothing on screen telling them they could (owner, 2026-09-07). It is a segment now, so
  // it is visible before it is useful — which is the only way anybody finds it.
  const [shown, setShown] = useState<Shown>('nage-waza')
  const category: Category = shown === 'saved' ? 'nage-waza' : shown
  const [query, setQuery] = useState('')
  const [shelf, setShelf] = useState(loadShelf)

  const toggle = (slug: string) => {
    const next = toggleFavourite(shelf, slug)
    setShelf(next)
    saveShelf(next)
  }

  // A child's own techniques come FIRST and are not filtered by the category switch —
  // the list is theirs, and hiding half of it behind a segment they did not touch would
  // make the shelf look like it had lost something.
  const mine = useMemo(
    () => shelf.favourites.map(techniqueBySlug).filter((t) => t !== undefined),
    [shelf],
  )

  /** The shelf, narrowed by the search box — a child who searches while on their own list
   *  is asking about that list, not about the whole library. */
  const savedMatches = useMemo(() => {
    const matching = new Set(searchTechniques(query).map((technique) => technique.slug))
    return mine.filter((technique) => matching.has(technique.slug))
  }, [mine, query])

  // Search runs across BOTH categories, then the segmented control narrows the result.
  // Searching only inside the selected one means a child who types a hold while throws
  // are showing is told the technique does not exist.
  const families = useMemo(() => familiesOf(category, searchTechniques(query)), [category, query])
  const nothingAnywhere = useMemo(() => searchTechniques(query).length === 0, [query])

  return (
    <div className="studio-techniques">
      <PageHeader title={t(locale, 'techniques.title')} />

      <TextField
        label={t(locale, 'techniques.search.placeholder')}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t(locale, 'techniques.search.example')}
        type="search"
        value={query}
      />

      <SegmentedControl
        legend={t(locale, 'techniques.title')}
        onValueChange={(next) => setShown(next as Shown)}
        options={[
          { value: 'nage-waza', label: t(locale, 'techniques.category.nage-waza.short') },
          { value: 'katame-waza', label: t(locale, 'techniques.category.katame-waza.short') },
          { value: 'saved', label: t(locale, 'techniques.shelf.title') },
        ]}
        value={shown}
      />

      {shown !== 'saved' && mine.length > 0 && query === '' ? (
        <section className="studio-techniques__family" data-testid="my-techniques">
          <SectionHeader level={3} title={t(locale, 'techniques.shelf.title')} />
          <p className="studio-techniques__shelf-hint">{t(locale, 'techniques.shelf.hint')}</p>
          <div className="studio-techniques__rows">
            {mine.map((technique) => (
              <TechniqueRow
                key={technique.slug}
                locale={locale}
                onToggle={() => toggle(technique.slug)}
                saved
                technique={technique}
              />
            ))}
          </div>
        </section>
      ) : null}

      {shown === 'saved' ? (
        savedMatches.length === 0 ? (
          <EmptyState
            description={t(locale, 'techniques.shelf.empty.hint')}
            title={t(locale, 'techniques.shelf.empty.title')}
          />
        ) : (
          <section className="studio-techniques__family" data-testid="saved-techniques">
            <div className="studio-techniques__rows">
              {savedMatches.map((technique) => (
                <TechniqueRow
                  key={technique.slug}
                  locale={locale}
                  onToggle={() => toggle(technique.slug)}
                  saved
                  technique={technique}
                />
              ))}
            </div>
          </section>
        )
      ) : nothingAnywhere ? (
        <EmptyState
          description={t(locale, 'techniques.search.empty.hint')}
          title={t(locale, 'techniques.search.empty.title')}
        />
      ) : families.length === 0 ? (
        /* Matches exist, just not on this side of the switch. Without this the screen
           renders a search box over nothing at all, which reads as "no such technique"
           when the technique is one tap away. */
        <EmptyState
          description={t(locale, 'techniques.search.elsewhere.hint')}
          title={t(locale, 'techniques.search.elsewhere.title')}
        />
      ) : (
        <div className="studio-techniques__families" data-testid="technique-families">
          {families.map((family) => (
            <section className="studio-techniques__family" key={family.subcategory}>
              <SectionHeader level={3} title={t(locale, `techniques.family.${family.subcategory}`)} />
              <div className="studio-techniques__rows">
                {family.techniques.map((technique) => (
                  <TechniqueRow
                    key={technique.slug}
                    locale={locale}
                    onToggle={() => toggle(technique.slug)}
                    saved={shelf.favourites.includes(technique.slug)}
                    technique={technique}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
