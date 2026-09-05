/** One technique.
 *
 * Order is deliberate: name, classification, then THE VIDEO, then the facts. A child
 * opened this to watch something, and metadata above the player would make them scroll
 * past the answer to reach it.
 */
import { useState } from 'react'
import type { Locale } from '@studio/i18n'
import { Button, DetailRow, EmptyState } from '@studio/ui'
import { ijfUrl, techniqueBySlug, videoUrl } from './data'
import { IjfSheet } from './IjfSheet'
import { fillGroup, s } from './strings'
import './techniques.css'

export function TechniqueDetail({ locale, slug }: { locale: Locale; slug: string }) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const technique = techniqueBySlug(slug)

  // A hand-typed or stale hash. Refuse plainly rather than render an empty shell.
  if (!technique) {
    return (
      <EmptyState
        action={
          <Button onClick={() => { globalThis.location.hash = '#/techniques' }} variant="secondary">
            {s(locale, 'detail.back')}
          </Button>
        }
        title={s(locale, 'search.empty.title')}
      />
    )
  }

  const video = videoUrl(technique)
  const ijf = ijfUrl(technique)
  const offline = !(globalThis.navigator?.onLine ?? true)

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
        <span className="studio-technique__chip">{s(locale, `category.${technique.category}`)}</span>
        <span className="studio-technique__chip">{s(locale, `family.${technique.subcategory}`)}</span>
        <span className="studio-technique__chip" data-gokyo={technique.gokyoGroup !== null || undefined}>
          {technique.gokyoGroup === null
            ? s(locale, 'gokyo.none')
            : fillGroup(s(locale, 'gokyo.group'), technique.gokyoGroup)}
        </span>
      </div>

      {/* Three states, and the two failures say which one they are. The Kodokan has
          published no video for Sasae-tsurikomi-ashi, which is NOT the same thing as the
          phone having no signal, and a child deserves to be told which. */}
      {video === null ? (
        <p className="studio-technique__player-missing" data-testid="video-missing">
          {s(locale, 'video.missing')}
        </p>
      ) : offline ? (
        <p className="studio-technique__player-missing" data-testid="video-offline">
          {s(locale, 'video.offline')}
        </p>
      ) : (
        <iframe
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="studio-technique__player"
          data-testid="technique-video"
          src={video}
          title={s(locale, 'video.title')}
        />
      )}

      {/* Ours, written from the Kodokan's definition of the MOVEMENT. Their sentences are
          theirs, and a translation of a sentence is still that sentence. */}
      {technique.descriptionHe ? (
        <p className="studio-technique__prose" data-testid="technique-description">
          {technique.descriptionHe}
        </p>
      ) : null}

      <div>
        <DetailRow label={s(locale, 'detail.category')}>
          {s(locale, `category.${technique.category}`)}
        </DetailRow>
        <DetailRow label={s(locale, 'detail.subcategory')}>
          {s(locale, `family.${technique.subcategory}`)}
        </DetailRow>
        <DetailRow label={s(locale, 'detail.gokyo')}>
          {technique.gokyoGroup === null
            ? s(locale, 'detail.gokyo.outside')
            : fillGroup(s(locale, 'detail.gokyo.value'), technique.gokyoGroup)}
        </DetailRow>
        <DetailRow label={s(locale, 'detail.meaning')}>{technique.meaning}</DetailRow>
      </div>

      {/* Offered ONLY where seeding confirmed the page returns 200. A control that opens
          a blank frame is worse than no control. */}
      {ijf ? (
        <Button data-testid="open-ijf" onClick={() => setSheetOpen(true)} variant="secondary">
          {s(locale, 'ijf.open')}
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
