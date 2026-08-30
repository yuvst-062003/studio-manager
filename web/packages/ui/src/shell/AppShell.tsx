// The shell all three apps mount. §6.2 (staff) and §6.3 (parent) differ in what they put
// in the drawer, not in the frame around it — and since the design pass the frame also
// carries the navigation every artboard draws: a bottom `tabBar` on the phone apps
// (1a/9a) and a persistent `sideNav` on the dashboard (DashNav), each rendered only when
// the app passes one in, so nothing changes for a caller that doesn't.
//
// One <main>, one <header>, one drawer trigger with an accessible name and aria-expanded.
// The drawer stays even beside a sidebar — it is the narrow-viewport navigation; CSS
// hides its trigger at sidebar widths so there is one door per viewport, not two.
// The dev bar renders ABOVE the header, because §19.4's artboard puts it there and
// because a bar that pushes the app down is a bar you cannot mistake for part of the
// product.
import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { Icon } from '../primitives/Icon'
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

/* Sized to the title line, never the image: an uploaded logo arrives in any aspect
   ratio, and `object-fit: contain` inside a fixed box is what keeps a tall crest and a
   wide wordmark from moving the header's height. */
const logoStyle: CSSProperties = {
  blockSize: '1.75rem',
  inlineSize: '1.75rem',
  objectFit: 'contain',
  borderRadius: 'var(--radius-sm)',
  flexShrink: 0,
}

const mainStyle: CSSProperties = {
  padding: 'var(--space-4)',
  flex: 1,
}

/* Pushed to the inline-end — the far side from the nav, which in an RTL document is the
   left. A flex row so the search and the studio switcher sit on one line. */
const spacerStyle: CSSProperties = {
  marginInlineStart: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
}

export function AppShell({
  title,
  logoUrl = null,
  items,
  studios = [],
  activeStudioId = null,
  onSwitchStudio,
  locale,
  devBar,
  drawerFooter,
  headerEnd,
  sideNav,
  tabBar,
  children,
}: {
  title: string
  /** The club's logo, shown beside the title. Decorative — the title IS the name, so the
   *  img carries an empty alt rather than repeating it to a screen reader. */
  logoUrl?: string | null
  items: NavItem[]
  studios?: SwitchableStudio[]
  activeStudioId?: string | null
  onSwitchStudio?: (studioId: string) => void
  locale: Locale
  devBar?: ReactNode
  drawerFooter?: ReactNode
  /**
   * App-wide controls that belong to the CHROME rather than to a screen — the dashboard's
   * global search. Rendered in the header on the inline-end, beside the studio switcher.
   *
   * It exists because the search was passed as a child and therefore rendered inside
   * `<main>`: it moved with each screen's layout, sat in a different place on every one of
   * them, and read as part of the page rather than as part of the app.
   */
  headerEnd?: ReactNode
  /** Desktop sidebar (dashboard). Hidden by its own CSS under 1024px. */
  sideNav?: ReactNode
  /** Bottom tab bar (phone apps). The main area pads itself so content clears it. A
   *  function form receives the drawer control, so a bar can carry the staff app's עוד
   *  item (9e — "אותה מגירה") without the drawer state leaving this shell. */
  tabBar?: ReactNode | ((controls: { openDrawer: () => void }) => ReactNode)
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const tabBarNode = typeof tabBar === 'function' ? tabBar({ openDrawer: () => setOpen(true) }) : tabBar

  const shellClass = [
    'studio-shell',
    sideNav ? 'studio-shell--sidenav' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const contentClass = [
    'studio-shell__content',
    tabBarNode ? 'studio-shell--tabbed' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      {devBar}
      <div className={shellClass}>
        {sideNav}
        <div className={contentClass}>
          <header style={headerStyle}>
            <button
              type="button"
              className="studio-shell__drawer-button"
              aria-expanded={open}
              aria-controls="app-nav-drawer"
              onClick={() => setOpen(true)}
            >
              <Icon name="menu" size={20} />
              {t(locale, 'common.nav.menu')}
            </button>
            {logoUrl ? (
              <img alt="" data-testid="shell-logo" src={logoUrl} style={logoStyle} />
            ) : null}
            <h1 style={titleStyle}>{title}</h1>
            <span style={spacerStyle}>
              {headerEnd}
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
        </div>
      </div>
      {tabBarNode}
    </>
  )
}
