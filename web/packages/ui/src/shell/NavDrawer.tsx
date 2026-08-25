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
import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export type NavItem = {
  key: string
  /** G4 — a key into the i18n bundle, never a literal. */
  labelKey: string
  href: string
  icon?: ReactNode
}

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
  color: 'var(--text)',
  textDecoration: 'none',
  borderRadius: 'var(--radius-2)',
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
  const panelRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    globalThis.addEventListener('keydown', onKeyDown)
    // Focus moves into the drawer, or a keyboard user opens a menu and stays outside it.
    panelRef.current?.focus()
    return () => globalThis.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Presentational: the same dismissal is on Escape and on the close button, both of
          which a keyboard reaches. A backdrop with a role would announce a control that
          adds nothing. */}
      <div style={backdropStyle} onClick={onClose} data-testid="nav-backdrop" />
      <nav
        aria-label={t(locale, 'common.nav.menu')}
        ref={panelRef}
        style={drawerStyle}
        tabIndex={-1}
      >
        <button type="button" onClick={onClose}>
          {t(locale, 'common.nav.closeMenu')}
        </button>
        <ul style={listStyle}>
          {items.map((item) => (
            <li key={item.key}>
              <a href={item.href} style={linkStyle}>
                {item.icon}
                {t(locale, item.labelKey)}
              </a>
            </li>
          ))}
        </ul>
        {footer}
      </nav>
    </>
  )
}
