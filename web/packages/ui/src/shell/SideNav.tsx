// The dashboard's persistent sidebar, ported from the canvas's own DashNav.dc.html:
// a 236px column — studio header, labeled groups of icon items with the active one as an
// ink pill, count badges where a number demands action (red solid = money, amber dashed =
// pending paperwork), settings pinned above a user footer.
//
// Desktop only by CSS (`.studio-sidenav` hides itself under 1024px); the drawer stays the
// narrow-viewport navigation, so nothing is reachable from exactly one width.
import type { ReactNode } from 'react'

export type SideNavBadge = { text: string; tone: 'red' | 'amber' | 'plain' }

export type SideNavItem = {
  key: string
  label: string
  href: string
  icon: ReactNode
  active?: boolean
  badge?: SideNavBadge
  /** One short sentence on what the screen is for (owner request 2026-08-30) — surfaces
   *  as the native hover tooltip and as the item's accessible description. */
  hint?: string
}

export type SideNavGroup = { key: string; label: string; items: SideNavItem[] }

function Item({ item }: { item: SideNavItem }) {
  return (
    <a
      href={item.href}
      title={item.hint}
      aria-description={item.hint}
      aria-current={item.active ? 'page' : undefined}
      data-testid={`sidenav-${item.key}`}
      className={item.active ? 'studio-sidenav__item studio-sidenav__item--active' : 'studio-sidenav__item'}
    >
      {item.icon}
      <span className="studio-sidenav__label">{item.label}</span>
      {item.badge ? (
        <span className={`studio-sidenav__badge studio-sidenav__badge--${item.badge.tone}`}>
          {item.badge.text}
        </span>
      ) : null}
    </a>
  )
}

export function SideNav({
  label,
  studioName,
  studioNote,
  groups,
  settingsItem,
  appearance,
  footer,
}: {
  label: string
  studioName: string
  /** The line under the club name — the canvas shows branch count; we show the role of the surface. */
  studioNote?: string
  groups: SideNavGroup[]
  settingsItem?: SideNavItem
  /**
   * A preference control that belongs to the whole app rather than to a screen — today the
   * light/dark/system switch, which had nowhere else to go on this surface.
   *
   * The drawer footer is where the other two apps put it, and the sidebar exists precisely
   * because the drawer's trigger is hidden at these widths: a control passed only to
   * `drawerFooter` is a control the dashboard's own users can never open. Not an item and
   * not a link — it changes nothing about where you are, so it must not sit in a list of
   * places to go.
   */
  appearance?: ReactNode
  /** The signed-in person: name + role line, per the canvas footer. */
  footer?: { name: string; note?: string }
}) {
  return (
    <nav aria-label={label} className="studio-sidenav" data-testid="side-nav">
      <div className="studio-sidenav__studio">
        <div className="studio-sidenav__mark" aria-hidden="true" />
        <div className="studio-sidenav__studio-text">
          <div className="studio-sidenav__studio-name">{studioName}</div>
          {studioNote ? <div className="studio-sidenav__studio-note">{studioNote}</div> : null}
        </div>
      </div>
      <div className="studio-sidenav__scroll">
        {groups.map((group) => (
          <div key={group.key} className="studio-sidenav__group">
            <div className="studio-sidenav__group-label">{group.label}</div>
            {group.items.map((item) => (
              <Item key={item.key} item={item} />
            ))}
          </div>
        ))}
      </div>
      {settingsItem ? (
        <div className="studio-sidenav__pinned">
          <Item item={settingsItem} />
        </div>
      ) : null}
      {appearance ? <div className="studio-sidenav__appearance">{appearance}</div> : null}
      {footer ? (
        <div className="studio-sidenav__footer">
          <div className="studio-sidenav__avatar" aria-hidden="true" />
          <div className="studio-sidenav__footer-text">
            <div className="studio-sidenav__footer-name">{footer.name}</div>
            {footer.note ? <div className="studio-sidenav__footer-note">{footer.note}</div> : null}
          </div>
        </div>
      ) : null}
    </nav>
  )
}
