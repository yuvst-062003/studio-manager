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
import type { CSSProperties, ReactNode } from 'react'
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
  color: 'var(--fg)',
  textDecoration: 'none',
  borderRadius: 'var(--radius-md)',
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

  if (!open) return null

  return (
    <>
      {/* Presentational: the same dismissal is on Escape and on the close button, both of
          which a keyboard reaches. A backdrop with a role would announce a control that
          adds nothing. */}
      <div style={backdropStyle} onClick={onClose} data-testid="nav-backdrop" />
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
        ref={panelRef}
        role="dialog"
        style={drawerStyle}
        tabIndex={-1}
      >
        <button type="button" onClick={onClose}>
          {t(locale, 'common.nav.closeMenu')}
        </button>
        <nav aria-label={t(locale, 'common.nav.menu')}>
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
        </nav>
        {footer}
      </div>
    </>
  )
}
