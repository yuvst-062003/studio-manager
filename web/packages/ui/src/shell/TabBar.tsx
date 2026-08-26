// The bottom tab bar every phone artboard draws (parent 1a/1b, staff 9a/1c/1d) and
// neither shipped app had: four icon+label destinations, active in ink, on a hairline-
// topped surface. Links, not buttons — they are navigation, they survive the back button,
// and the app's routing philosophy is real hrefs throughout.
//
// Fixed to the viewport bottom with safe-area padding; the shell adds matching block-end
// padding to <main> so content never hides beneath it (`.studio-shell--tabbed`).
import type { ReactNode } from 'react'

export type TabBarItem = {
  key: string
  label: string
  /** Omit for an action item (e.g. staff's עוד opening the drawer) — renders a button. */
  href?: string
  icon: ReactNode
  active?: boolean
  onSelect?: () => void
}

export function TabBar({ items, label }: { items: TabBarItem[]; label: string }) {
  return (
    <nav aria-label={label} className="studio-tabbar" data-testid="tab-bar">
      <ul className="studio-tabbar__list">
        {items.map((item) => (
          <li key={item.key} className="studio-tabbar__slot">
            {item.href ? (
              <a
                href={item.href}
                aria-current={item.active ? 'page' : undefined}
                data-testid={`tab-${item.key}`}
                className={
                  item.active ? 'studio-tabbar__item studio-tabbar__item--active' : 'studio-tabbar__item'
                }
              >
                {item.icon}
                <span>{item.label}</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={item.onSelect}
                data-testid={`tab-${item.key}`}
                className="studio-tabbar__item"
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
