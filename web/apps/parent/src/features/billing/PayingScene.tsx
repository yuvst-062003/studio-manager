// The tap-to-pay scene inside the paid moment (2026-09-17). A card terminal settles in, a
// club card slides onto its reader, and a check draws on the terminal's screen — then the
// words rise underneath, in `PaymentSettled`. The owner asked for exactly this beat, from a
// reference clip of a card-ordering app: the payment is SHOWN happening, not announced.
//
// **Drawn, not loaded.** One SVG built from an isometric projection, so the body, its two
// visible faces, the receipt and the card all share one geometry and one origin. Nothing
// here is an asset: there is no illustration to fetch, so the scene is on screen the same
// frame the moment is.
//
// **Coloured from the surface, not by hex.** The moment's ground is `--brand-primary` and its
// ink is `--brand-on-primary` — navy and white on the light scheme, light blue and navy on
// the dark one. Every fill below is one of those two or a mix of them, so the terminal is a
// pale body on navy in light mode and a navy body on blue in dark mode, and never a black
// box on a black ground. The check is the ledger's own settled pair, `--paid` on
// `--paid-tint`, which is the one green that passes on both schemes.
//
// **Three beats, one clock.** The terminal arrives, then the card, then the check — each a
// CSS transition delayed by the sum of the ones before it, all keyed on the single `entered`
// flag `PaymentSettled` already flips one frame after mount. `SCENE_TOTAL_MS` is exported so
// the words know when to start, and a test holds the moment's entry to at least that long.
// Reduced motion (`still`) renders the final frame with no transitions at all: the terminal,
// the card in place, the check drawn — the information without the movement.
import { useId } from 'react'
import type { CSSProperties } from 'react'

/** The terminal fading and settling into place. */
export const SCENE_TERMINAL_MS = 500
/** The card's slide onto the reader. */
export const SCENE_CARD_MS = 600
/** The check drawing on the terminal's screen. */
export const SCENE_CHECK_MS = 350
export const SCENE_TOTAL_MS = SCENE_TERMINAL_MS + SCENE_CARD_MS + SCENE_CHECK_MS

/** The club's own mark, printed on the card. Served from the parent app's `public/`. */
const CREST = '/clubs/gladiator-logo.png'

// The projection. x runs to the lower right, y to the lower left, z straight up — the
// standard 30° isometric, so the top face is a 2:1 diamond.
const COS = 0.866
const SIN = 0.5
/** Where (0, 0, 0) lands in the viewBox. */
const ORIGIN = { x: 160, y: 96 }

/** Terminal body, in scene units: width along x, depth along y, height along z. */
const W = 112
const D = 184
const H = 20

/** One scene point projected onto the viewBox. */
function project(x: number, y: number, z: number): { px: number; py: number } {
  return { px: ORIGIN.x + (x - y) * COS, py: ORIGIN.y + (x + y) * SIN - z }
}

/** The same point, as an SVG `points` fragment. */
function iso(x: number, y: number, z: number): string {
  const { px, py } = project(x, y, z)
  return `${px.toFixed(1)},${py.toFixed(1)}`
}

/** The receipt's printed lines: each one's x-extent along the paper and its height. */
const PRINT_LINES = [
  { from: 36, to: 76, z: 44 },
  { from: 36, to: 62, z: 36 },
  { from: 36, to: 76, z: 28 },
]

/** Where the card starts, in top-face units: up and to the far side, off the terminal. */
const CARD_FROM = { x: -92, y: -54 }

const BODY = 'color-mix(in srgb, var(--brand-on-primary) 94%, var(--brand-primary))'
const FRONT = 'color-mix(in srgb, var(--brand-on-primary) 78%, var(--brand-primary))'
const SIDE = 'color-mix(in srgb, var(--brand-on-primary) 64%, var(--brand-primary))'
const KEY = 'var(--brand-on-primary)'
const KEY_EDGE = 'color-mix(in srgb, var(--brand-on-primary) 70%, var(--brand-primary))'
const PAD = 'color-mix(in srgb, var(--brand-on-primary) 84%, var(--brand-primary))'
const PAD_MARK = 'color-mix(in srgb, var(--brand-on-primary) 55%, var(--brand-primary))'
const PAPER = 'var(--brand-on-primary)'
const PRINT = 'color-mix(in srgb, var(--brand-primary) 35%, var(--brand-on-primary))'
const SHADOW = 'color-mix(in srgb, var(--brand-primary) 40%, transparent)'

export type PayingSceneProps = {
  /** Flipped one frame after mount by the moment; every transition moves away from `false`. */
  entered: boolean
  /** `prefers-reduced-motion`: render the last frame, transition nothing. */
  still: boolean
}

export function PayingScene({ entered, still }: PayingSceneProps) {
  //: Two scenes never render at once, but an SVG id is document-global and a hard-coded one
  //: is the kind of thing that breaks the day a second caller appears.
  const clipId = useId()
  const ease = 'var(--ease-standard)'
  const cardEase = 'cubic-bezier(0.2, 0.8, 0.2, 1)'
  const cardDelay = SCENE_TERMINAL_MS
  const checkDelay = SCENE_TERMINAL_MS + SCENE_CARD_MS

  const terminalStyle: CSSProperties = {
    opacity: entered ? 1 : 0,
    transform: entered ? 'translateY(0)' : 'translateY(14px)',
    transition: still
      ? 'none'
      : `opacity ${SCENE_TERMINAL_MS}ms ${ease}, transform ${SCENE_TERMINAL_MS}ms ${ease}`,
  }
  const cardStyle: CSSProperties = {
    opacity: entered ? 1 : 0,
    transform: entered ? 'translate(0, 0)' : `translate(${CARD_FROM.x}px, ${CARD_FROM.y}px)`,
    transition: still
      ? 'none'
      : `opacity 200ms ${ease} ${cardDelay}ms, transform ${SCENE_CARD_MS}ms ${cardEase} ${cardDelay}ms`,
  }
  const screenStyle: CSSProperties = {
    fill: entered ? 'var(--paid-tint)' : 'var(--brand-primary)',
    transition: still ? 'none' : `fill ${SCENE_CHECK_MS}ms ${ease} ${checkDelay}ms`,
  }
  const checkStyle: CSSProperties = {
    strokeDasharray: 48,
    strokeDashoffset: entered ? 0 : 48,
    transition: still ? 'none' : `stroke-dashoffset ${SCENE_CHECK_MS}ms ${ease} ${checkDelay}ms`,
  }

  return (
    <svg
      aria-hidden="true"
      data-testid="paying-scene"
      data-entered={entered ? 'true' : 'false'}
      style={sceneStyle}
      viewBox="0 0 320 256"
    >
      <defs>
        <clipPath id={clipId}>
          <rect height="60" rx="8" width="96" x="8" y="4" />
        </clipPath>
      </defs>

      <g data-testid="paying-terminal" style={terminalStyle}>
        {/* The receipt, standing up from the far edge. Drawn first so the body's top face
            sits over its root. */}
        <polygon
          fill={PAPER}
          points={`${iso(28, 0, H)} ${iso(84, 0, H)} ${iso(84, 0, H + 50)} ${iso(28, 0, H + 58)}`}
        />
        {PRINT_LINES.map(({ from, to, z }) => {
          const a = project(from, 0, H + z)
          const b = project(to, 0, H + z)
          return (
            <line
              key={z}
              stroke={PRINT}
              strokeLinecap="round"
              strokeWidth="2.2"
              x1={a.px}
              x2={b.px}
              y1={a.py}
              y2={b.py}
            />
          )
        })}

        {/* The two faces the viewer sees: the near-left one (y = D) and the near-right one
            (x = W). Each a shade darker than the top, which is what reads as depth. */}
        <polygon
          fill={FRONT}
          points={`${iso(0, D, H)} ${iso(W, D, H)} ${iso(W, D, 0)} ${iso(0, D, 0)}`}
        />
        <polygon
          fill={SIDE}
          points={`${iso(W, 0, H)} ${iso(W, D, H)} ${iso(W, D, 0)} ${iso(W, 0, 0)}`}
        />

        {/* The top face and everything on it, in its own plane: one affine matrix and the
            screen, the keys and the card are drawn as plain rectangles. */}
        <g transform={`matrix(${COS} ${SIN} ${-COS} ${SIN} ${ORIGIN.x} ${ORIGIN.y - H})`}>
          <rect fill={BODY} height={D} rx="6" width={W} x="0" y="0" />

          {/* The reader pad at the far end — a shallow recess with the contactless mark, so
              before the card arrives there is visibly somewhere for it to land. */}
          <rect fill={PAD} height="60" rx="8" width="96" x="8" y="4" />
          <g fill="none" stroke={PAD_MARK} strokeLinecap="round" strokeWidth="2">
            <path d="M52 29 a6 6 0 0 1 0 10" />
            <path d="M56 25 a11 11 0 0 1 0 18" />
            <path d="M60 21 a16 16 0 0 1 0 26" />
          </g>

          {/* The screen, below the pad. Ground-coloured until the check lands, then the
              settled tint. */}
          <rect height="42" rx="6" style={screenStyle} width="88" x="12" y="74" />
          <path
            d="M43 96 L53 106 L70 86"
            data-testid="paying-check"
            fill="none"
            stroke="var(--paid)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="5"
            style={checkStyle}
          />

          {/* Nine keys. The last one is the green one every terminal has. */}
          {[126, 145, 164].map((y, row) =>
            [16, 44, 72].map((x, col) => {
              const confirm = row === 2 && col === 2
              return (
                <rect
                  key={`${row}-${col}`}
                  fill={confirm ? 'var(--paid)' : KEY}
                  height="14"
                  rx="4"
                  stroke={confirm ? 'none' : KEY_EDGE}
                  strokeWidth="1"
                  width="24"
                  x={x}
                  y={y}
                />
              )
            }),
          )}

          {/* The club card. Its rest position is the reader pad, and it arrives from up and
              away, along the terminal's own diagonal. */}
          <g data-testid="paying-card" style={cardStyle}>
            <rect fill={SHADOW} height="60" rx="8" width="96" x="12" y="9" />
            <rect fill={KEY} height="60" rx="8" width="96" x="8" y="4" />
            <g clipPath={`url(#${clipId})`}>
              <rect fill="var(--brand-primary)" height="14" width="96" x="8" y="4" />
            </g>
            {/* Contactless — three arcs, the way every card prints them. */}
            <g fill="none" stroke="var(--brand-primary)" strokeLinecap="round" strokeWidth="2">
              <path d="M84 30 a6 6 0 0 1 0 10" />
              <path d="M88 26 a11 11 0 0 1 0 18" />
              <path d="M92 22 a16 16 0 0 1 0 26" />
            </g>
            <image height="24" href={CREST} width="24" x="14" y="34" />
          </g>
        </g>
      </g>
    </svg>
  )
}

const sceneStyle: CSSProperties = {
  display: 'block',
  inlineSize: 'min(18rem, 72vw)',
  blockSize: 'auto',
  overflow: 'visible',
  marginBlockEnd: 'var(--space-2)',
}
