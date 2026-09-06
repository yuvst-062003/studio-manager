/** One technique.
 *
 * Order is deliberate: name, classification, then THE VIDEO, then the facts. A child
 * opened this to watch something, and metadata above the player would make them scroll
 * past the answer to reach it.
 */
import { useState } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { Button, DetailRow, EmptyState } from '@studio/ui'
import { ijfUrl, techniqueBySlug } from './data'
import { IjfSheet } from './IjfSheet'
import { TechniquePlayer } from './TechniquePlayer'
import { loadShelf, saveShelf, setStartAt, toggleFavourite } from './shelf'
import { fillGroup } from './format'
import './techniques.css'

export function TechniqueDetail({ locale, slug }: { locale: Locale; slug: string }) {
  const [sheetOpen, setSheetOpen] = useState(false)
  // Read once on mount, not on every render: `localStorage` is synchronous and this
  // screen re-renders on every playback message the player receives.
  const [shelf, setShelf] = useState(loadShelf)
  const technique = techniqueBySlug(slug)

  // A hand-typed or stale hash. Refuse plainly rather than render an empty shell.
  if (!technique) {
    return (
      <EmptyState
        action={
          <Button onClick={() => { globalThis.location.hash = '#/techniques' }} variant="secondary">
            {t(locale, 'techniques.detail.back')}
          </Button>
        }
        title={t(locale, 'techniques.search.empty.title')}
      />
    )
  }

  const ijf = ijfUrl(technique)
  const offline = !(globalThis.navigator?.onLine ?? true)
  const saved = shelf.favourites.includes(technique.slug)

  const update = (next: typeof shelf) => {
    setShelf(next)
    saveShelf(next)
  }

  return (
    <article className="studio-technique" data-testid={`technique-${technique.slug}`}>
      <header className="studio-technique__hero">
        <h1 className="studio-technique__name">
          <bdi>{technique.nameRomaji}</bdi>
        </h1>
        <span className="studio-technique__sub">
          <bdi>{`${technique.nameHebrew} · ${technique.nameKanji}`}</bdi>
        </span>
      </header>

      <div className="studio-technique__chips">
        <span className="studio-technique__chip">{t(locale, `techniques.category.${technique.category}`)}</span>
        <span className="studio-technique__chip">{t(locale, `techniques.family.${technique.subcategory}`)}</span>
        <span className="studio-technique__chip" data-gokyo={technique.gokyoGroup !== null || undefined}>
          {technique.gokyoGroup === null
            ? t(locale, 'techniques.gokyo.none')
            : fillGroup(t(locale, 'techniques.gokyo.group'), technique.gokyoGroup)}
        </span>
      </div>

      {/* Three states, and the two failures say which one they are. The Kodokan has
          published no video for Sasae-tsurikomi-ashi, which is NOT the same thing as the
          phone having no signal, and a child deserves to be told which. */}
      {technique.youtubeId === null ? (
        <p className="studio-technique__player-missing" data-testid="video-missing">
          {t(locale, 'techniques.video.missing')}
        </p>
      ) : offline ? (
        <p className="studio-technique__player-missing" data-testid="video-offline">
          {t(locale, 'techniques.video.offline')}
        </p>
      ) : (
        <TechniquePlayer
          locale={locale}
          onStartAtChange={(seconds) => update(setStartAt(shelf, technique.slug, seconds))}
          startAt={shelf.startAt[technique.slug] ?? 0}
          title={t(locale, 'techniques.video.title')}
          videoId={technique.youtubeId}
        />
      )}

      {/* Tokui-waza — judo's own word for the technique you make your own. `aria-pressed`
          rather than two labels: it is one control in two states, and a screen reader
          should say so. */}
      <button
        aria-pressed={saved}
        className="studio-technique__save"
        data-testid="save-technique"
        onClick={() => update(toggleFavourite(shelf, technique.slug))}
        type="button"
      >
        <svg aria-hidden="true" fill={saved ? 'currentColor' : 'none'} height="17" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24" width="17">
          <path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />
        </svg>
        {saved ? t(locale, 'techniques.shelf.saved') : t(locale, 'techniques.shelf.add')}
      </button>

      {/* Ours, written from the Kodokan's definition of the MOVEMENT. Their sentences are
          theirs, and a translation of a sentence is still that sentence. */}
      {technique.descriptionHe ? (
        <p className="studio-technique__prose" data-testid="technique-description">
          {technique.descriptionHe}
        </p>
      ) : null}

      <div>
        <DetailRow label={t(locale, 'techniques.detail.category')}>
          {t(locale, `techniques.category.${technique.category}`)}
        </DetailRow>
        <DetailRow label={t(locale, 'techniques.detail.subcategory')}>
          {t(locale, `techniques.family.${technique.subcategory}`)}
        </DetailRow>
        <DetailRow label={t(locale, 'techniques.detail.gokyo')}>
          {technique.gokyoGroup === null
            ? t(locale, 'techniques.detail.gokyo.outside')
            : fillGroup(t(locale, 'techniques.detail.gokyo.value'), technique.gokyoGroup)}
        </DetailRow>
        <DetailRow label={t(locale, 'techniques.detail.meaning')}>{technique.meaning}</DetailRow>
      </div>

      {/* Offered ONLY where seeding confirmed the page returns 200. A control that opens
          a blank frame is worse than no control. */}
      {ijf ? (
        <Button data-testid="open-ijf" onClick={() => setSheetOpen(true)} variant="secondary">
          {t(locale, 'techniques.ijf.open')}
        </Button>
      ) : null}

      {sheetOpen && ijf ? (
        <IjfSheet
          locale={locale}
          onClose={() => setSheetOpen(false)}
          title={technique.nameRomaji}
          url={ijf}
        />
      ) : null}
    </article>
  )
}
