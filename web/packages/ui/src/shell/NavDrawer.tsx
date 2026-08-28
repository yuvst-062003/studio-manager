// The nav drawer. SPEC §9 and .claude/rules/ui-rtl-a11y.md.
//
// This is the one component in M1 whose LAYOUT is direction-dependent, so G12's ban on
// physical CSS properties matters here more than anywhere else: `inset-inline-start` puts
// the drawer on the right in Hebrew and on the left in English, and `left:` would put it
// in the wrong place in exactly one of the two locales the club actually uses.
//
// Closed means NOT RENDERED, never moved off-screen. An off-screen drawer is still in the
// tab order and still read aloud by a screen reader — a keyboard user would tab into a
// menu they cannot see.
//
// **The slider (owner request, 2026-08-28).** Three behaviours in one pass:
//   1. Choosing an item CLOSES the drawer as it navigates. Hash navigation swaps the
//      screen behind the scrim, so a drawer that stayed open read as "the menu is stuck".
//   2. The drawer slides in (CSS, direction-scoped keyframes, skipped entirely under
//      prefers-reduced-motion).
//   3. A finger can DRAG it closed: the panel follows the pointer toward its own edge,
//      releases past a third of its width dismiss it, shorter drags snap back. A 12px
//      slop gate keeps taps on the links and the footer's controls working — a tap never
//      crosses it, so nothing here competes with a click.
// Tap-dismissals (backdrop, close button, an item) unmount INSTANTLY — the not-rendered
// invariant holds at rest; only the gesture path animates the exit, because there the
// panel is already under the finger.
import { useRef } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { t } from '@studio/i18n'
// Sibling module rather than the barrel: importing '.' from inside the package is a cycle.
import { useModalDialog } from '../useModalDialog'
import type { Locale } from '@studio/i18n'

export type NavItem = {
  key: string
  /** G4 — a key into the i18n bundle, never a literal. */
  labelKey: string
  href: string
  icon?: ReactNode
}

/** Movement below this is a tap; past it, a drag. iOS uses ~10px for the same gate. */
const DRAG_SLOP_PX = 12

/** Release past this share of the panel's width dismisses; under it snaps back. */
const DISMISS_FRACTION = 0.35

/** jsdom (and a mid-layout browser frame) can answer 0 for the panel width; a zero
 *  threshold would turn every twitch into a dismissal. */
const FALLBACK_WIDTH_PX = 320

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--scrim)',
  zIndex: 100,
}

const drawerStyle: CSSProperties = {
  position: 'fixed',
  insetBlock: 0,
  insetInlineStart: 0,
  zIndex: 101,
  inlineSize: 'min(80vw, 20rem)',
  padding: 'var(--space-4)',
  background: 'var(--surface)',
  borderInlineEnd: 'var(--border-width-hairline) solid var(--border)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  // The panel scrolls its own overflow; a vertical pan must stay the browser's, or the
  // drag handler would fight every scroll of a long footer.
  touchAction: 'pan-y',
}

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
}

const linkStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  paddingBlock: 'var(--space-3)',
  paddingInline: 'var(--space-3)',
  // §6.2 — 'large tap targets ... no interaction requiring precision'. 44px is the
  // smallest target iOS treats as reliably hittable, and a coach is using this on a mat.
  minBlockSize: '44px',
  color: 'var(--fg)',
  textDecoration: 'none',
  borderRadius: 'var(--radius-md)',
}

type DragState = {
  pointerId: number
  startX: number
  /** false until the slop gate is crossed; taps live and die below it. */
  dragging: boolean
  /** +1 when the drawer exits toward +x (RTL, inline-start = right), −1 in LTR. */
  exitSign: 1 | -1
  width: number
  progress: number
}

export function NavDrawer({
  open,
  items,
  onClose,
  locale,
  footer,
}: {
  open: boolean
  items: NavItem[]
  onClose: () => void
  locale: Locale
  footer?: ReactNode
}) {
  // Replaces this component's own Escape listener and one-shot `panelRef.focus()`. Both
  // were correct as far as they went and neither TRAPPED Tab, so a keyboard user could
  // walk out of an open drawer into the page it was covering, and neither RESTORED focus
  // on close, so dismissing the menu dropped them at the top of the document.
  const panelRef = useModalDialog(open, onClose)
  const drag = useRef<DragState | null>(null)
  const dismissing = useRef(false)

  if (!open) return null

  const panel = () => panelRef.current

  const onPointerDown = (event: ReactPointerEvent) => {
    if (dismissing.current) return
    const element = panel()
    if (!element) return
    // `direction` read at gesture start, not module load: the locale switcher in the
    // footer can flip it while the app runs.
    const rtl = getComputedStyle(element).direction === 'rtl'
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      dragging: false,
      exitSign: rtl ? 1 : -1,
      width: element.getBoundingClientRect().width || FALLBACK_WIDTH_PX,
      progress: 0,
    }
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    const state = drag.current
    const element = panel()
    if (!state || !element || event.pointerId !== state.pointerId) return
    const delta = event.clientX - state.startX
    // Movement toward the drawer's own edge counts; the other way is a stretch nobody
    // asked for and the panel stays put.
    const toward = delta * state.exitSign
    if (!state.dragging) {
      if (Math.abs(delta) < DRAG_SLOP_PX) return
      state.dragging = true
      // Captured only once it IS a drag, so plain taps never lose their click.
      element.setPointerCapture?.(event.pointerId)
      element.style.transition = 'none'
    }
    state.progress = Math.max(0, toward)
    element.style.transform = `translateX(${state.progress * state.exitSign}px)`
  }

  const settle = (element: HTMLElement, state: DragState) => {
    element.releasePointerCapture?.(state.pointerId)
    if (state.progress >= state.width * DISMISS_FRACTION) {
      // The finger already carried the panel partway; finish its sentence, then unmount.
      dismissing.current = true
      element.style.transition = 'transform var(--motion-fast) var(--ease-standard)'
      element.style.transform = `translateX(${state.width * state.exitSign}px)`
      element.style.pointerEvents = 'none'
      window.setTimeout(onClose, 130)
    } else {
      element.style.transition = 'transform var(--motion-fast) var(--ease-standard)'
      element.style.transform = 'translateX(0)'
    }
  }

  const onPointerUp = (event: ReactPointerEvent) => {
    const state = drag.current
    const element = panel()
    drag.current = null
    if (!state || !element || !state.dragging || event.pointerId !== state.pointerId) return
    settle(element, state)
  }

  const onPointerCancel = () => {
    const state = drag.current
    const element = panel()
    drag.current = null
    if (!state || !element || !state.dragging) return
    element.style.transition = 'transform var(--motion-fast) var(--ease-standard)'
    element.style.transform = 'translateX(0)'
  }

  return (
    <>
      {/* Presentational: the same dismissal is on Escape and on the close button, both of
          which a keyboard reaches. A backdrop with a role would announce a control that
          adds nothing. */}
      <div
        className="studio-drawer-backdrop"
        style={backdropStyle}
        onClick={onClose}
        data-testid="nav-backdrop"
      />
      {/* Two roles, two elements, and that is the reason for the extra div. The drawer draws
          a full-viewport backdrop, so it IS modal and has to say so — but `role="dialog"` on
          the <nav> REPLACES its implicit `navigation` role rather than adding to it, and one
          element cannot be both. The dialog is the container; the menu inside it stays a nav,
          so a screen-reader user still finds it under landmarks.

          `aria-modal="true"` and the focus trap arrive together: the attribute alone told
          assistive technology the page behind was unavailable while Tab still walked out of
          the drawer into it. */}
      <div
        aria-label={t(locale, 'common.nav.menu')}
        aria-modal="true"
        className="studio-drawer"
        ref={panelRef}
        role="dialog"
        style={drawerStyle}
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <button type="button" onClick={onClose}>
          {t(locale, 'common.nav.closeMenu')}
        </button>
        <nav aria-label={t(locale, 'common.nav.menu')}>
          <ul style={listStyle}>
            {items.map((item) => (
              <li key={item.key}>
                {/* Choosing a destination is a dismissal: the hash swaps the screen
                    behind the scrim, and a drawer that lingered over it read as stuck.
                    onClick fires alongside the anchor's own navigation, not instead. */}
                <a href={item.href} style={linkStyle} onClick={onClose}>
                  {item.icon}
                  {t(locale, item.labelKey)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {footer}
      </div>
    </>
  )
}
