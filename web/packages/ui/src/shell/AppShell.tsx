// The shell both apps mount. §6.2 (staff) and §6.3 (parent) differ in what they put in
// the drawer, not in the frame around it.
//
// One <main>, one <header>, one drawer trigger with an accessible name and aria-expanded.
// The dev bar renders ABOVE the header, because §19.4's artboard puts it there and because
// a bar that pushes the app down is a bar you cannot mistake for part of the product.
import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { NavDrawer } from './NavDrawer'
import type { NavItem } from './NavDrawer'
import { StudioSwitcher } from './StudioSwitcher'
import type { SwitchableStudio } from './StudioSwitcher'

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  paddingBlock: 'var(--space-3)',
  paddingInline: 'var(--space-4)',
  borderBlockEnd: 'var(--border-width-hairline) solid var(--border)',
  background: 'var(--surface)',
}

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--text-title)',
  fontWeight: 600,
}

const mainStyle: CSSProperties = {
  padding: 'var(--space-4)',
}

const spacerStyle: CSSProperties = { marginInlineStart: 'auto' }

export function AppShell({
  title,
  items,
  studios = [],
  activeStudioId = null,
  onSwitchStudio,
  locale,
  devBar,
  drawerFooter,
  children,
}: {
  title: string
  items: NavItem[]
  studios?: SwitchableStudio[]
  activeStudioId?: string | null
  onSwitchStudio?: (studioId: string) => void
  locale: Locale
  devBar?: ReactNode
  drawerFooter?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {devBar}
      <header style={headerStyle}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="app-nav-drawer"
          onClick={() => setOpen(true)}
        >
          {t(locale, 'common.nav.menu')}
        </button>
        <h1 style={titleStyle}>{title}</h1>
        <span style={spacerStyle}>
          {onSwitchStudio ? (
            <StudioSwitcher
              studios={studios}
              activeStudioId={activeStudioId}
              onSwitch={onSwitchStudio}
              locale={locale}
            />
          ) : null}
        </span>
      </header>
      <div id="app-nav-drawer">
        <NavDrawer
          open={open}
          items={items}
          onClose={() => setOpen(false)}
          locale={locale}
          footer={drawerFooter}
        />
      </div>
      <main style={mainStyle}>{children}</main>
    </>
  )
}
