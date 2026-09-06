/** The Kodokan demonstration, with the two controls that make it a study tool.
 *
 * **Slow motion.** A throw is three things happening at once and full speed shows none of
 * them. 0.5x is where a child can see the foot, the hand and the hip separately.
 *
 * **A start point.** These films open with a title card and a bow; the technique itself
 * begins later, and where differs per video. Nobody has annotated them, so rather than
 * invent timestamps the child sets their own and it is remembered — which is better than
 * a curated one anyway, because the moment worth re-watching is not the same for the
 * person learning the entry and the person fixing their finish.
 *
 * Both go through YouTube's postMessage interface with `enablejsapi=1`, NOT through their
 * IFrame API script. Loading `youtube.com/iframe_api` would add a third-party script to a
 * page children use, and the two commands needed here are three lines of postMessage.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { SegmentedControl } from '@studio/ui'
import { formatSeconds } from './shelf'

const ORIGIN = 'https://www.youtube-nocookie.com'
const SPEEDS = ['1', '0.75', '0.5'] as const

export function TechniquePlayer({
  locale,
  videoId,
  title,
  startAt,
  onStartAtChange,
}: {
  locale: Locale
  videoId: string
  title: string
  startAt: number
  onStartAtChange: (seconds: number | null) => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [speed, setSpeed] = useState<string>('1')
  // Null until the player has told us where it is. The "start here" control stays
  // disabled until then rather than saving a zero that silently undoes the feature.
  const [current, setCurrent] = useState<number | null>(null)

  const command = useCallback((func: string, args: unknown[] = []) => {
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), ORIGIN)
  }, [])

  // Registering as a listener is what makes YouTube start reporting `currentTime` back.
  // Without it the player is happy to receive commands and says nothing at all.
  const listen = useCallback(() => {
    frame.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'listening', id: videoId, channel: 'widget' }),
      ORIGIN,
    )
  }, [videoId])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== ORIGIN) return
      try {
        const data = JSON.parse(String(event.data)) as { info?: { currentTime?: number } }
        if (typeof data.info?.currentTime === 'number') setCurrent(data.info.currentTime)
      } catch {
        // Their player also sends messages that are not JSON. Not ours to care about.
      }
    }
    globalThis.addEventListener('message', onMessage)
    return () => globalThis.removeEventListener('message', onMessage)
  }, [])

  // The src carries the start, so changing it reloads the video at the new point — which
  // is the behaviour wanted. The speed does NOT survive that reload, so it is re-applied
  // whenever the frame loads rather than only when the control is used.
  const src = `${ORIGIN}/embed/${videoId}?enablejsapi=1&rel=0&start=${startAt}&origin=${globalThis.location?.origin ?? ''}`

  return (
    <div className="studio-technique__video">
      <iframe
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="studio-technique__player"
        data-testid="technique-video"
        onLoad={() => {
          listen()
          if (speed !== '1') command('setPlaybackRate', [Number(speed)])
        }}
        ref={frame}
        src={src}
        title={title}
      />

      <div className="studio-technique__controls">
        <SegmentedControl
          legend={t(locale, 'techniques.video.speed')}
          legendVisible
          onValueChange={(next) => {
            setSpeed(next)
            command('setPlaybackRate', [Number(next)])
          }}
          options={SPEEDS.map((value) => ({ value, label: `${value}×` }))}
          value={speed}
        />

        <div className="studio-technique__start">
          <span className="studio-technique__start-label">
            {startAt > 0
              ? `${t(locale, 'techniques.video.startsAt')} ${formatSeconds(startAt)}`
              : t(locale, 'techniques.video.startsAtBeginning')}
          </span>
          <span className="studio-technique__start-actions">
            <button
              className="studio-technique__link"
              data-testid="set-start"
              disabled={current === null}
              onClick={() => onStartAtChange(current)}
              type="button"
            >
              {t(locale, 'techniques.video.startHere')}
            </button>
            {startAt > 0 ? (
              <button
                className="studio-technique__link"
                data-testid="clear-start"
                onClick={() => onStartAtChange(null)}
                type="button"
              >
                {t(locale, 'techniques.video.startReset')}
              </button>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  )
}
