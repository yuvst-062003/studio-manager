// The launch (2026-09-17): what the parent sees between tapping the icon and the home.
//
// **What it replaces.** The club's navy launch image (iOS holds it until first paint) used
// to hand off to a CREAM page — `AuthedApp` rendered nothing while the session resolved,
// then a bare "טוען…" line while the family list loaded, then the home all at once. Three
// cuts, two of them to a blank. The owner brought a reference clip and asked for what a
// native app does: one ground from the icon to the home, and a home that arrives.
//
// **One overlay, one exit rule, and it never comes back.** This is a fixed, full-bleed
// cover over the shell. It leaves when BOTH are true: the app is ready underneath (see
// `launchReady`), and its own entrance has finished — so a fast phone does not show a
// half-drawn mark for 80ms and cut. That is the only floor there is: no minimum hold, no
// second screen. Once `onGone` fires the parent stops rendering it, and a session that
// later goes back to `loading` (a studio switch reloads it) cannot resurrect a launch.
//
// **Why the ground is a literal.** `#001849` is what `scripts/generate-splash.mjs` paints
// the iOS launch image, in both colour schemes on purpose ("the brand ground is the brand
// ground either way"). The token `--brand-primary` flips to light blue in dark mode and
// would put a blue frame after a navy image. Same reason, same value, same file to change.
//
// **What the 2026-09-08 revert taught.** A launch screen was built in front of this same
// splash and reverted eight commits later (b8b92a17): each commit fixed what the previous
// one revealed, while the owner's complaint — a white screen — was iOS's own fallback the
// whole time. That is fixed at the source now (flat navy images). This file is the plain
// version the revert said to start from: it paints the navy the image already showed,
// moves two things, and gets out of the way.
//
// **The pre-paint.** `index.html` draws the same navy and the same mark inline, so the
// ~100ms between the browser's first paint and React's is not a flash of cream. This
// component removes that element in a layout effect — same frame as its own first paint,
// pixel for pixel the same picture, so nothing is seen to change hands.
//
// **The home rises through `LaunchCover`.** A block mounted while the cover is up starts
// hidden and rises the frame the cover lifts; a block mounted with no cover is simply
// there. So the entrance plays once, on the launch — a tab switch back to home is not a
// launch and does not animate.
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

/** The entrance: the rule draws and the tagline rises. */
export const LAUNCH_ENTER_MS = 700
/** The exit: the whole cover fades and grows a little, the way an app icon opens. */
export const LAUNCH_EXIT_MS = 400

/** The iOS launch image's ground — see the header for why this is not a token. */
const GROUND = '#001849'
const RULE = '#c8161d'

/**
 * Whether the thing under the cover is a real first screen. Loading is not. Sign-in is.
 * A signed-in parent's shell is, once the two things every routed branch waits on have
 * arrived: the family list, and the consent gate under it — which renders NOTHING while it
 * loads and a real question while it holds. Neither is waited on when it will never come:
 * no parent access (the access gate shows its own refusal or redeems its own invitation),
 * or an invitation, which routes straight to the wizard.
 */
export function launchReady(
  session: { status: 'loading' | 'anonymous' | 'signed-in'; access: { parent: boolean } },
  gatedChildren: readonly unknown[] | null,
  invitedStudent: unknown | null,
  consentStatus: 'loading' | 'holding' | 'open',
): boolean {
  if (session.status === 'loading') return false
  if (session.status === 'anonymous') return true
  if (!session.access.parent) return true
  if (invitedStudent !== null) return true
  return gatedChildren !== null && consentStatus !== 'loading'
}

/** Where the launch cover is: over the shell, dissolving off it, or gone. Provided by
 *  `AuthedApp`; the default is `gone`, so a screen rendered anywhere else behaves as if the
 *  launch is long over. `lifting` is its own phase because the home's gates resolve a few
 *  milliseconds after the list that opens them — a block that mounts during the dissolve
 *  must still rise with it, or the entrance depends on a race it usually loses. */
export type LaunchPhase = 'up' | 'lifting' | 'gone'
export const LaunchCover = createContext<LaunchPhase>('gone')

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Whether a block has arrived. Mounted while the cover is up or lifting, it is `false`
 * until the cover is lifting, then flips one frame later so the transition has a start
 * value; mounted after the cover is gone — or under reduced motion — it is `true` from the
 * first render and nothing moves.
 */
export function useLaunchEntrance(): boolean {
  const phase = useContext(LaunchCover)
  const [still] = useState(prefersReducedMotion)
  const [entered, setEntered] = useState(still || phase === 'gone')
  useEffect(() => {
    if (entered || phase === 'up') return undefined
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [phase, entered])
  return entered
}

/** The rise every home block shares: up 12px and in, `delay` ms after the cover lifts.
 *  The arrived state is `transform: none`, not `translateY(0)` — a transform, even the
 *  identity, makes an ancestor the containing block of every `position: fixed` child. */
export function riseStyle(entered: boolean, delay: number): CSSProperties {
  return {
    opacity: entered ? 1 : 0,
    transform: entered ? 'none' : 'translateY(12px)',
    transition: `opacity 420ms var(--ease-standard) ${delay}ms, transform 420ms var(--ease-standard) ${delay}ms`,
  }
}

export type LaunchScreenProps = {
  locale: Locale
  /** `launchReady`, computed by the parent from what it holds. */
  ready: boolean
  /** The cover has started to lift: the shell may start its entrance. */
  onUncover: () => void
  /** The cover is gone: stop rendering this. */
  onGone: () => void
}

export function LaunchScreen({ locale, ready, onUncover, onGone }: LaunchScreenProps) {
  const [still] = useState(prefersReducedMotion)
  const [entered, setEntered] = useState(still)
  const [settled, setSettled] = useState(still)
  const [leaving, setLeaving] = useState(false)

  // The pre-paint, taken over in the same frame this first paints.
  useLayoutEffect(() => {
    document.getElementById('launch')?.remove()
  }, [])

  useEffect(() => {
    if (still) return undefined
    const frame = requestAnimationFrame(() => setEntered(true))
    const done = setTimeout(() => setSettled(true), LAUNCH_ENTER_MS)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(done)
    }
  }, [still])

  // Latched in state and set from a frame callback, not derived: `ready` may go false
  // again later (a session reload), and a cover that had started to leave must not return.
  useEffect(() => {
    if (leaving || !ready || !settled) return undefined
    const id = requestAnimationFrame(() => setLeaving(true))
    return () => cancelAnimationFrame(id)
  }, [leaving, ready, settled])

  const uncover = useRef(onUncover)
  const gone = useRef(onGone)
  useEffect(() => {
    uncover.current = onUncover
    gone.current = onGone
  }, [onUncover, onGone])

  useEffect(() => {
    if (!leaving) return undefined
    uncover.current()
    const id = setTimeout(() => gone.current(), still ? 0 : LAUNCH_EXIT_MS)
    return () => clearTimeout(id)
  }, [leaving, still])

  const ease = 'var(--ease-standard)'
  return (
    <div
      aria-hidden="true"
      data-testid="launch-screen"
      data-leaving={leaving ? 'true' : 'false'}
      style={{
        ...coverStyle,
        opacity: leaving ? 0 : 1,
        transform: leaving ? 'scale(1.05)' : 'none',
        transition: still ? 'none' : `opacity ${LAUNCH_EXIT_MS}ms ${ease}, transform ${LAUNCH_EXIT_MS}ms ${ease}`,
      }}
    >
      <div style={lockupStyle}>
        <span style={nameStyle}>{t(locale, 'common.brand.wordmark')}</span>
        <span style={clubStyle}>{t(locale, 'common.brand.club')}</span>
      </div>
      {/* Hung BELOW the centre line rather than centred with the lockup, so the lockup sits
          exactly where the launch image and the pre-paint put it — centred alone. */}
      <div style={tailStyle}>
        <span
          style={{
            ...ruleStyle,
            transform: entered ? 'scaleX(1)' : 'scaleX(0)',
            transition: still ? 'none' : `transform 500ms ${ease} 120ms`,
          }}
        />
        <p
          style={{
            ...taglineStyle,
            opacity: entered ? 1 : 0,
            transform: entered ? 'none' : 'translateY(6px)',
            transition: still ? 'none' : `opacity 450ms ${ease} 250ms, transform 450ms ${ease} 250ms`,
          }}
        >
          {t(locale, 'common.auth.tagline.parent')}
        </p>
      </div>
    </div>
  )
}

/** The lockup's size, in the geometry `scripts/generate-splash.mjs` rasterises: the main
 *  line at the sign-in wordmark's clamp, CLUB at 0.42 of it, 0.35 of it between them.
 *  Set on the cover so the tail below can be placed in the same `em`. */
const LOCKUP_SIZE = 'clamp(1.75rem, 9vw, 2.75rem)'

const coverStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 2000,
  display: 'grid',
  placeItems: 'center',
  fontSize: LOCKUP_SIZE,
  background: GROUND,
  color: '#fff',
  pointerEvents: 'none',
}

/** The same face as the sign-in mark (Archivo, Rubik behind it), so the cover dissolves
 *  into a sign-in screen wearing the same letters; tracked 0.18em and 0.32em like the
 *  image. LTR: Latin script in an RTL document. */
const lockupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.35em',
  direction: 'ltr',
}

/** Below the lockup: its half-height (1.77 of its size, over two) plus a breath — in the
 *  lockup's size, spelled out, because an `em` here would be this element's own. */
const tailStyle: CSSProperties = {
  position: 'absolute',
  insetInline: 0,
  top: `calc(50% + 1.25 * ${LOCKUP_SIZE})`,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-4)',
  fontSize: '1rem',
}

const nameStyle: CSSProperties = {
  font: "800 1em / 1 Archivo, 'Rubik Variable', sans-serif",
  letterSpacing: '0.18em',
  // Browsers add the tracking after the last glyph too; this pulls the line back to
  // true centre (the splash script measured the same half-space).
  marginInlineEnd: '-0.18em',
}

const clubStyle: CSSProperties = {
  font: "600 0.42em / 1 Archivo, 'Rubik Variable', sans-serif",
  letterSpacing: '0.32em',
  marginInlineEnd: '-0.32em',
  opacity: 0.7,
}

const ruleStyle: CSSProperties = {
  display: 'block',
  inlineSize: '2.5rem',
  blockSize: '2px',
  background: RULE,
  transformOrigin: 'center',
}

const taglineStyle: CSSProperties = {
  margin: 0,
  maxInlineSize: '20rem',
  paddingInline: 'var(--space-5)',
  textAlign: 'center',
  fontSize: 'var(--text-body)',
  lineHeight: 1.5,
  color: 'rgb(255 255 255 / 72%)',
}
